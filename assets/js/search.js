// ---------- Clanmate search page ----------
// Список участников приходит из /api/members (бот синхронизирует с Discord).
(() => {
  const gate = document.getElementById("authGate");
  const section = document.getElementById("searchSection");
  const grid = document.getElementById("membersGrid");
  if (!gate || !section || !grid || !window.AXLAuth) return;

  const gateBtn = document.getElementById("gateLoginBtn");
  if (gateBtn) {
    gateBtn.addEventListener("click", () => {
      gateBtn.classList.add("is-busy");
      gateBtn.querySelector("[data-label]").textContent = "Подключение…";
      AXLAuth.login();
    });
  }

  const loadingNote = document.getElementById("loadingNote");
  const emptyNote = document.getElementById("emptyNote");
  const input = document.getElementById("searchInput");
  const chips = document.querySelectorAll("#roleChips .chip");

  let members = [];
  let query = "";
  let roleFilter = "all";

  const fmtJoined = (iso) =>
    new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(iso));

  const buildCard = (m, i) => {
    // Карточка — ссылка на профиль участника на самом сайте.
    const card = document.createElement("a");
    card.className = "member-card glass glow";
    card.style.setProperty("--ci", Math.min(i, 16)); // каскад появления, дальше 16-й — без задержки
    card.href = m.you ? "/profile/" : `/profile/?u=${m.id}`;

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    AXLAuth.paintAvatar(avatar, m);

    const name = document.createElement("span");
    name.className = "member-name";
    name.textContent = m.globalName;
    if (m.you) {
      const badge = document.createElement("span");
      badge.className = "you-badge";
      badge.textContent = "это вы";
      name.appendChild(badge);
    }

    const tag = document.createElement("span");
    tag.className = "member-tag";
    tag.textContent = "@" + m.username;

    const role = document.createElement("span");
    role.className = "role-tag";
    if (m.role) role.dataset.role = m.role;
    role.textContent = m.role ? AXLAuth.ROLES[m.role] : "Участник";

    const meta = document.createElement("span");
    meta.className = "member-meta";
    meta.textContent = `В клане с ${fmtJoined(m.joinedAt)}`;

    card.append(avatar, name, tag, role, meta);
    return card;
  };

  const render = () => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      const okRole =
        roleFilter === "all" || (roleFilter === "other" ? !m.role : m.role === roleFilter);
      const okQuery =
        !q ||
        m.globalName.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q.replace(/^@/, ""));
      return okRole && okQuery;
    });

    grid.replaceChildren(...list.map((m, i) => buildCard(m, i)));
    emptyNote.hidden = list.length > 0;
  };

  input.addEventListener("input", () => {
    query = input.value;
    render();
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      roleFilter = chip.dataset.roleFilter;
      render();
    });
  });

  AXLAuth.ready.then((me) => {
    gate.hidden = !!me;
    if (!me) return;

    const ERRORS = {
      bot_token_missing: "Бот не настроен: на сервере нет DISCORD_BOT_TOKEN.",
      bot_token_invalid: "Токен бота не подходит — проверь DISCORD_BOT_TOKEN.",
      bot_forbidden:
        "Discord не отдаёт участников: включи боту Server Members Intent и проверь, что он добавлен на сервер.",
      discord_unavailable: "Discord не отвечает — попробуй обновить страницу.",
    };

    fetch("/api/members", { credentials: "same-origin" })
      .then((r) => r.json().then((data) => (r.ok ? data : Promise.reject(data.error))))
      .then((data) => {
        loadingNote.hidden = true;
        members = (data.members || []).map((m) => (m.id === me.user.id ? { ...m, you: true } : m));
        render();
        if (!members.length) {
          emptyNote.textContent = "На сервере пока нет участников (боты не считаются).";
        }
      })
      .catch((code) => {
        loadingNote.textContent = ERRORS[code] || "Не удалось загрузить список — обнови страницу.";
      });
  });
})();
