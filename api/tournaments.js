// /api/tournaments — клановые турниры (хранятся в Upstash KV одним ключом).
// GET  → { tournaments, isOwner, ownerDetect, me }   (только для вошедших)
// POST → { action: create|finish|reopen|join|leave|delete, ... }
//   create/finish/reopen/delete — только у кого на сервере роль Owner
//   (DISCORD_ROLE_OWNER, отдельная от combat/support/lead/recruiter).
const crypto = require("node:crypto");
const { getSession, json, kv, kvConfigured, hasOwnerRole, avatarUrl } = require("./_lib");

const KEY = "axl:tournaments";

// Vercel обычно кладёт разобранный JSON в req.body; на всякий случай
// умеем дочитать поток сами.
const readBody = (req) =>
  new Promise((resolve) => {
    if (req.body !== undefined) {
      if (typeof req.body === "string") {
        try {
          resolve(JSON.parse(req.body));
        } catch {
          resolve({});
        }
      } else {
        resolve(req.body || {});
      }
      return;
    }
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });

const load = async () => {
  try {
    return JSON.parse((await kv(["GET", KEY])) || "[]") || [];
  } catch {
    return [];
  }
};

const save = (list) => kv(["SET", KEY, JSON.stringify(list)]);

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "unauthorized" });
  if (!kvConfigured()) return json(res, 503, { error: "kv_missing" });

  // hasOwnerRole() бросает исключение, если DISCORD_ROLE_OWNER не задан
  // или бот не смог получить данные сервера — раньше такая ошибка тихо
  // превращалась в isOwner:false для всех без единой подсказки, что
  // сломано. Теперь причина видна на фронте через ownerDetect.
  let isOwner = false;
  let ownerDetect = "ok";
  try {
    isOwner = await hasOwnerRole(session.i);
  } catch (e) {
    ownerDetect = e.status === 0 ? "unconfigured" : "failed";
  }

  if (req.method === "GET") {
    return json(res, 200, { tournaments: await load(), isOwner, ownerDetect, me: session.i });
  }
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  const body = await readBody(req);
  const list = await load();

  if (body.action === "create") {
    if (!isOwner) return json(res, 403, { error: "owner_only" });
    const title = String(body.title || "").trim().slice(0, 80);
    if (!title) return json(res, 400, { error: "title_required" });
    const t = {
      id: crypto.randomUUID(),
      title,
      prize: String(body.prize || "").trim().slice(0, 60) || null,
      startsAt: String(body.startsAt || "").trim().slice(0, 60) || null,
      slots: Math.min(200, Math.max(0, parseInt(body.slots, 10) || 0)) || null,
      players: [],
      status: "active",
      winner: null,
      createdAt: Date.now(),
    };
    list.unshift(t);
    await save(list);
    return json(res, 200, { ok: true, tournament: t });
  }

  const t = list.find((x) => x.id === body.id);
  if (!t) return json(res, 404, { error: "not_found" });

  if (body.action === "delete") {
    if (!isOwner) return json(res, 403, { error: "owner_only" });
    await save(list.filter((x) => x.id !== t.id));
    return json(res, 200, { ok: true });
  }

  // Завершить турнир — переносит его в архив (необязательно с победителем);
  // "reopen" возвращает обратно в активные, если завершили по ошибке.
  if (body.action === "finish") {
    if (!isOwner) return json(res, 403, { error: "owner_only" });
    t.status = "done";
    t.finishedAt = Date.now();
    t.winner = String(body.winner || "").trim().slice(0, 80) || null;
    await save(list);
    return json(res, 200, { ok: true });
  }

  if (body.action === "reopen") {
    if (!isOwner) return json(res, 403, { error: "owner_only" });
    t.status = "active";
    t.finishedAt = null;
    await save(list);
    return json(res, 200, { ok: true });
  }

  if (body.action === "join") {
    if (t.status === "done") return json(res, 409, { error: "finished" });
    if (!t.players.some((p) => p.id === session.i)) {
      if (t.slots && t.players.length >= t.slots) return json(res, 409, { error: "full" });
      t.players.push({
        id: session.i,
        name: session.g || session.u,
        avatar: avatarUrl(session.i, session.a),
      });
      await save(list);
    }
    return json(res, 200, { ok: true });
  }

  if (body.action === "leave") {
    t.players = t.players.filter((p) => p.id !== session.i);
    await save(list);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: "bad_action" });
};
