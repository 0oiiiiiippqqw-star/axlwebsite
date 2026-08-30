// GET /api/steam/return — Steam возвращает сюда после подтверждения.
// Проверяем подпись у самого Steam (check_authentication) и сохраняем SteamID.
const { getSession, redirect, baseUrl, steamIdStore } = require("../_lib");

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return redirect(res, "/profile/");
  const fail = () => redirect(res, "/profile/?steam=failed");

  try {
    const url = new URL(req.url, baseUrl(req));
    const params = new URLSearchParams(url.search);
    if (params.get("openid.mode") !== "id_res") return fail();

    // верификация: отправляем те же параметры обратно с mode=check_authentication
    params.set("openid.mode", "check_authentication");
    const verifyRes = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await verifyRes.text();
    if (!/is_valid\s*:\s*true/.test(text)) return fail();

    const match = String(url.searchParams.get("openid.claimed_id")).match(
      /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/
    );
    if (!match) return fail();

    const cookies = await steamIdStore.set(session.i, match[1]);
    redirect(res, "/profile/?steam=linked", cookies);
  } catch {
    fail();
  }
};
