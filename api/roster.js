// GET /api/roster — публичная сводка состава для главной страницы.
// Без личных данных: только количество по ролям и аватарки (без ников).
const { json, fetchGuildMembers, resolveRole, avatarUrl } = require("./_lib");

let cache = { at: 0, data: null };
const CACHE_MS = 300_000; // 5 минут — публичный эндпоинт, бережём Discord API

// Публичные данные без ников — пусть их кэширует и CDN Vercel: холодные
// лямбды не трогают Discord, а главная получает ростер мгновенно.
const CDN_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

module.exports = async (req, res) => {
  if (cache.data && Date.now() - cache.at < CACHE_MS) {
    return json(res, 200, cache.data, CDN_CACHE);
  }

  try {
    const raw = await fetchGuildMembers();

    const counts = { combat: 0, support: 0, lead: 0, recruiter: 0 };
    for (const m of raw) {
      const role = resolveRole(m.roles || []);
      if (role) counts[role]++;
    }

    const data = {
      total: raw.length,
      counts,
      avatars: raw.slice(0, 12).map((m) => avatarUrl(m.user.id, m.user.avatar)),
    };
    cache = { at: Date.now(), data };
    json(res, 200, data, CDN_CACHE);
  } catch {
    json(res, 502, { error: "discord_unavailable" });
  }
};
