// ---------- Tournaments page ----------
// Список из /api/tournaments (Upstash KV). Создаёт и удаляет турниры только
// владелец Discord-сервера; любой вошедший участник может записаться.
(() => {
  const gate = document.getElementById("authGate");
  const section = document.getElementById("tournSection");
  const list = document.getElementById("tournList");
  if (!gate || !section || !list || !window.AXLAuth) return;

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
  const form = document.getElementById("createForm");
  const ownerHint = document.getElementById("ownerHint");
  const archiveSection = document.getElementById("archiveSection");
  const archiveList = document.getElementById("archiveList");

  const ERRORS = {
    kv_missing: "Хранилище турниров не настроено — добавь Upstash Redis в переменные окружения.",
    owner_only: "Создавать и завершать турниры может только владелец сервера.",
    full: "Все слоты заняты.",
    finished: "Турнир уже завершён.",
    discord_unavailable: "Discord не отвечает — попробуй позже.",
  };

  let me = null;

  const api = (body) =>
    fetch(
      "/api/tournaments",
      body
        ? {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : { credentials: "same-origin" }
    ).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(d.error || "error"))));

  const btnBusy = (btn, busy) => {
    btn.classList.toggle("is-busy", busy);
    btn.disabled = busy;
  };

  const buildCard = (t, isOwner, i) => {
    const done = t.status === "done";
    const card = document.createElement("article");
    card.className = "tourn-card glass glow" + (done ? " is-done" : "");
    card.style.setProperty("--ci", Math.min(i, 10));

    const head = document.createElement("div");
    head.className = "tourn-head";
    const title = document.createElement("h3");
    title.textContent = t.title;
    head.appendChild(title);

    if (isOwner) {
      const actions = document.createElement("div");
      actions.className = "tourn-owner-actions";

      const runAction = (btn, action, extra) => {
        if (btn.dataset.busy) return;
        btn.dataset.busy = "1";
        api({ action, id: t.id, ...extra })
          .then(reload)
          .catch((code) => {
            delete btn.dataset.busy;
            AXLToast(ERRORS[code] || "Не получилось");
          });
      };

      if (done) {
        const reopen = document.createElement("button");
        reopen.type = "button";
        reopen.className = "tourn-icon-btn";
        reopen.title = "Вернуть в активные";
        reopen.textContent = "↺";
        reopen.addEventListener("click", () => runAction(reopen, "reopen"));
        actions.appendChild(reopen);
      } else {
        const finish = document.createElement("button");
        finish.type = "button";
        finish.className = "tourn-icon-btn tourn-icon-finish";
        finish.title = "Завершить турнир";
        finish.textContent = "🏁";
        finish.addEventListener("click", () => {
          const winner = prompt("Победитель (необязательно):", "");
          if (winner === null) return; // отмена
          runAction(finish, "finish", { winner });
        });
        actions.appendChild(finish);
      }

      const del = document.createElement("button");
      del.type = "button";
      del.className = "tourn-icon-btn tourn-icon-del";
      del.title = "Удалить турнир";
      del.textContent = "✕";
      del.addEventListener("click", () => runAction(del, "delete"));
      actions.appendChild(del);

      head.appendChild(actions);
    }

    const meta = document.createElement("div");
    meta.className = "tourn-meta";
    const chip = (text, accent) => {
      const s = document.createElement("span");
      s.className = "t-chip" + (accent ? " t-chip-accent" : "");
      s.textContent = text;
      return s;
    };
    if (done) meta.appendChild(chip("Завершён"));
    if (t.prize) meta.appendChild(chip(`Приз · ${t.prize}`, true));
    if (!done && t.startsAt) meta.appendChild(chip(t.startsAt));
    meta.appendChild(
      chip(t.slots ? `${t.players.length}/${t.slots} мест` : `${t.players.length} в списке`)
    );
    if (t.winner) meta.appendChild(chip(`🏆 ${t.winner}`, true));

    const roster = document.createElement("div");
    roster.className = "tourn-players";
    t.players.slice(0, 14).forEach((p, pi) => {
      const a = document.createElement("span");
      a.className = "avatar";
      a.title = p.name;
      a.style.setProperty("--ai", pi);
      AXLAuth.paintAvatar(a, { avatar: p.avatar, globalName: p.name, username: p.id });
      roster.appendChild(a);
    });
    if (!t.players.length) {
      const none = document.createElement("span");
      none.className = "tourn-none";
      none.textContent = "Никто не записался";
      roster.appendChild(none);
    }

    card.append(head, meta, roster);

    if (!done) {
      const joined = me && t.players.some((p) => p.id === me.user.id);
      const full = !!t.slots && t.players.length >= t.slots;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = joined ? "cta-ghost cta-danger btn-small" : "cta btn-small";
      btn.innerHTML = '<span class="cta-spinner" aria-hidden="true"></span><span></span>';
      btn.querySelector("span:last-child").textContent = joined
        ? "Выйти из турнира"
        : full
          ? "Мест нет"
          : "Присоединиться";
      if (!joined && full) btn.disabled = true;
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btnBusy(btn, true);
        api({ action: joined ? "leave" : "join", id: t.id })
          .then(reload)
          .catch((code) => {
            btnBusy(btn, false);
            AXLToast(ERRORS[code] || "Не получилось — попробуй ещё раз");
          });
      });
      card.appendChild(btn);
    }

    return card;
  };

  const OWNER_HINTS = {
    unconfigured: "Роль Owner не настроена — добавь DISCORD_ROLE_OWNER (ID роли на сервере) в переменные окружения.",
    failed: "Не удалось проверить роль Owner — проверь DISCORD_BOT_TOKEN и DISCORD_GUILD_ID.",
  };

  const render = (data) => {
    loadingNote.hidden = true;
    form.hidden = !data.isOwner;
    const hint = !data.isOwner && OWNER_HINTS[data.ownerDetect];
    ownerHint.hidden = !hint;
    if (hint) ownerHint.textContent = hint;

    const active = data.tournaments.filter((t) => t.status !== "done");
    const archive = data.tournaments.filter((t) => t.status === "done");

    list.replaceChildren(...active.map((t, i) => buildCard(t, data.isOwner, i)));
    emptyNote.hidden = active.length > 0;

    archiveSection.hidden = archive.length === 0;
    archiveList.replaceChildren(...archive.map((t, i) => buildCard(t, data.isOwner, i)));
  };

  const reload = () => api().then(render);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    if (btn.disabled) return;
    const title = document.getElementById("tcTitle").value.trim();
    if (!title) return AXLToast("Дай турниру название");
    btnBusy(btn, true);
    api({
      action: "create",
      title,
      prize: document.getElementById("tcPrize").value.trim(),
      startsAt: document.getElementById("tcStarts").value.trim(),
      slots: parseInt(document.getElementById("tcSlots").value, 10) || 0,
    })
      .then(() => {
        form.reset();
        AXLToast("Турнир создан");
        return reload();
      })
      .catch((code) => AXLToast(ERRORS[code] || "Не получилось создать"))
      .finally(() => btnBusy(btn, false));
  });

  AXLAuth.ready.then((user) => {
    gate.hidden = !!user;
    if (!user) return;
    me = user;
    reload().catch((code) => {
      loadingNote.textContent = ERRORS[code] || "Не удалось загрузить турниры — обнови страницу.";
    });
  });
})();
