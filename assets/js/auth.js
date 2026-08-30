// ============================================================================
// AXL auth layer — реальный Discord OAuth через /api (Vercel).
// Все данные профиля приходят с сервера (Discord + Steam) и на сайте
// не редактируются. Страницы общаются только через window.AXLAuth.
// ============================================================================
window.AXLAuth = (() => {
  const HINT = "axl_authed"; // подсказка «скорее всего вошёл» — чтобы шапка не мигала до ответа API
  const ROLES = { combat: "Combat", support: "Support", lead: "Lead", recruiter: "Проверяющий" };

  let me = null; // ответ /api/me: { user, member, steam } или null

  // Аватар: картинка из Discord/Steam, иначе градиент с первой буквой.
  const paintAvatar = (el, user) => {
    if (user && user.avatar) {
      el.style.background = `url("${user.avatar}") center / cover no-repeat`;
      el.textContent = "";
    } else {
      const seed = [...((user && user.username) || "x")].reduce((a, c) => a + c.charCodeAt(0), 0);
      const hue = (seed * 37) % 360;
      el.style.background = `linear-gradient(135deg, hsl(${hue}, 65%, 52%), hsl(${(hue + 55) % 360}, 65%, 38%))`;
      el.textContent = ((user && user.globalName) || "?").trim().charAt(0).toUpperCase();
    }
  };

  // Показывает/прячет .auth-only (нужен вход) и .guest-only (нужен выход).
  // toggleAttribute, а не .hidden: у SVG-элементов свойства hidden нет.
  const applyChrome = (authed) => {
    document.querySelectorAll(".auth-only").forEach((el) => {
      el.toggleAttribute("hidden", !authed);
    });
    document.querySelectorAll(".guest-only").forEach((el) => {
      el.toggleAttribute("hidden", authed);
    });
  };

  const syncUI = () => {
    applyChrome(!!me);
    if (!me) return;
    document.querySelectorAll("[data-user-avatar]").forEach((el) => paintAvatar(el, me.user));
    document.querySelectorAll("[data-user-name]").forEach((el) => {
      el.textContent = me.user.globalName;
    });
  };

  // Один запрос на страницу; страницы ждут AXLAuth.ready.
  // На file:// или без бэкенда fetch упадёт — останется гостевой режим.
  const ready = fetch("/api/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((data) => {
      me = data;
      try {
        me ? localStorage.setItem(HINT, "1") : localStorage.removeItem(HINT);
      } catch {}
      syncUI();
      return me;
    });

  const login = () => {
    location.href = "/api/auth/discord";
  };

  const logout = () =>
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(() => {})
      .then(() => {
        try {
          localStorage.removeItem(HINT);
        } catch {}
        location.href = "/";
      });

  // Кнопки [data-nav-login] в шапке — на всех страницах.
  document.querySelectorAll("[data-nav-login]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("is-busy")) return;
      btn.classList.add("is-busy");
      const label = btn.querySelector("[data-label]");
      if (label) label.textContent = "Подключение…";
      login();
    });
  });

  // До ответа API показываем состояние из прошлого визита — без мигания
  // «Войти» → аватарка; syncUI() поправит, если сессия истекла.
  let hinted = false;
  try {
    hinted = localStorage.getItem(HINT) === "1";
  } catch {}
  applyChrome(hinted);

  return { ROLES, ready, isLoggedIn: () => !!me, getMe: () => me, login, logout, paintAvatar, syncUI };
})();
