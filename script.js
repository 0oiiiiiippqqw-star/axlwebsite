// ---------- Live Discord member count ----------
// Fired first so the network round-trip has the most time to land before the
// hero readout's count-up animation reads data-count (see below, ~0.9s in).
(() => {
  const el = document.getElementById("memberCount");
  if (!el) return;

  const INVITE_CODE = "QZCs5zWna";

  fetch(`https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true`, {
    headers: { Accept: "application/json" },
  })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((data) => {
      const count = data.approximate_member_count;
      if (Number.isInteger(count) && count >= 0) {
        el.dataset.count = String(count);
        // The count-up below may have already rendered the static fallback
        // (e.g. reduced-motion skips its 2.3s head start) — correct it in place.
        el.textContent = String(count);
      }
    })
    .catch(() => {
      /* keep the static fallback already in data-count */
    });
})();

// ---------- Toast (shared helper for all pages) ----------
window.AXLToast = (() => {
  const toast = document.getElementById("toast");
  let hideTimer = null;
  return (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  };
})();

// ---------- Hero: Discord login button ----------
(() => {
  const btn = document.getElementById("discordLoginBtn");
  if (!btn || !window.AXLAuth) return;

  const label = btn.querySelector("[data-label]");

  AXLAuth.ready.then((me) => {
    if (me) label.textContent = "Перейти в профиль";
  });

  btn.addEventListener("click", () => {
    if (AXLAuth.isLoggedIn()) {
      location.href = "/profile/";
      return;
    }
    btn.classList.add("is-busy");
    label.textContent = "Подключение…";
    AXLAuth.login();
  });

  // /api/auth/callback возвращает сюда с ?login=failed, если OAuth сорвался
  if (new URLSearchParams(location.search).get("login") === "failed") {
    AXLToast("Вход через Discord не удался — попробуй ещё раз");
    history.replaceState(null, "", location.pathname);
  }
})();

// ---------- Wipe countdown ----------
// Вайп каждый четверг в 20:00 МСК — при переносе времени поменяй константы.
(() => {
  const el = document.getElementById("wipeTimer");
  if (!el) return;

  const WIPE_DAY_UTC = 4; // четверг
  const WIPE_HOUR_UTC = 17; // 20:00 МСК = 17:00 UTC

  const nextWipe = () => {
    const now = new Date();
    const t = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WIPE_HOUR_UTC, 0, 0)
    );
    while (t.getUTCDay() !== WIPE_DAY_UTC || t <= now) t.setUTCDate(t.getUTCDate() + 1);
    return t;
  };

  const pad = (n) => String(n).padStart(2, "0");

  const tick = () => {
    const diff = nextWipe() - Date.now();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const m = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;
    el.textContent = d > 0 ? `${d}д ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  tick();
  setInterval(tick, 1000);
})();

// ---------- Roster preview (public, no login required) ----------
(() => {
  const total = document.getElementById("rosterTotal");
  if (!total) return;

  fetch("/api/roster")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      total.textContent = data.total;
      document.getElementById("rosterCombat").textContent = data.counts.combat;
      document.getElementById("rosterSupport").textContent = data.counts.support;
      document.getElementById("rosterLead").textContent = data.counts.lead;
      const recruiter = document.getElementById("rosterRecruiter");
      if (recruiter) recruiter.textContent = data.counts.recruiter ?? 0;

      const wrap = document.getElementById("rosterAvatars");
      wrap.replaceChildren(
        ...data.avatars.map((src, i) => {
          const a = document.createElement("span");
          a.className = "avatar";
          a.style.background = `url("${src}") center / cover no-repeat`;
          a.style.setProperty("--ai", i);
          return a;
        })
      );
    })
    .catch(() => {
      // бэкенд недоступен (локальный просмотр) — прячем секцию целиком
      const section = document.getElementById("roster");
      if (section) section.hidden = true;
    });
})();

// ---------- Aurora background ----------
// Blobs are drawn on a tiny canvas that the browser upscales to the full
// viewport — the upscaling itself produces the perfectly smooth blur.
(() => {
  const canvas = document.getElementById("aurora");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  //        color            alpha  radius  base x/y   drift amp   drift speed  phase depth
  // Монохромная палитра: чёрный/белый/серый, без цветных оттенков.
  const BLOBS = [
    { c: "255, 255, 255", a: 0.22, r: 0.60, x: 0.20, y: 0.24, ax: 0.16, ay: 0.12, sx: 0.13, sy: 0.10, p: 0.0, d: 1.6 },
    { c: "235, 235, 235", a: 0.18, r: 0.46, x: 0.78, y: 0.30, ax: 0.14, ay: 0.16, sx: 0.09, sy: 0.14, p: 2.1, d: 1.0 },
    { c: "205, 205, 205", a: 0.16, r: 0.42, x: 0.62, y: 0.80, ax: 0.18, ay: 0.12, sx: 0.15, sy: 0.08, p: 4.2, d: 2.2 },
    { c: "150, 150, 150", a: 0.14, r: 0.40, x: 0.26, y: 0.76, ax: 0.14, ay: 0.14, sx: 0.11, sy: 0.12, p: 1.2, d: 0.7 },
    { c: "255, 255, 255", a: 0.10, r: 0.32, x: 0.52, y: 0.06, ax: 0.20, ay: 0.10, sx: 0.08, sy: 0.11, p: 5.3, d: 1.3 },
  ];

  let W = 0;
  let H = 0;

  // Wall-clock time (modulo ~2.7h to keep sin/cos args precise) instead of
  // performance.now(): the drift phase stays continuous across page
  // navigations, so the background doesn't visibly "jump" between pages.
  const nowT = () => (Date.now() % 10000000) / 1000;
  let lastT = nowT();

  const resize = () => {
    W = 56;
    H = Math.max(24, Math.round((W * window.innerHeight) / Math.max(window.innerWidth, 1)));
    canvas.width = W;
    canvas.height = H;
    draw(lastT); // repaint right away so resizing never flashes an empty frame
  };

  // pointer parallax (eased towards the cursor)
  let tx = 0, ty = 0, px = 0, py = 0;
  if (!reduced && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener(
      "mousemove",
      (e) => {
        tx = e.clientX / window.innerWidth - 0.5;
        ty = e.clientY / window.innerHeight - 0.5;
      },
      { passive: true }
    );
  }

  const draw = (t) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0a0709";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    const m = (W + H) / 2;

    for (const b of BLOBS) {
      const bx = (b.x + Math.cos(t * b.sx + b.p) * b.ax + px * 0.06 * b.d) * W;
      const by = (b.y + Math.sin(t * b.sy + b.p * 1.7) * b.ay + py * 0.06 * b.d) * H;
      const br = Math.max(b.r * (1 + 0.09 * Math.sin(t * 0.3 + b.p * 2)) * m, 0.001);

      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, `rgba(${b.c}, ${b.a})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  };

  let last = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (now - last < 33) return; // ~30fps is plenty for slow drift
    last = now;
    px += (tx - px) * 0.04;
    py += (ty - py) * 0.04;
    lastT = nowT();
    draw(lastT);
  };

  resize();
  window.addEventListener("resize", resize);

  if (!reduced) requestAnimationFrame(loop);
})();

// ---------- Smooth scroll: eased wheel scrolling + eased anchor navigation ----------
// A notchy mouse wheel feels cheap; this drives real scroll positions through
// a lerp each frame so both wheel and anchor-link scrolling settle like inertia.
(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  const EASE = 0.1;
  const STOP_THRESHOLD = 0.4;
  const SCROLL_OFFSET = 100; // keep in sync with `section { scroll-margin-top }`

  const maxScroll = () => root.scrollHeight - window.innerHeight;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  let current = window.scrollY;
  let target = current;
  let running = false;

  const tick = () => {
    current += (target - current) * EASE;

    if (Math.abs(target - current) < STOP_THRESHOLD) {
      current = target;
      window.scrollTo(0, current);
      running = false;
      return;
    }
    window.scrollTo(0, current);
    requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  };

  const scrollToY = (y, instant) => {
    const clamped = clamp(y, 0, maxScroll());
    if (instant) {
      current = target = clamped;
      window.scrollTo(0, clamped);
      return;
    }
    if (!running) current = window.scrollY; // pick up manual scrolling since we last drove it
    target = clamped;
    start();
  };

  if (!reduced) {
    // Our lerp supplies all the easing from here on; native CSS smooth
    // scrolling would otherwise double up with it on every scrollTo call.
    root.style.scrollBehavior = "auto";

    // Wheel hijack only where it actually improves the feel: fine pointers
    // (mice, trackpads) with motion allowed. Touch keeps native momentum.
    if (window.matchMedia("(pointer: fine)").matches) {
      const normalize = (e) => {
        if (e.deltaMode === 1) return e.deltaY * 18; // line mode (Firefox)
        if (e.deltaMode === 2) return e.deltaY * window.innerHeight; // page mode
        return e.deltaY;
      };

      window.addEventListener(
        "wheel",
        (e) => {
          if (e.ctrlKey) return; // never hijack pinch-zoom
          if (!running) current = window.scrollY;
          target = clamp(target + normalize(e), 0, maxScroll());
          start();
          e.preventDefault();
        },
        { passive: false }
      );

      // Resync after any scroll our own loop didn't cause (keyboard, scrollbar
      // drag, back/forward) so the lerp doesn't fight the user's position.
      let syncTimer = null;
      window.addEventListener(
        "scroll",
        () => {
          if (running) return;
          clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            current = target = window.scrollY;
          }, 80);
        },
        { passive: true }
      );
    }
  }

  window.addEventListener("resize", () => {
    target = clamp(target, 0, maxScroll());
  });

  // Eased anchor-link navigation (nav links, hero/CTA buttons, footer links).
  const links = document.querySelectorAll('a[href^="#"]:not([href="#"]):not(.skip-link)');
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      const el = document.getElementById(href.slice(1));
      if (!el) return;
      e.preventDefault();
      const y = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      scrollToY(y, reduced);
      history.pushState(null, "", href);
    });
  });
})();

// ---------- Reveal on scroll ----------
(() => {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
  );
  items.forEach((el) => observer.observe(el));
})();

// ---------- Nav: scrolled state ----------
(() => {
  const nav = document.getElementById("siteNav");
  if (!nav) return;

  let ticking = false;
  const update = () => {
    nav.classList.toggle("scrolled", window.scrollY > 24);
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );

  update();
})();

// ---------- Cursor-tracking glow on cards ----------
(() => {
  const els = document.querySelectorAll(".glow");
  if (!els.length || !window.matchMedia("(pointer: fine)").matches) return;

  els.forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
      el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
    });
  });
})();

// ---------- Hero readout: печать данных ----------
// Вместо счётчика 0→N — терминальная печать по символу с курсором:
// подходит и числам, и тексту («ЧТ», «2025»), выглядит как единый
// вывод статуса, а не как отдельно считающиеся циферки.
(() => {
  const counters = document.querySelectorAll(".hero-readout dd");
  if (!counters.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const animate = (el, delay) => {
    // data-count — число (в т.ч. живой счётчик участников); иначе печатаем
    // то, что уже лежит в разметке (например «ЧТ» у вайпа).
    const text = el.dataset.count !== undefined ? el.dataset.count : el.textContent;

    if (reduced) {
      el.textContent = text;
      return;
    }

    el.textContent = "";
    const cursor = document.createElement("span");
    cursor.className = "rd-cursor";
    cursor.setAttribute("aria-hidden", "true");
    el.appendChild(cursor);

    let i = 0;
    const type = () => {
      if (i < text.length) {
        cursor.before(text[i]);
        i++;
        setTimeout(type, 70 + Math.random() * 60);
      } else {
        setTimeout(() => cursor.remove(), 500);
      }
    };
    setTimeout(type, delay);
  };

  const init = () => {
    if (!("IntersectionObserver" in window)) {
      counters.forEach((el, i) => animate(el, i * 180));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target, [...counters].indexOf(entry.target) * 180);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((el) => observer.observe(el));
  };

  // печать стартует, когда хиро-строка уже проявилась; при повторном
  // заходе за сессию (интро пропущено) ждать нечего
  const noIntro = document.documentElement.classList.contains("no-intro");
  setTimeout(init, reduced || noIntro ? 0 : 900);
})();

// ---------- Footer year ----------
(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
