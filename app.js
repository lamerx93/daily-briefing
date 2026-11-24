(() => {
  "use strict";

  const app = document.getElementById("app");
  const rail = document.getElementById("rail");
  const notice = document.getElementById("notice");

  const HUES = {
    lead: "marigold",
    agents: "periwinkle",
    techniques: "teal",
    deep: "sky",
    field: "pink",
    market: "tangerine",
    plain: "marigold",
    room: "periwinkle",
    quiz: "teal",
    glossary: "ink"
  };
  const SPARE_HUES = ["periwinkle", "teal", "pink", "tangerine", "sky"];

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
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        frag.append(el("strong", { text: part.slice(2, -2) }));
      } else if (part) {
        frag.append(part);
      }
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

  function sources(list) {
    const links = (list || [])
      .map((s) => {
        const href = safeUrl(s.url);
        if (!href) return null;
        return el("a", { href, target: "_blank", rel: "noopener", title: s.title || null }, s.publisher || s.title || "Source");
      })
      .filter(Boolean);
    if (!links.length) return null;
    return el("p", { class: "sources" }, "Sources: ", links);
  }

  function parseDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  function longDate(iso) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(parseDate(iso));
  }
  function shortDate(iso) {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parseDate(iso));
  }

  /* ---------- reading record (this device only) ---------- */

  const store = {
    get() {
      try {
        const v = JSON.parse(localStorage.getItem("briefing.read") || "[]");
        return Array.isArray(v) ? v : [];
      } catch (e) {
        return [];
      }
    },
    add(date) {
      try {
        const set = new Set(this.get());
        set.add(date);
        localStorage.setItem("briefing.read", JSON.stringify([...set].sort()));
      } catch (e) { /* private mode: the button still works for this visit */ }
    }
  };

  // Consecutive calendar days read, ending at the most recent day read.
  function streak(readDates) {
    if (!readDates.length) return 0;
    const days = [...readDates].sort().reverse();
    let n = 1;
    for (let i = 1; i < days.length; i++) {
      const gap = Math.round((parseDate(days[i - 1]) - parseDate(days[i])) / 86400000);
      if (gap === 1) n++;
      else break;
    }
    return n;
  }
  function streakText(n) {
    if (n <= 0) return "";
    return n === 1 ? "1 day read" : n + " days in a row";
  }

  /* ---------- rendering ---------- */

  function section(id, title, hue, ...kids) {
    return el("section", { class: "sec hue-" + hue, id, "data-title": title },
      title ? el("h2", { class: "sec-title", text: title }) : null, kids);
  }

  function renderItems(items) {
    return (items || []).map((it) =>
      el("article", { class: "item" },
        el("h3", { text: it.headline }),
        el("p", null, rich(it.body)),
        it.soWhat ? el("p", { class: "sowhat" }, el("b", { text: "So what: " }), rich(it.soWhat)) : null,
        sources(it.sources)));
  }

  function renderQuiz(quiz) {
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
    return [el("p", { class: "question", text: quiz.question }), el("div", { class: "options" }, buttons), explain];
  }

  function render(ed, index) {
    const read = store.get();
    const out = [];
    let spare = 0;

    out.push(el("header", { class: "masthead" },
      el("span", null, el("strong", { text: longDate(ed.date) })),
      el("span", { text: (ed.readMinutes ? ed.readMinutes + " min read" : "") })));

    const lead = ed.lead || {};
    out.push(el("section", { class: "sec lead hue-marigold", id: "lead", "data-title": "Top story" },
      el("h1", { text: lead.headline }),
      lead.dek ? el("p", { class: "dek", text: lead.dek }) : null,
      (lead.body || []).map((p) => el("p", null, rich(p))),
      sources(lead.sources),
      lead.whyItMatters ? el("div", { class: "matters" },
        el("h2", { text: "Why it matters to you" }),
        el("p", null, rich(lead.whyItMatters))) : null));

    const renderGroup = (s) => {
      const hue = HUES[s.id] || SPARE_HUES[spare++ % SPARE_HUES.length];
      out.push(section(s.id, s.title, hue, s.intro ? el("p", null, rich(s.intro)) : null, renderItems(s.items)));
    };

    const groups = ed.sections || [];
    // Deep dive sits after the first two news sections, so the day's craft lesson follows the day's craft news.
    groups.slice(0, 2).forEach(renderGroup);

    const dd = ed.deepDive;
    if (dd) {
      out.push(section("deep", "Deep dive", HUES.deep,
        el("h3", { class: "dive-title", text: dd.title }),
        dd.intro ? el("p", null, rich(dd.intro)) : null,
        el("ol", { class: "steps" }, (dd.steps || []).map((s) =>
          el("li", null, el("h3", { text: s.title }), el("p", null, rich(s.body))))),
        dd.forRequirements && dd.forRequirements.length ? [
          el("h3", { class: "checklist-title", text: "What to put in the requirement" }),
          el("ul", { class: "checklist" }, dd.forRequirements.map((r) => el("li", null, rich(r))))
        ] : null,
        sources(dd.sources)));
    }

    groups.slice(2).forEach(renderGroup);

    const plain = ed.plain;
    if (plain) {
      out.push(el("section", { class: "sec plain hue-marigold", id: "plain", "data-title": "Say it simply" },
        el("h2", { class: "sec-title", text: "Say it simply" }),
        el("p", { class: "term", text: plain.term }),
        plain.jargon ? el("p", { class: "jargon", text: plain.jargon }) : null,
        el("p", { class: "simple" }, rich(plain.simple)),
        plain.analogy ? el("p", { class: "analogy" }, rich(plain.analogy)) : null));
    }

    const room = ed.roomLine;
    if (room) {
      out.push(el("section", { class: "sec room hue-periwinkle", id: "room", "data-title": "A line for the room" },
        el("h2", { class: "sec-title", text: "A line for the room" }),
        el("blockquote", { text: room.line }),
        room.backup ? el("p", { class: "backup" }, rich(room.backup)) : null));
    }

    if (ed.quiz && Array.isArray(ed.quiz.options)) {
      out.push(el("section", { class: "sec quiz hue-teal", id: "quiz", "data-title": "Check yourself" },
        el("h2", { class: "sec-title", text: "Check yourself" }), renderQuiz(ed.quiz)));
    }

    if (ed.glossary && ed.glossary.length) {
      out.push(section("glossary", "Terms used today", HUES.glossary,
        el("dl", { class: "glossary" }, ed.glossary.map((g) => [el("dt", { text: g.term }), el("dd", null, rich(g.meaning))]))));
    }

    // Finish
    const isRead = read.includes(ed.date);
    const streakLine = el("p", { class: "streak", text: isRead ? streakText(streak(read)) : "" });
    const done = el("button", { class: "done", type: "button", "aria-pressed": String(isRead), text: isRead ? "Read" : "Mark as read" });
    done.addEventListener("click", () => {
      store.add(ed.date);
      done.setAttribute("aria-pressed", "true");
      done.textContent = "Read";
      const now = store.get();
      streakLine.textContent = streakText(streak(now.length ? now : [ed.date]));
    });
    out.push(el("div", { class: "finish" }, done, streakLine));

    const editions = (index && index.editions) || [];
    if (editions.length > 1) {
      out.push(el("nav", { class: "archive", "aria-label": "Earlier editions" },
        el("h2", { text: "Earlier editions" }),
        el("ul", null, editions.slice(0, 30).map((e) =>
          el("li", null, el("a", { href: "#" + e.date, "aria-current": e.date === ed.date ? "page" : null },
            el("span", { text: shortDate(e.date) }), el("span", { text: e.headline })))))));
    }

    out.push(el("p", { class: "colophon", text: "A new edition is published every morning, Singapore time. The latest one you opened stays available offline." }));

    app.replaceChildren(...out);
    shown = ed.date;
    document.title = "Briefing, " + shortDate(ed.date);
    buildRail();
  }

  /* ---------- the rail ---------- */

  let secs = [];
  let ticking = false;

  function buildRail() {
    secs = [...app.querySelectorAll("section.sec")];
    rail.replaceChildren(...secs.map((s, i) => {
      const hue = [...s.classList].find((c) => c.startsWith("hue-")) || "hue-ink";
      const a = el("a", { href: "#" + s.id, class: hue, "aria-label": s.dataset.title || s.id });
      a.style.setProperty("--i", i);
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        s.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      });
      return a;
    }));
    sizeRail();
    paintRail();
  }

  function sizeRail() {
    secs.forEach((s, i) => {
      if (rail.children[i]) rail.children[i].style.flexGrow = Math.max(1, Math.round(s.offsetHeight));
    });
  }

  function paintRail() {
    ticking = false;
    const line = window.innerHeight * 0.6;
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    secs.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const done = atEnd ? 1 : Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height)));
      if (rail.children[i]) rail.children[i].style.setProperty("--read", done.toFixed(3));
    });
  }

  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(paintRail); }
  }, { passive: true });
  window.addEventListener("resize", () => { sizeRail(); paintRail(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sizeRail(); paintRail(); });

  /* ---------- loading ---------- */

  async function getJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return { data: await res.json(), cached: res.headers.get("x-briefing-cache") === "1" };
  }

  function say(msg) {
    notice.textContent = msg || "";
    notice.hidden = !msg;
  }

  let index = null;
  let shown = null;

  // Reopening the app the next morning should pick up the new edition,
  // without disturbing an edition that is being read.
  async function checkForNew() {
    if (location.hash) return;
    try {
      const got = await getJson("data/index.json");
      const newest = got.data.editions && got.data.editions[0];
      if (newest && newest.date !== shown) { index = got.data; show(); }
    } catch (e) { /* offline: keep what is on screen */ }
  }

  async function show() {
    try {
      if (!index) {
        const got = await getJson("data/index.json");
        index = got.data;
      }
      const editions = index.editions || [];
      if (!editions.length) throw new Error("no editions");
      const wanted = location.hash.slice(1);
      const pick = editions.find((e) => e.date === wanted) || editions[0];
      const got = await getJson("data/" + pick.date + ".json");
      render(got.data, index);
      if (got.cached || navigator.onLine === false) {
        say("You're offline. This is the edition saved on this phone.");
      } else {
        say("");
      }
      if (wanted && wanted === pick.date) window.scrollTo(0, 0);
      // Keep the last week available offline.
      editions.slice(0, 7).forEach((e) => { if (e.date !== pick.date) fetch("data/" + e.date + ".json").catch(() => {}); });
    } catch (err) {
      if (!app.querySelector("section")) {
        app.replaceChildren(el("p", { class: "loading", text: "The briefing couldn't load. Connect to the internet and open it again." }));
      }
    }
  }

  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(h)) show();
  });
  window.addEventListener("online", () => { say(""); checkForNew(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForNew();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  show();
})();
