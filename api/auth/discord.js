// GET /api/auth/discord — старт входа: уводит на страницу согласия Discord.
const { STATE_COOKIE, cookie, redirect, baseUrl } = require("../_lib");
const crypto = require("node:crypto");

module.exports = (req, res) => {
  const state = crypto.randomBytes(16).toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    response_type: "code",
    scope: "identify",
    redirect_uri: `${baseUrl(req)}/api/auth/callback`,
    state,
  });
  redirect(res, `https://discord.com/oauth2/authorize?${params}`, [
    cookie(STATE_COOKIE, state, 600),
  ]);
};
