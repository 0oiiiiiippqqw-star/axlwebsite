// GET /api/auth/callback — обмен кода на токен, создание сессии.
// Redirect URI должен быть добавлен в приложении Discord:
//   https://<домен>/api/auth/callback
const {
  SESSION_COOKIE,
  STATE_COOKIE,
  SESSION_TTL,
  DISCORD_API,
  sign,
  parseCookies,
  cookie,
  clearCookie,
  redirect,
  baseUrl,
} = require("../_lib");

module.exports = async (req, res) => {
  const url = new URL(req.url, baseUrl(req));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fail = () => redirect(res, "/?login=failed", [clearCookie(STATE_COOKIE)]);

  if (!code || !state || state !== parseCookies(req)[STATE_COOKIE]) return fail();

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${baseUrl(req)}/api/auth/callback`,
      }),
    });
    if (!tokenRes.ok) return fail();
    const { access_token } = await tokenRes.json();

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) return fail();
    const user = await userRes.json();

    const session = sign({
      i: user.id,
      u: user.username,
      g: user.global_name || user.username,
      a: user.avatar || null,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    });

    redirect(res, "/profile/", [
      cookie(SESSION_COOKIE, session, SESSION_TTL),
      clearCookie(STATE_COOKIE),
    ]);
  } catch {
    fail();
  }
};
