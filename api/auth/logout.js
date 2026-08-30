// POST (или GET) /api/auth/logout — гасит сессию.
const { SESSION_COOKIE, STEAM_COOKIE, clearCookie, redirect, json } = require("../_lib");

module.exports = (req, res) => {
  const cookies = [clearCookie(SESSION_COOKIE), clearCookie(STEAM_COOKIE)];
  if (req.method === "POST") {
    res.setHeader("Set-Cookie", cookies);
    json(res, 200, { ok: true });
  } else {
    redirect(res, "/", cookies);
  }
};
