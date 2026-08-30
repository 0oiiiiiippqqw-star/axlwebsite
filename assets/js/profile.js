// ---------- Profile page ----------
// Свой профиль и профиль соклановца (?u=<discordId>). Все данные read-only:
// Discord — через бота, Steam — по привязке; с сайта ничего не редактируется.
(() => {
  const gate = document.getElementById("authGate");
  const section = document.getElementById("profileSection");
  if (!gate || !section || !window.AXLAuth) return;

  const gateBtn = document.getElementById("gateLoginBtn");
  if (gateBtn) {
    gateBtn.addEventListener("click", () => {
      gateBtn.classList.add("is-busy");
      gateBtn.querySelector("[data-label]").textContent = "Подключение…";
      AXLAuth.login();
    });
  }

  const fmtJoined = (iso) =>
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(iso)
    );
  // без хвоста « г.» — в узких плитках статов он переносится на свою строку
  const fmtMonthYear = (date) =>
    new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
      .format(date)
      .replace(/\s*г\.$/, "");
  // дата регистрации Discord зашита в ID (snowflake: старшие биты — время)
  const createdFromId = (id) => new Date(Number(BigInt(id) >> 22n) + 1420070400000);
  const daysSince = (iso) => Math.max(1, Math.ceil((Date.now() - new Date(iso)) / 86400000));

  const hero = document.getElementById("profileHero");
  const roleTag = document.getElementById("profileRole");

  // ---------- Акцент из аватарки ----------
  // Обложка и кольцо аватара тянут --accent с #profileHero. По умолчанию
  // это цвет роли ([data-role] в style.css); здесь мы подмешиваем личный
  // акцент — средний цвет аватарки, поднятый по насыщенности/светлоте
  // (сырое среднее с фото почти всегда блёклое). Инлайновый --accent бьёт
  // стилевой, так что при удаче личный цвет побеждает; сама таблетка роли
  // (#profileRole) не трогается — у неё свой, локальный --accent.
  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return [h, s, l];
  };

  const hslToRgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgb.map((v) => Math.round((v + m) * 255));
  };

  const getAvatarAccent = (url) =>
    new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 24; // мелкий сэмпл — для среднего цвета этого достаточно и дёшево
          const c = document.createElement("canvas");
          c.width = size;
          c.height = size;
          const cx = c.getContext("2d");
          cx.drawImage(img, 0, 0, size, size);
          const { data } = cx.getImageData(0, 0, size, size);
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue; // пропускаем прозрачные пиксели
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
          }
          if (!n) {
            resolve(null);
            return;
          }
          const [h, s, l] = rgbToHsl(r / n, g / n, b / n);
          resolve(hslToRgb(h, Math.min(1, s * 1.5 + 0.15), Math.min(0.62, Math.max(0.42, l))));
        } catch {
          resolve(null); // CORS/тайнтед канвас — тихо остаёмся на акценте роли
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  // Заполняет шапку профиля (и свою, и чужую).
  const paintHero = ({ id, username, globalName, avatar, role, joinedAt, rustHours }) => {
    AXLAuth.paintAvatar(hero.querySelector("[data-user-avatar]"), { avatar, globalName, username });
    hero.querySelector("[data-user-name]").textContent = globalName;
    document.getElementById("profileUsername").textContent = username;

    if (role) {
      roleTag.textContent = AXLAuth.ROLES[role] || role;
      roleTag.dataset.role = role;
      hero.dataset.role = role; // запасной акцент роли, пока/если не подтянется цвет аватарки
    } else {
      roleTag.textContent = joinedAt ? "Участник" : "Не в клане";
    }

    getAvatarAccent(avatar).then((rgb) => {
      if (rgb) hero.style.setProperty("--accent", rgb.join(", "));
    });

    document.getElementById("statDays").textContent = joinedAt ? String(daysSince(joinedAt)) : "—";
    document.getElementById("statJoined").textContent = joinedAt
      ? fmtMonthYear(new Date(joinedAt))
      : "—";
    document.getElementById("statCreated").textContent = fmtMonthYear(createdFromId(id));
    document.getElementById("statHours").textContent =
      rustHours != null ? rustHours.toLocaleString("ru-RU") : "—";
  };

  // ---------- Чужой профиль (по ?u=<id>) ----------
  const renderMember = (uid) => {
    document.title = "Игрок — AXL";
    section.querySelector(".eyebrow").textContent = "Клан AXL";
    document.getElementById("steamCard").hidden = true;
    document.getElementById("logoutRow").hidden = true;
    document.getElementById("memberActions").hidden = false;

    fetch("/api/members", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(d.error))))
      .then((data) => {
        const m = (data.members || []).find((x) => x.id === uid);
        if (!m) {
          AXLToast("Игрок не найден на сервере клана");
          location.replace("/profile/");
          return;
        }
        paintHero(m);
      })
      .catch(() => {
        AXLToast("Не удалось загрузить профиль игрока");
      });
  };

  // ---------- Свой профиль ----------
  const renderSelf = (me) => {
    const { user, member, steam } = me;
    paintHero({
      id: user.id,
      username: user.username,
      globalName: user.globalName,
      avatar: user.avatar,
      role: member && member.role,
      joinedAt: member && member.joinedAt,
      rustHours: steam && steam.rustHours,
    });

    // --- Steam ---
    const linked = document.getElementById("steamLinked");
    const unlinked = document.getElementById("steamUnlinked");
    linked.hidden = !steam;
    unlinked.hidden = !!steam;

    if (steam) {
      const avatar = document.getElementById("steamAvatar");
      AXLAuth.paintAvatar(avatar, { avatar: steam.avatar, globalName: steam.name || "S", username: steam.id });
      document.getElementById("steamName").textContent = steam.name || "Steam-аккаунт";
      document.getElementById("steamMeta").textContent = `ID ${steam.id}`;
      document.getElementById("steamHours").textContent =
        steam.rustHours != null ? steam.rustHours.toLocaleString("ru-RU") : "скрыты";
      document.getElementById("steamSince").textContent = steam.created
        ? String(new Date(steam.created * 1000).getFullYear())
        : "—";
      document.getElementById("steamLevel").textContent =
        steam.level != null ? String(steam.level) : "—";
      document.getElementById("steamGames").textContent =
        steam.gamesCount != null ? steam.gamesCount.toLocaleString("ru-RU") : "—";

      // часы против нормы клана: у роли своя планка, по умолчанию — Combat
      if (steam.rustHours != null) {
        const REQ = { combat: 2000, support: 1500, lead: 4000 };
        const role = member && member.role;
        const req = REQ[role] || 2000;
        const done = steam.rustHours >= req;
        const progress = document.getElementById("steamProgress");
        progress.hidden = false;
        progress.classList.toggle("is-done", done);
        document.getElementById("spTitle").textContent = REQ[role]
          ? `Норма роли ${AXLAuth.ROLES[role]}`
          : "Норма клана";
        document.getElementById("spLabel").textContent =
          `${steam.rustHours.toLocaleString("ru-RU")} / ${req.toLocaleString("ru-RU")} ч` +
          (done ? " ✓" : "");
        document.getElementById("spFill").style.width =
          Math.min(100, (steam.rustHours / req) * 100).toFixed(1) + "%";
      }

      // фон-баннер карточки — размытая аватарка Steam
      if (steam.avatar) {
        document.getElementById("steamCard").style.setProperty("--steam-bg", `url("${steam.avatar}")`);
      }
      document.getElementById("steamProfileLink").href = steam.profile;

      const unlinkBtn = document.getElementById("steamUnlinkBtn");
      unlinkBtn.addEventListener("click", () => {
        if (unlinkBtn.classList.contains("is-busy")) return;
        unlinkBtn.classList.add("is-busy");
        fetch("/api/steam/unlink", { method: "POST", credentials: "same-origin" })
          .then((r) => {
            if (!r.ok) throw new Error();
            location.reload();
          })
          .catch(() => {
            unlinkBtn.classList.remove("is-busy");
            AXLToast("Не получилось отвязать — попробуй ещё раз");
          });
      });
    } else {
      document.getElementById("steamLinkBtn").addEventListener("click", (e) => {
        e.currentTarget.classList.add("is-busy");
        location.href = "/api/steam/login";
      });
    }

    // тосты после возврата со Steam
    const params = new URLSearchParams(location.search);
    if (params.get("steam") === "linked") AXLToast("Steam привязан");
    if (params.get("steam") === "failed") AXLToast("Не удалось привязать Steam");
    if (params.has("steam")) history.replaceState(null, "", location.pathname);

    // --- logout ---
    document.getElementById("logoutBtn").addEventListener("click", () => AXLAuth.logout());
  };

  AXLAuth.ready.then((me) => {
    gate.hidden = !!me;
    if (!me) return;

    const uid = new URLSearchParams(location.search).get("u");
    if (uid && uid !== me.user.id) {
      renderMember(uid);
    } else {
      renderSelf(me);
    }
  });
})();
