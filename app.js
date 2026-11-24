(() => {
  "use strict";

  /* Three views, addressed by the hash:
       #/                    home: every edition, newest first
       #/2026-11-24          the front page for one day
       #/2026-11-24/slug     one article
     Each day is one file in data/. Articles can be added to a day at any hour. */

  const app = document.getElementById("app");
  const paydown = document.getElementById("paydown");
  const dock = document.getElementById("dock");
  const notice = document.getElementById("notice");
  const navUp = document.getElementById("navUp");
  const navSearch = document.getElementById("navSearch");
  const readBtn = document.getElementById("readToggle");
  const sheet = document.getElementById("sheet");
  const sheetTitle = document.getElementById("sheetTitle");
  const sheetBody = document.getElementById("sheetBody");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  const SECTIONS = [
    ["agents", "AI and agents"],
    ["techniques", "For your requirements"],
    ["field", "In our field"],
    ["market", "Asia market"]
  ];
  const SECTION_NAME = Object.fromEntries(SECTIONS);
  const KIND_NAME = { deepdive: "Deep dive", plain: "Say it simply" };
  const FIELD = { agents: "", techniques: "on-night", field: "on-surface", market: "on-moss", deepdive: "", plain: "on-night" };
  const INK = { "": "dark", "on-surface": "dark", "on-night": "light", "on-moss": "light" };

  /* ---------- small helpers ---------- */

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else node.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  // Plain text with **bold** spans. Nothing else is interpreted.
  function rich(text) {
    const frag = document.createDocumentFragment();
    String(text || "").split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) frag.append(el("strong", { text: part.slice(2, -2) }));
      else if (part) frag.append(part);
    });
    return frag;
  }

  function safeUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch (e) {
      return null;
    }
  }
  function sourceLinks(list) {
    const out = [];
    (list || []).forEach((s) => {
      const href = safeUrl(s.url);
      if (!href) return;
      if (out.length) out.push(", ");
      out.push(el("a", { href, target: "_blank", rel: "noopener", title: s.title || null }, s.publisher || s.title || "Source"));
    });
    return out;
  }
  // Sources set inside the end of a paragraph, so no stray label sits above the next title.
  function withSources(text, list) {
    const links = sourceLinks(list);
    return el("p", null, rich(text), links.length ? [" ", el("span", { class: "src" }, "From ", links, ".")] : null);
  }

  function parseDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  const fmt = (opts) => (iso) => new Intl.DateTimeFormat("en-GB", opts).format(parseDate(iso));
  const longDate = fmt({ weekday: "long", day: "numeric", month: "long" });
  const midDate = fmt({ weekday: "short", day: "numeric", month: "short" });
  const shortDate = fmt({ day: "numeric", month: "short" });

  function splitLines(text, n) {
    const words = String(text || "").trim().split(/\s+/);
    const total = words.join(" ").length;
    const lines = [];
    let line = [];
    let used = 0;
    words.forEach((w, i) => {
      line.push(w);
      used += w.length + 1;
      const left = words.length - i - 1;
      if (lines.length < n - 1 && used >= (total * (lines.length + 1)) / n - 2 && left >= n - lines.length - 1) {
        lines.push(line.join(" "));
        line = [];
      }
    });
    if (line.length) lines.push(line.join(" "));
    return lines;
  }

  function bodyOf(a) { return Array.isArray(a.body) ? a.body : a.body ? [a.body] : []; }
  function teaser(a) {
    if (a.dek) return a.dek;
    if (a.kind === "plain") return a.stair || a.simple || "";
    const first = bodyOf(a)[0] || "";
    const cut = first.match(/^.{40,170}?[.!?](?=\s|$)/);
    return cut ? cut[0] : first.slice(0, 160);
  }
  function minutes(a) {
    const words = JSON.stringify([a.headline, a.dek, a.body, a.soWhat, a.steps, a.forRequirements, a.example, a.stair, a.simple, a.analogy]).split(/\s+/).length;
    return Math.max(1, Math.round(words / 220));
  }
  function whereOf(a) { return a.kind === "story" ? SECTION_NAME[a.section] || "News" : KIND_NAME[a.kind] || "Article"; }

  /* ---------- reading record (this device only), one entry per article ---------- */

  const store = {
    all() {
      try {
        const v = JSON.parse(localStorage.getItem("briefing.read.v2") || "[]");
        return new Set(Array.isArray(v) ? v : []);
      } catch (e) {
        return new Set();
      }
    },
    has(date, id) { return this.all().has(date + "/" + id); },
    set(date, id, read) {
      try {
        const set = this.all();
        if (read) set.add(date + "/" + id); else set.delete(date + "/" + id);
        localStorage.setItem("briefing.read.v2", JSON.stringify([...set].sort().slice(-4000)));
      } catch (e) { /* private mode: nothing is kept between visits */ }
    }
  };
  function unreadCount(date, ids) {
    const set = store.all();
    return (ids || []).filter((id) => !set.has(date + "/" + id)).length;
  }
  function countLine(total, unread) {
    const n = total + (total === 1 ? " article" : " articles");
    if (!unread) return n + ", all read";
    return n + ", " + unread + " unread";
  }

  /* ---------- data ---------- */

  let index = null;
  const days = {};

  async function getJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return { data: await res.json(), cached: res.headers.get("x-briefing-cache") === "1" };
  }
  async function loadIndex(force) {
    if (index && !force) return index;
    const got = await getJson("data/index.json");
    index = got.data;
    offline = got.cached || navigator.onLine === false;
    return index;
  }
  async function loadDay(date, force) {
    if (days[date] && !force) return days[date];
    const got = await getJson("data/" + date + ".json");
    days[date] = got.data;
    return got.data;
  }
  let offline = false;
  function say(msg) {
    notice.textContent = msg || "";
    notice.hidden = !msg;
  }

  /* ---------- pictures: Hokusai's eight waterfalls, in rotation ---------- */

  const FALLS = [
    ["amida", "The Amida Falls in the far reaches of the Kisokaidō road", 1433],
    ["kirifuri", "Kirifuri Waterfall at Kurokami Mountain in Shimotsuke", 1425],
    ["yoshitsune", "The waterfall where Yoshitsune washed his horse, at Yoshino", 1432],
    ["yoro", "Yōrō Waterfall in Mino Province", 1407],
    ["ono", "Ono Waterfall on the Kisokaidō", 1400],
    ["aoigaoka", "The falls at Aoigaoka in Edo", 1441],
    ["roben", "Rōben Waterfall at Ōyama in Sagami Province", 1417],
    ["kiyotaki", "Kiyotaki Kannon Waterfall at Sakanoshita on the Tōkaidō", 1427]
  ];
  function dayNumber(date) { return Math.round(parseDate(date).getTime() / 86400000); }
  function plate(n) {
    const f = FALLS[((n % 8) + 8) % 8];
    const img = el("img", { src: "pictures/" + f[0] + ".webp", width: 1000, height: f[2], alt: f[1] + ", a colour woodblock print by Katsushika Hokusai", loading: "lazy", decoding: "async" });
    img.addEventListener("error", () => { const fig = img.closest(".plate"); if (fig) fig.hidden = true; });
    return el("figure", { class: "plate", "data-ink": "light" },
      el("div", { class: "frame" }, img),
      el("figcaption", null, el("span", { text: f[1] }), el("span", { text: "Katsushika Hokusai, about 1832" })));
  }

  /* ---------- routing ---------- */

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    const m = h.match(/^(\d{4}-\d{2}-\d{2})(?:\/([a-z0-9-]+))?$/);
    if (!m) return { view: "home", key: "/" };
    return m[2] ? { view: "article", date: m[1], id: m[2], key: "/" + m[1] + "/" + m[2] } : { view: "day", date: m[1], key: "/" + m[1] };
  }
  let swReg = null;
  let reloadDue = false;
  const depth = { home: 0, day: 1, article: 2 };
  const scrolls = {};
  let route = null;
  let rendering = 0;

  function go(path) {
    if (location.hash === "#" + path) show();
    else location.hash = path;
  }

  async function show() {
    if (reloadDue) { reloadDue = false; location.reload(); return; }
    const next = parseRoute();
    if (route) scrolls[route.key] = window.scrollY;
    const back = route && (depth[next.view] < depth[route.view] || next.key === route.key);
    const mine = ++rendering;
    closeSheet();
    try {
      await loadIndex();
      let nodes;
      if (next.view === "home") {
        const first = (index.days || [])[0];
        const today = first ? await loadDay(first.date).catch(() => null) : null;
        if (mine !== rendering) return;
        nodes = home(today);
      } else {
        const day = await loadDay(next.date);
        if (mine !== rendering) return;
        if (next.view === "day") nodes = front(day);
        else {
          let art = (day.articles || []).find((a) => a.id === next.id);
          if (!art) {
            // It may have been published since this day was last loaded.
            const fresh = await loadDay(next.date, true).catch(() => day);
            if (mine !== rendering) return;
            art = (fresh.articles || []).find((a) => a.id === next.id);
            if (!art) { location.replace("#/" + next.date); return; }
            await loadIndex(true).catch(() => {});
          }
          nodes = article(days[next.date] || day, art);
        }
      }
      if (mine !== rendering) return;
      route = next;
      app.className = next.view === "day" ? "front" : next.view;
      app.replaceChildren(...nodes);
      chrome();
      window.scrollTo(0, back && scrolls[next.key] ? scrolls[next.key] : 0);
      fitAll();
      buildBar();
      entrances();
      say(offline ? "You're offline. This is what was saved on this phone." : "");
      keepRecent();
    } catch (err) {
      if (next.view !== "home" && index) { location.replace("#/"); return; }
      const sub = app.querySelector(".hero-sub");
      if (sub) sub.textContent = "The briefing couldn't load. Connect to the internet and open it again.";
    }
  }

  // Keep the last week available offline.
  let kept = false;
  function keepRecent() {
    if (kept || !index) return;
    kept = true;
    (index.days || []).slice(0, 7).forEach((d) => { if (!days[d.date]) loadDay(d.date).catch(() => {}); });
  }

  /* ---------- the bar at the top ---------- */

  function chrome() {
    if (route.view === "home") {
      navUp.textContent = "Daily Briefing";
      document.title = "Daily Briefing";
    } else if (route.view === "day") {
      navUp.textContent = "All editions";
      document.title = "Briefing, " + shortDate(route.date);
    } else {
      navUp.textContent = midDate(route.date);
      const a = (days[route.date].articles || []).find((x) => x.id === route.id);
      document.title = a ? a.headline : "Briefing";
    }
    readBtn.hidden = route.view !== "article";
    syncRead();
  }
  navUp.addEventListener("click", () => {
    if (!route || route.view === "home") window.scrollTo({ top: 0, behavior: reduced.matches ? "auto" : "smooth" });
    else if (route.view === "day") go("/");
    else go("/" + route.date);
  });

  function syncRead() {
    if (!route || route.view !== "article") return;
    const isRead = store.has(route.date, route.id);
    readBtn.setAttribute("aria-pressed", String(isRead));
    readBtn.textContent = isRead ? "Read" : "Mark read";
    const done = app.querySelector(".end .done");
    if (done) {
      done.setAttribute("aria-pressed", String(isRead));
      done.textContent = isRead ? "Read. Back to the front page" : "Mark as read";
    }
  }
  readBtn.addEventListener("click", () => {
    if (!route || route.view !== "article") return;
    store.set(route.date, route.id, !store.has(route.date, route.id));
    syncRead();
  });

  /* ---------- home: every edition ---------- */

  function footer(extra) {
    return el("footer", { class: "foot", id: "end", "data-ink": "light" },
      el("div", { class: "top" }, extra),
      el("div"),
      el("div", null,
        el("p", { class: "wordmark fit", text: "Briefing" }),
        el("p", { class: "legal", text: "Written from public sources. Each article links to where it came from. Prints: Katsushika Hokusai, A Tour of Waterfalls in Various Provinces, about 1832, The Metropolitan Museum of Art, public domain." }),
        versionLine()));
  }

  // Which version of the app this phone is running, read from the saved copy.
  function versionLine() {
    const p = el("p", { class: "legal version" });
    if (!("caches" in window)) return p;
    caches.keys().then((keys) => {
      const v = keys.map((k) => (k.match(/^briefing-shell-v(\d+)$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => b - a)[0];
      if (v) p.textContent = "Version " + v + ".";
    }).catch(() => {});
    return p;
  }

  // The newest unread articles, for the foot of a first screen.
  function latest(day) {
    if (!day) return null;
    const set = store.all();
    const rows = (day.articles || [])
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => !set.has(day.date + "/" + a.id) && !a.lead)
      .sort((x, y) => (x.a.time < y.a.time ? 1 : x.a.time > y.a.time ? -1 : x.i - y.i))
      .slice(0, 3);
    if (!rows.length) return null;
    return el("ul", { class: "inside" }, rows.map(({ a }) =>
      el("li", null, el("a", { href: "#/" + day.date + "/" + a.id }, el("span", { text: (a.time || "") + ", " + whereOf(a) }), el("span", { text: a.headline })))));
  }

  function home(todayDay) {
    const list = index.days || [];
    const today = list[0];
    const out = [];
    if (!today) {
      return [el("header", { class: "hero", "data-ink": "light" },
        el("h1", { class: "poster fit" }, el("span", { text: "Daily" }), el("span", { text: "Briefing" })),
        el("p", { class: "hero-sub", text: "The first edition has not been published yet." }))];
    }
    const unread = unreadCount(today.date, today.ids);
    const poster = today.poster && today.poster.length === 2 ? today.poster : splitLines(today.headline, 2);
    out.push(el("header", { class: "hero", id: "top", "data-ink": "light" },
      el("h1", { class: "poster fit", "aria-label": "Daily Briefing: " + poster.join(" ") }, poster.map((l) => el("span", { text: l }))),
      el("p", { class: "hero-sub", text: today.headline + "." }),
      el("a", { class: "btn", href: "#/" + today.date, text: "Open today's edition" }),
      el("div", { class: "hero-foot" },
        latest(todayDay),
        el("p", { class: "hero-meta", text: "Daily Briefing, " + longDate(today.date) + ". " + countLine(today.ids.length, unread) + "." }))));

    out.push(el("section", { class: "sec editions", id: "editions", "data-ink": "dark" },
      el("div", { class: "grid" },
        el("h2", { class: "head", text: "Every edition" }),
        el("div", { class: "rows" }, list.map((d) => {
          const u = unreadCount(d.date, d.ids);
          return el("a", { class: "day-row", href: "#/" + d.date, "data-read": String(!u) },
            el("span", { class: "when", text: midDate(d.date) }),
            el("span", { class: "what", text: d.headline }),
            el("span", { class: "small", text: countLine(d.ids.length, u) }));
        })))));
    out.push(plate(dayNumber(today.date)));
    out.push(footer([el("div", { class: "finish" },
      el("h2", { class: "head", text: "How it works" }),
      el("p", { text: "New articles are added through the day, Singapore time. Anything you have opened stays on this phone and reads without a connection." })),
      el("div", { class: "cols" }, notifyBlock())]));
    return out;
  }

  /* ---------- notifications from the app itself ---------- */

  // The public half of the signing key. The private half never leaves the publisher.
  const PUSH_KEY = "BPI6fuQU1S1JhjG-7kLawU8UBAdnICZ0UDrvM3hly0lpmaKS7f4Cv_zHDC7iKkMJQbnJ2-Y9W_jDlxlZGS0Ys1k";

  function keyBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  function notifyBlock() {
    const box = el("div", { class: "notify" }, el("h3", { text: "Notifications" }));
    const status = el("p", { role: "status" });
    const actions = el("div", { class: "notify-actions" });
    box.append(status, actions);
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    function showCode(sub) {
      const code = JSON.stringify(sub.toJSON());
      const area = el("textarea", { class: "code", readonly: true, rows: 4, "aria-label": "Setup code" });
      area.value = code;
      const copy = el("button", { class: "btn", type: "button", text: "Copy setup code" });
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code);
          copy.textContent = "Copied";
        } catch (e) {
          area.focus();
          area.select();
          copy.textContent = "Select all, then copy";
        }
      });
      status.textContent = "Notifications are on for this phone. The setup code below is needed once, by whoever publishes the briefing.";
      actions.replaceChildren(copy, area);
    }

    async function refresh() {
      if (!supported) {
        status.textContent = "Notifications work when the briefing is opened from its Home Screen icon.";
        return;
      }
      if (Notification.permission === "denied") {
        status.textContent = "Notifications are blocked for this app. Allow them in the iPhone's Settings, under Notifications.";
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { showCode(sub); return; }
      status.textContent = "Get a notification when a new article is published.";
      const on = el("button", { class: "btn", type: "button", text: "Turn on notifications" });
      on.addEventListener("click", async () => {
        on.disabled = true;
        try {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") { refresh(); return; }
          const made = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_KEY) });
          showCode(made);
        } catch (err) {
          on.disabled = false;
          status.textContent = "That didn't work: " + (err && err.message ? err.message : "unknown error") + ". Close the app fully, open it again and retry.";
        }
      });
      actions.replaceChildren(on);
    }
    refresh().catch(() => { status.textContent = "Notifications aren't available right now."; });
    return box;
  }

  /* ---------- the front page for one day ---------- */

  function rowMeta(date, a) {
    const read = store.has(date, a.id);
    const m = minutes(a);
    return (a.time || "") + (m > 1 ? ", " + m + " min" : "") + (read ? ", read" : "");
  }
  function link(date, a, cls, ...kids) {
    return el("a", { class: "row " + (cls || ""), href: "#/" + date + "/" + a.id, "data-read": String(store.has(date, a.id)) }, kids);
  }

  function numberBlock(num, title, href) {
    const dots = "·".repeat(80);
    const slip = num.rows && num.rows.length ? el("div", { class: "slip", "data-ui": true },
      num.unit ? el("p", { class: "unit", text: num.unit }) : null,
      el("ul", null,
        num.rows.map((r) => el("li", null, el("span", { text: r.label }), el("span", { class: "dots", "aria-hidden": "true", text: dots }), el("span", { text: r.value }))),
        num.total ? el("li", { class: "sum" }, el("span", { text: "Total" }), el("span", { class: "dots", "aria-hidden": "true", text: dots }), el("span", { text: num.total })) : null)) : null;
    const total = el("p", { class: "total", text: num.value });
    return el("div", { class: "split" },
      el("div", { class: "left" },
        title ? el("h2", { class: "head", text: title }) : null,
        el("p", { class: "note" }, rich(num.caption)),
        href ? el("a", { class: "total-link", href, "aria-label": num.value + ". Read the article" }, total) : total,
        num.source ? el("p", { class: "caption" }, "From ", sourceLinks([num.source]), ".") : null),
      slip);
  }

  function front(day) {
    const date = day.date;
    const arts = day.articles || [];
    const lead = arts.find((a) => a.lead) || arts[0];
    const unread = unreadCount(date, arts.map((a) => a.id));
    const poster = lead.poster && lead.poster.length === 2 ? lead.poster : splitLines(lead.headline, 2);
    const out = [];

    out.push(el("header", { class: "hero", id: "top", "data-ink": "light" },
      el("h1", { class: "poster fit", "aria-label": poster.join(" ") }, poster.map((l) => el("span", { text: l }))),
      el("p", { class: "hero-sub", text: lead.headline + "." }),
      el("a", { class: "btn", href: "#/" + date + "/" + lead.id, text: store.has(date, lead.id) ? "Read the top story again" : "Read the top story" }),
      el("div", { class: "hero-foot" },
        latest(day),
        el("p", { class: "hero-meta", text: longDate(date) + ". " + countLine(arts.length, unread) + "." }))));

    const by = (id) => arts.filter((a) => a.kind === "story" && a.section === id).sort((x, y) => (x.time < y.time ? 1 : x.time > y.time ? -1 : 0));
    const n = dayNumber(date);

    const agents = by("agents");
    if (agents.length) {
      out.push(el("section", { class: "sec lineup", id: "agents", "data-ink": "dark" },
        el("h2", { class: "head", text: SECTION_NAME.agents }),
        agents.map((a) => link(date, a, "",
          el("h3", { class: "title", text: a.headline }),
          el("p", { class: "side small", text: rowMeta(date, a) }),
          el("p", { class: "text", text: teaser(a) })))));
    }

    const tech = by("techniques");
    if (tech.length) {
      out.push(el("section", { class: "sec on-night poster-list", id: "techniques", "data-ink": "light" },
        el("h2", { class: "head", text: SECTION_NAME.techniques }),
        tech.map((a) => link(date, a, "",
          el("h3", { class: "name", text: a.headline }),
          el("div", { class: "desc" }, el("p", { class: "small", text: rowMeta(date, a) }), el("p", { class: "tease", text: teaser(a) }))))));
    }
    out.push(plate(n));

    const lessons = arts.filter((a) => a.kind === "deepdive" || a.kind === "plain");
    if (lessons.length) {
      out.push(el("section", { class: "sec ended lesson", id: "lesson", "data-ink": "dark" },
        el("div", { class: "grid" },
          el("h2", { class: "head", text: "Today's lesson" }),
          el("div", { class: "rows" }, lessons.map((a) => link(date, a, "",
            el("div", { class: "ends" }, el("h3", { class: "title", text: a.headline }), el("span", { class: "small", text: KIND_NAME[a.kind] + ", " + rowMeta(date, a) })),
            el("div", { class: "rt" }, el("p", { text: teaser(a) }))))))));
    }

    const field = by("field");
    if (field.length) {
      out.push(el("section", { class: "sec on-surface ended", id: "field", "data-ink": "dark" },
        el("div", { class: "grid" },
          el("h2", { class: "head", text: SECTION_NAME.field }),
          el("div", { class: "rows" }, field.map((a) => link(date, a, "",
            el("div", { class: "ends" }, el("h3", { class: "title", text: a.headline }), el("span", { class: "small", text: rowMeta(date, a) })),
            el("div", { class: "rt" }, el("p", { text: teaser(a) }))))))));
    }

    const market = by("market");
    if (market.length) {
      const withNum = market.find((a) => a.number && a.number.value);
      out.push(el("section", { class: "sec on-moss figure", id: "market", "data-ink": "light" },
        withNum ? numberBlock(withNum.number, SECTION_NAME.market, "#/" + date + "/" + withNum.id) : el("h2", { class: "head", text: SECTION_NAME.market }),
        el("div", { class: "market-rows" }, market.map((a) => link(date, a, "",
          el("h3", { class: "title", text: a.headline }),
          el("p", { class: "small", text: rowMeta(date, a) }),
          el("p", { class: "tease", text: teaser(a) }))))));
    }

    if (day.line && day.line.line) {
      out.push(el("section", { class: "room", id: "room", "data-ink": "light" },
        el("div", { class: "quote" },
          el("h2", { class: "head", text: "A line for the room" }),
          el("blockquote", { text: "“" + day.line.line + "”" })),
        day.line.backup ? el("div", { class: "who" }, el("p", null, el("strong", { text: "If challenged" }), rich(day.line.backup))) : null));
    }

    if (day.terms && day.terms.length) {
      out.push(el("section", { class: "sec terms", id: "glossary", "data-ink": "dark" },
        el("div", { class: "grid" },
          el("h2", { class: "head", text: "Terms used today" }),
          el("div", { class: "list" }, day.terms.map((g) => el("details", null, el("summary", { text: g.term }), el("p", null, rich(g.meaning))))))));
    }

    const list = index.days || [];
    const at = list.findIndex((d) => d.date === date);
    const step = (label, d) => d ? el("a", { class: "btn", href: "#/" + d.date, text: label }) : null;
    out.push(footer(el("div", { class: "finish" },
      el("h2", { class: "head", text: unread ? unread + " left to read" : "All read" }),
      el("div", { class: "pair" }, step("Older edition", list[at + 1]), step("Newer edition", list[at - 1]), el("a", { class: "btn", href: "#/", text: "All editions" })))));
    return out;
  }

  /* ---------- one article ---------- */

  function quizBlock(quiz) {
    const explain = el("p", { class: "explain", hidden: true }, rich(quiz.explanation));
    const buttons = quiz.options.map((opt, i) => {
      const b = el("button", { type: "button", text: opt });
      b.addEventListener("click", () => {
        buttons.forEach((other, j) => {
          other.disabled = true;
          if (j === quiz.answer) other.dataset.state = "right";
        });
        if (i !== quiz.answer) b.dataset.state = "wrong";
        explain.hidden = false;
        explain.prepend(el("strong", { text: i === quiz.answer ? "Correct. " : "Not this one. " }));
      });
      return b;
    });
    return el("section", { class: "sec on-surface quiz", id: "quiz", "data-ink": "dark" },
      el("div", { class: "grid" },
        el("h2", { class: "head", text: "Check yourself" }),
        el("p", { class: "question", text: quiz.question }),
        el("div", { class: "answers", "data-ui": true }, el("div", { class: "options" }, buttons), explain)));
  }

  function article(day, a) {
    const date = day.date;
    const arts = day.articles || [];
    const field = a.kind === "story" ? FIELD[a.section] || "" : FIELD[a.kind] || "";
    const ink = INK[field];
    const out = [];
    const meta = whereOf(a) + ". " + longDate(date) + (a.time ? ", " + a.time : "") + ". A " + minutes(a) + " minute read.";

    const paras = bodyOf(a);
    const story = a.kind === "story";
    out.push(el("header", { class: "sec art-head " + (story ? "" : "solo " + field), id: "top", "data-ink": story ? "dark" : ink },
      el("div", { class: "grid" },
        el("h1", { class: "art-h1", text: a.headline }),
        a.kind === "plain" ? el("p", { class: "dek jargon", text: a.jargon }) : a.dek ? el("p", { class: "dek", text: a.dek }) : null,
        el("p", { class: "small meta", text: meta }),
        story ? el("div", { class: "body" }, paras.map((p, i) => i === paras.length - 1 ? withSources(p, a.sources) : el("p", null, rich(p)))) : null)));

    if (story) {
      if (a.soWhat) {
        out.push(el("section", { class: "sec on-surface matters", id: "matters", "data-ink": "dark" },
          el("div", { class: "grid" }, el("h2", { class: "head", text: "So what" }), el("p", null, rich(a.soWhat)))));
      }
      if (a.number && a.number.value) {
        out.push(el("section", { class: "sec on-moss figure", id: "number", "data-ink": "light" }, numberBlock(a.number, "The number")));
      }
    } else if (a.kind === "deepdive") {
      out.push(el("section", { class: "sec dive", id: "steps", "data-ink": "dark" },
        el("h2", { class: "head", text: "Step by step" }),
        el("ol", { class: "bar", "data-ui": true }, (a.steps || []).map((st) =>
          el("li", null, el("h3", { class: "title", text: st.title }), el("p", null, rich(st.body))))),
        a.example && a.example.rows && a.example.rows.length ? el("div", { class: "run" },
          el("h3", { class: "title", text: a.example.title || "One run, step by step" }),
          el("ol", { class: "trace", "data-ui": true }, a.example.rows.map((r) =>
            el("li", { "data-state": r.state || null }, el("span", { class: "who", text: r.actor }), el("span", { text: r.text }))))) : null,
        a.forRequirements && a.forRequirements.length ? el("div", { class: "reqs" },
          el("h3", { class: "title", text: "What to put in the requirement" }),
          el("ul", null, a.forRequirements.map((r) => el("li", null, rich(r))))) : null,
        sourceLinks(a.sources).length ? el("p", { class: "small" }, "From ", sourceLinks(a.sources), ".") : null));
      if (a.quiz && Array.isArray(a.quiz.options)) out.push(quizBlock(a.quiz));
    } else if (a.kind === "plain") {
      const wide = matchMedia("(min-width: 900px)").matches;
      out.push(el("section", { class: "sec on-night stair", id: "plain", "data-ink": "light" },
        el("h2", { class: "head", text: "Say it simply" }),
        el("p", { class: "steps-stmt" }, splitLines(a.stair || a.simple, wide ? 3 : 4).map((line, i) => {
          const span = el("span", { text: line + " " });
          span.style.setProperty("--i", i);
          return span;
        })),
        el("div", { class: "after" },
          a.stair && a.simple ? el("p", { class: "more" }, rich(a.simple)) : null,
          a.analogy ? el("p", { class: "more" }, rich(a.analogy)) : null)));
    }

    out.push(plate(dayNumber(date) + 2 + arts.indexOf(a)));

    const next = arts.find((x) => x.id !== a.id && !store.has(date, x.id));
    const done = el("button", { class: "btn done", type: "button", "aria-pressed": "false", text: "Mark as read" });
    done.addEventListener("click", () => {
      store.set(date, a.id, true);
      go("/" + date);
    });
    out.push(el("footer", { class: "foot end", id: "end", "data-ink": "light" },
      el("div", { class: "top" },
        el("div", { class: "finish" },
          el("h2", { class: "head", text: "Finished?" }), done),
        el("div", { class: "cols" },
          next ? el("div", null,
            el("h3", { text: "Next unread" }),
            el("a", { class: "next", href: "#/" + date + "/" + next.id }, el("span", { class: "what", text: next.headline }), el("span", { class: "small", text: whereOf(next) }))) : null,
          el("div", null,
            el("h3", { text: "This edition" }),
            el("a", { class: "next", href: "#/" + date }, el("span", { class: "what", text: "Front page, " + midDate(date) })),
            el("a", { class: "next", href: "#/" }, el("span", { class: "what", text: "All editions" }))))),
      el("div"),
      el("div", null, el("p", { class: "wordmark fit", text: "Briefing" }))));
    return out;
  }

  /* ---------- type fitted to the measure ---------- */

  function fitAll() {
    app.querySelectorAll(".fit").forEach((node) => {
      const box = node.parentElement;
      const style = getComputedStyle(box);
      const avail = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const lines = node.children.length ? [...node.children] : [node];
      node.style.fontSize = "100px";
      lines.forEach((p) => { p.style.width = "max-content"; });
      const widest = Math.max(...lines.map((p) => p.getBoundingClientRect().width));
      lines.forEach((p) => { p.style.width = ""; });
      let size = (100 * avail) / Math.max(1, widest);
      if (node.classList.contains("poster")) {
        const share = window.innerWidth >= 900 ? 0.42 : 0.5;
        size = Math.min(size, (window.innerHeight * share) / (lines.length * 0.86), 260);
      } else {
        size *= 0.995;
      }
      node.style.fontSize = Math.floor(size) + "px";
    });
  }

  /* ---------- the progress bar and the bar's colour ---------- */

  let dockOn = null;
  let chapters = [];
  let segs = [];
  let plates = [];
  let ticking = false;

  function buildBar() {
    dockOn = null;
    chapters = [...app.querySelectorAll("[data-ink]")];
    plates = [...app.querySelectorAll(".plate img")];
    if (route.view === "day") {
      // One segment per article, filled once it has been read.
      const arts = days[route.date].articles || [];
      segs = [];
      paydown.replaceChildren(...arts.map((a) => {
        const i = el("i");
        i.style.setProperty("--read", store.has(route.date, a.id) ? 1 : 0);
        return i;
      }));
      paydown.hidden = false;
    } else if (route.view === "article") {
      segs = [app];
      paydown.replaceChildren(el("i"));
      paydown.hidden = false;
    } else {
      segs = [];
      paydown.replaceChildren();
      paydown.hidden = true;
    }
    paintBar();
  }

  function paintBar() {
    ticking = false;
    stage(false);
    const doc = document.documentElement;
    const total = Math.max(1, doc.scrollHeight - window.innerHeight);
    const done = Math.min(1, Math.max(0, window.scrollY / total));
    if (route && route.view === "article" && paydown.firstElementChild) {
      paydown.firstElementChild.style.setProperty("--read", done.toFixed(3));
    }
    paydown.setAttribute("aria-valuenow", String(Math.round(done * 100)));
    let ink = "dark";
    let under = chapters[0];
    chapters.forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.top <= 50 && r.bottom > 50) { ink = c.dataset.ink; under = c; }
    });
    if (paydown.dataset.ink !== ink) paydown.dataset.ink = ink;
    // The bar takes the ground and ink of the chapter beneath it, changing exactly at the edge.
    if (under && under !== dockOn) {
      dockOn = under;
      let cs = getComputedStyle(under);
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) && under.firstElementChild) cs = getComputedStyle(under.firstElementChild);
      dock.style.backgroundColor = cs.backgroundColor;
      dock.style.color = cs.color;
    }
    // The prints drift a little against the scroll.
    if (!reduced.matches) {
      const H = window.innerHeight;
      plates.forEach((img) => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < -50 || r.top > H + 50) return;
        const t = Math.min(1, Math.max(0, (H - r.top) / (H + r.height)));
        img.style.transform = "scale(1.14) translateY(" + ((t - 0.5) * -9).toFixed(2) + "%)";
      });
    }
  }

  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(paintBar); }
  }, { passive: true });
  window.addEventListener("resize", () => { fitAll(); paintBar(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitAll(); paintBar(); });

  /* ---------- entrances ---------- */

  // Each part waits just below the fold, hidden only while it is about to be scrolled into view,
  // then rises as it crosses the line. Nothing far down the page is ever hidden.
  let parts = [];
  const PARTS = ".poster span, .hero-sub, .hero .btn, .hero-meta, .art-h1, .dek, .meta, .head, .body, .row, .day-row, .bar li, .run .title, .trace li, .reqs .title, .reqs li, .note, .total, .caption, .slip, .steps-stmt span, .more, blockquote, .who p, .question, .options button, details, figcaption, .matters p, .done, .next, .pair .btn, .wordmark";

  function stage(first) {
    if (!parts.length) return;
    const H = window.innerHeight;
    parts.forEach((p) => {
      if (p.state === "done") return;
      const top = p.node.getBoundingClientRect().top;
      if (p.state === "idle") {
        if ((first && top < H * 0.94) || (top >= H && top < H * 1.35)) {
          p.node.classList.add("rise");
          p.state = "armed";
        } else if (top < H) {
          p.state = "done";
        }
      } else if (top < H * 0.94 && !first) {
        p.node.classList.add("in");
        p.state = "done";
      } else if (top > H * 1.7) {
        p.node.classList.remove("rise");
        p.state = "idle";
      }
    });
  }

  function entrances() {
    parts = [];
    if (reduced.matches) return;
    document.documentElement.classList.add("motion");
    app.querySelectorAll("[data-ink]").forEach((chapter) => {
      let within = 0;
      chapter.querySelectorAll(PARTS).forEach((node) => {
        node.style.setProperty("--d", Math.min(within++, 5));
        parts.push({ node, state: "idle" });
      });
    });
    stage(true);
    requestAnimationFrame(() => requestAnimationFrame(() => stage(false)));
  }

  /* ---------- search across every edition ---------- */

  function closeSheet() { if (sheet.open) sheet.close(); }
  function openSheet(title, body) {
    sheetTitle.textContent = title;
    sheetBody.replaceChildren(...[body].flat());
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
  }

  let corpus = null;
  let corpusFor = 0;
  async function loadCorpus() {
    const list = ((index && index.days) || []).slice(0, 180);
    const size = list.reduce((n, d) => n + d.ids.length, 0);
    if (corpus && corpusFor === size) return corpus;
    const loaded = await Promise.all(list.map((d) => loadDay(d.date).catch(() => null)));
    const docs = [];
    loaded.filter(Boolean).forEach((day) => (day.articles || []).forEach((a) => {
      docs.push({
        date: day.date, id: a.id, where: whereOf(a), title: a.headline,
        text: [a.dek, bodyOf(a), a.soWhat, (a.steps || []).map((s) => s.title + ". " + s.body), a.forRequirements,
          ((a.example || {}).rows || []).map((r) => r.text), a.jargon, a.stair, a.simple, a.analogy].flat().filter(Boolean).join(" ")
      });
    }));
    corpus = docs;
    corpusFor = size;
    return docs;
  }

  function snippet(doc, terms) {
    const hay = doc.text;
    const low = hay.toLowerCase();
    let at = -1;
    terms.forEach((t) => { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
    if (at < 0) return rich(hay.slice(0, 120) + (hay.length > 120 ? "…" : ""));
    const from = Math.max(0, hay.lastIndexOf(" ", Math.max(0, at - 50)));
    const cut = hay.slice(from, from + 150).trim();
    const frag = document.createDocumentFragment();
    const re = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "ig");
    cut.split(re).forEach((part, i) => frag.append(i % 2 ? el("strong", { text: part }) : part));
    if (from > 0) frag.prepend("…");
    if (from + 150 < hay.length) frag.append("…");
    return frag;
  }

  function showSearch() {
    const input = el("input", { type: "search", id: "q", placeholder: "Search every edition", autocomplete: "off", enterkeyhint: "search", "aria-label": "Search every edition" });
    const status = el("p", { class: "small", role: "status", text: "Type a word, a company or a term." });
    const list = el("ul", { class: "hits" });
    let run = 0;
    async function search() {
      const terms = input.value.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
      const mine = ++run;
      if (!terms.length) { list.replaceChildren(); status.textContent = "Type a word, a company or a term."; return; }
      const docs = await loadCorpus();
      if (mine !== run) return;
      const hits = docs
        .map((d) => {
          const title = d.title.toLowerCase();
          const body = d.text.toLowerCase();
          if (!terms.every((t) => title.includes(t) || body.includes(t))) return null;
          return { d, score: terms.filter((t) => title.includes(t)).length };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || (a.d.date < b.d.date ? 1 : -1))
        .slice(0, 40);
      status.textContent = hits.length ? hits.length + (hits.length === 1 ? " result" : " results") : "Nothing found for that. Try one word.";
      list.replaceChildren(...hits.map(({ d }) => {
        const b = el("button", { type: "button" },
          el("span", { class: "small", text: shortDate(d.date) + ", " + d.where + (store.has(d.date, d.id) ? ", read" : "") }),
          el("span", { class: "what", text: d.title }),
          el("span", { class: "snip" }, snippet(d, terms)));
        b.addEventListener("click", () => go("/" + d.date + "/" + d.id));
        return el("li", null, b);
      }));
    }
    input.addEventListener("input", search);
    openSheet("Search", [input, status, list]);
    input.focus();
  }
  navSearch.addEventListener("click", showSearch);
  document.getElementById("sheetClose").addEventListener("click", closeSheet);

  /* ---------- keeping up with new articles ---------- */

  // Coming back to the app picks up anything published since, without disturbing an article being read.
  async function checkForNew() {
    try {
      const before = JSON.stringify(index);
      await loadIndex(true);
      if (JSON.stringify(index) === before) return;
      corpus = null;
      (index.days || []).slice(0, 2).forEach((d) => { delete days[d.date]; });
      if (route && route.view !== "article") show();
    } catch (e) { /* offline: keep what is on screen */ }
  }

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("hashchange", show);
  window.addEventListener("online", () => { offline = false; say(""); checkForNew(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    checkForNew();
    // An app left open in the background never navigates, so ask for a newer version here.
    if (swReg) swReg.update().catch(() => {});
  });
  // A new version takes over as soon as it has installed: the page reloads itself once,
  // waiting until an article being read is left.
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.register("sw.js").then((reg) => { swReg = reg; }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      if (route && route.view === "article") { reloadDue = true; return; }
      reloaded = true;
      location.reload();
    });
    // A tapped notification asks the open app to go to its article.
    navigator.serviceWorker.addEventListener("message", async (event) => {
      if (!event.data || event.data.type !== "open") return;
      const hash = String(event.data.hash || "#/");
      const m = hash.match(/^#\/(\d{4}-\d{2}-\d{2})/);
      try {
        await loadIndex(true);
        if (m) delete days[m[1]];
      } catch (e) { /* offline: open what is saved */ }
      go(hash.replace(/^#/, ""));
    });
  }

  show();
})();
