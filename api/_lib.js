// ============================================================================
// AXL API — общие помощники для serverless-функций (Vercel, Node runtime).
// Без зависимостей: только node:crypto и fetch.
//
// Обязательные переменные окружения (Vercel → Settings → Environment Variables):
//   SESSION_SECRET         — длинная случайная строка для подписи сессий
//   DISCORD_CLIENT_ID      — OAuth2-приложение Discord
//   DISCORD_CLIENT_SECRET
//   DISCORD_BOT_TOKEN      — бот, добавленный на сервер клана (интент Server Members!)
//   DISCORD_GUILD_ID       — ID Discord-сервера клана
// Роли (ID ролей на сервере; участник без одной из них не попадает в «Поиск»):
//   DISCORD_ROLE_COMBAT, DISCORD_ROLE_SUPPORT, DISCORD_ROLE_LEAD,
//   DISCORD_ROLE_RECRUITER — «Проверяющий»: рекламирует клан и набирает людей
// Steam (опционально, но нужно для имени/часов; без ключа хранится только ID):
//   STEAM_API_KEY          — https://steamcommunity.com/dev/apikey
// Хранилище привязок Steam (опционально — Upstash Redis, бесплатный тариф):
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//   Если не задано, привязка хранится в подписанной куке (работает, но только
//   в том браузере, где её сделали).
// ============================================================================
const crypto = require("node:crypto");

const SESSION_COOKIE = "axl_session";
const STEAM_COOKIE = "axl_steam";
const STATE_COOKIE = "axl_oauth_state";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 дней

const DISCORD_API = "https://discord.com/api/v10";
const RUST_APP_ID = 252490;

// ---------- подписанные токены (HMAC-SHA256) ----------

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
};

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
};

const verify = (token) => {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
};

// ---------- куки ----------

const parseCookies = (req) => {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
};

// Secure не мешает локальной разработке: браузеры считают localhost безопасным.
const cookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const clearCookie = (name) => cookie(name, "", 0);

const getSession = (req) => verify(parseCookies(req)[SESSION_COOKIE]);

// ---------- ответы ----------

// cacheControl можно переопределить для публичных эндпоинтов (CDN-кэш Vercel).
const json = (res, code, data, cacheControl) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl || "no-store");
  res.end(JSON.stringify(data));
};

const redirect = (res, url, cookies) => {
  if (cookies && cookies.length) res.setHeader("Set-Cookie", cookies);
  res.statusCode = 302;
  res.setHeader("Location", url);
  res.end();
};

const baseUrl = (req) => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

// ---------- Discord ----------

const discordBot = async (path) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    const err = new Error("DISCORD_BOT_TOKEN is not set");
    err.status = 0;
    throw err;
  }
  const res = await fetch(DISCORD_API + path, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(`Discord API ${res.status} for ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

const ROLE_KEYS = ["lead", "combat", "support", "recruiter"]; // порядок = приоритет при нескольких ролях

// В каждой переменной может быть несколько ID через запятую — например,
// DISCORD_ROLE_SUPPORT="<Builder>,<Farmer>,<Electrical>".
const splitIds = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const roleIdMap = () => ({
  lead: splitIds(process.env.DISCORD_ROLE_LEAD),
  combat: splitIds(process.env.DISCORD_ROLE_COMBAT),
  support: splitIds(process.env.DISCORD_ROLE_SUPPORT),
  recruiter: splitIds(process.env.DISCORD_ROLE_RECRUITER),
});

const resolveRole = (memberRoleIds) => {
  const ids = roleIdMap();
  for (const key of ROLE_KEYS) {
    if (ids[key].some((id) => memberRoleIds.includes(id))) return key;
  }
  return null;
};

// Все люди с сервера (без ботов) — общий код для /api/members и /api/roster.
const fetchGuildMembers = async () => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    const err = new Error("DISCORD_GUILD_ID is not set");
    err.status = 0;
    throw err;
  }
  const raw = [];
  let after = "0";
  // клан небольшой, но на всякий случай листаем до 5 страниц по 1000
  for (let page = 0; page < 5; page++) {
    const batch = await discordBot(`/guilds/${guildId}/members?limit=1000&after=${after}`);
    if (!batch || !batch.length) break;
    raw.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  return raw.filter((m) => m.user && !m.user.bot);
};

const avatarUrl = (userId, hash) => {
  if (hash) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=128`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;
};

// ---------- KV (Upstash Redis, REST) ----------

const kvConfigured = () =>
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const kv = async (command) => {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error ${res.status}`);
  return (await res.json()).result;
};

// ---------- Роль «Owner» (может создавать и вести турниры) ----------
// Отдельная от combat/support/lead/recruiter — это право на управление,
// а не игровая позиция, поэтому проверяется по своей роли DISCORD_ROLE_OWNER
// (ID роли на сервере, можно несколько через запятую), а не по тому, кто
// технически завёл Discord-сервер.
const hasOwnerRole = async (discordId) => {
  const roleIds = splitIds(process.env.DISCORD_ROLE_OWNER);
  if (!roleIds.length) {
    const err = new Error("DISCORD_ROLE_OWNER is not set");
    err.status = 0;
    throw err;
  }
  const guildId = process.env.DISCORD_GUILD_ID;
  const member = await discordBot(`/guilds/${guildId}/members/${discordId}`);
  return !!member && roleIds.some((id) => (member.roles || []).includes(id));
};

// ---------- Steam ----------

const steamIdStore = {
  // KV (Upstash) — общий для всех устройств; кука — запасной вариант.
  configured: kvConfigured,
  kv,

  async get(req, discordId) {
    if (this.configured()) return this.kv(["GET", `steam:${discordId}`]);
    const data = verify(parseCookies(req)[STEAM_COOKIE]);
    return data && data.d === discordId ? data.s : null;
  },

  // Возвращает Set-Cookie строки, которые обработчик должен добавить в ответ.
  async set(discordId, steamId) {
    if (this.configured()) {
      await this.kv(["SET", `steam:${discordId}`, steamId]);
      return [];
    }
    return [cookie(STEAM_COOKIE, sign({ d: discordId, s: steamId }), 60 * 60 * 24 * 365)];
  },

  async del(discordId) {
    if (this.configured()) {
      await this.kv(["DEL", `steam:${discordId}`]);
      return [];
    }
    return [clearCookie(STEAM_COOKIE)];
  },
};

// Профиль Steam (имя, аватар, часы в Rust) — только при наличии STEAM_API_KEY.
const steamProfile = async (steamId) => {
  const key = process.env.STEAM_API_KEY;
  const base = {
    id: steamId,
    profile: `https://steamcommunity.com/profiles/${steamId}`,
    name: null,
    avatar: null,
    rustHours: null,
    gamesCount: null, // сколько игр в библиотеке (если профиль открыт)
    level: null, // уровень Steam (если профиль открыт)
    created: null, // unix-время регистрации Steam (если профиль открыт)
  };
  if (!key) return base;

  const [summary, games, level] = await Promise.all([
    fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    // без appids_filter: заодно получаем размер библиотеки (game_count)
    fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_played_free_games=1`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(
      `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${steamId}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const player = summary?.response?.players?.[0];
  if (player) {
    base.name = player.personaname || null;
    base.avatar = player.avatarfull || player.avatar || null;
    base.profile = player.profileurl || base.profile;
    base.created = player.timecreated || null;
  }
  const lib = games?.response;
  if (lib) {
    if (Number.isInteger(lib.game_count)) base.gamesCount = lib.game_count;
    const rust = lib.games?.find((g) => g.appid === RUST_APP_ID);
    if (rust) base.rustHours = Math.round(rust.playtime_forever / 60);
  }
  if (Number.isInteger(level?.response?.player_level)) {
    base.level = level.response.player_level;
  }

  return base;
};

module.exports = {
  SESSION_COOKIE,
  STEAM_COOKIE,
  STATE_COOKIE,
  SESSION_TTL,
  DISCORD_API,
  sign,
  verify,
  parseCookies,
  cookie,
  clearCookie,
  getSession,
  json,
  redirect,
  baseUrl,
  discordBot,
  fetchGuildMembers,
  resolveRole,
  roleIdMap,
  avatarUrl,
  kvConfigured,
  kv,
  hasOwnerRole,
  steamIdStore,
  steamProfile,
};
