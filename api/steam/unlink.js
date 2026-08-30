// POST /api/steam/unlink — отвязать Steam от текущего аккаунта.
const { getSession, json, steamIdStore } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "unauthorized" });

  try {
    const cookies = await steamIdStore.del(session.i);
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    json(res, 200, { ok: true });
  } catch {
    json(res, 500, { error: "storage_error" });
  }
};
