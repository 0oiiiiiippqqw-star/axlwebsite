// GET /api/members — состав клана с Discord-сервера (только для вошедших).
// Требует у бота включённый привилегированный интент "Server Members".
const { getSession, json, fetchGuildMembers, resolveRole, avatarUrl } = require("./_lib");

// Кэш на тёплую лямбду: список меняется редко, Discord API щадим.
let cache = { at: 0, data: null };
const CACHE_MS = 60_000;

module.exports = async (req, res) => {
  if (!getSession(req)) return json(res, 401, { error: "unauthorized" });

  if (cache.data && Date.now() - cache.at < CACHE_MS) {
    return json(res, 200, { members: cache.data });
  }

  try {
    const raw = await fetchGuildMembers();

    // Показываем всех людей с сервера; у кого нет клановой роли из
    // DISCORD_ROLE_* — role: null, фронт рисует их как «Участник».
    const members = raw
      .map((m) => ({
        id: m.user.id,
        globalName: m.nick || m.user.global_name || m.user.username,
        username: m.user.username,
        role: resolveRole(m.roles || []),
        joinedAt: m.joined_at,
        avatar: avatarUrl(m.user.id, m.user.avatar),
      }))
      .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

    cache = { at: Date.now(), data: members };
    json(res, 200, { members });
  } catch (e) {
    // Расшифровка для фронта: какая именно часть настройки Discord не сошлась.
    const code =
      e.status === 0
        ? "bot_token_missing"
        : e.status === 401
          ? "bot_token_invalid"
          : e.status === 403
            ? "bot_forbidden" // нет Server Members Intent или бот не добавлен на сервер
            : "discord_unavailable";
    json(res, 502, { error: code });
  }
};
