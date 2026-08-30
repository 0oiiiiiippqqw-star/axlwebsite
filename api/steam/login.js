// GET /api/steam/login — старт привязки Steam (OpenID 2.0).
const { getSession, redirect, baseUrl } = require("../_lib");

module.exports = (req, res) => {
  if (!getSession(req)) return redirect(res, "/profile/");

  const base = baseUrl(req);
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${base}/api/steam/return`,
    "openid.realm": base,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  redirect(res, `https://steamcommunity.com/openid/login?${params}`);
};
