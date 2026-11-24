(() => {
  "use strict";

  const app = document.getElementById("app");
  const paydown = document.getElementById("paydown");
  const notice = document.getElementById("notice");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

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
  function sources(list) {
    const links = sourceLinks(list);
    return links.length ? el("p", { class: "small" }, "From ", links, ".") : null;
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
  function longDate(iso) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(parseDate(iso));
  }
  function shortDate(iso) {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parseDate(iso));
  }

  // Break a sentence into n lines of roughly equal length.
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
      const target = (total * (lines.length + 1)) / n;
      if (lines.length < n - 1 && used >= target - 2 && left >= n - lines.length - 1) {
        lines.push(line.join(" "));
        line = [];
      }
    });
    if (line.length) lines.push(line.join(" "));
    return lines;
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
    set(date, read) {
      try {
        const set = new Set(this.get());
        if (read) set.add(date); else set.delete(date);
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
    return n === 1 ? "1 day read." : n + " days in a row.";
  }

  /* ---------- pictures: Hokusai's eight waterfalls, four a day, in rotation ---------- */

  const FALLS = [
    ["amida", "The Amida Falls in the far reaches of the Kisokaid\u014d road", 1432],
    ["kirifuri", "Kirifuri Waterfall at Kurokami Mountain in Shimotsuke", 1425],
    ["yoshitsune", "The waterfall where Yoshitsune washed his horse, at Yoshino", 1432],
    ["yoro", "Y\u014dr\u014d Waterfall in Mino Province", 1407],
    ["ono", "Ono Waterfall on the Kisokaid\u014d", 1400],
    ["aoigaoka", "The falls at Aoigaoka in Edo", 1442],
    ["roben", "R\u014dben Waterfall at \u014cyama in Sagami Province", 1417],
    ["kiyotaki", "Kiyotaki Kannon Waterfall at Sakanoshita on the T\u014dkaid\u014d", 1427]
  ];

  function plate(ed, k) {
    const day = Math.round(parseDate(ed.date).getTime() / 86400000);
    const f = FALLS[(((day % 2) * 4 + k) % 8 + 8) % 8];
    const img = el("img", { src: "pictures/" + f[0] + ".webp", width: 1000, height: f[2], alt: f[1] + ", a colour woodblock print by Katsushika Hokusai", loading: "lazy", decoding: "async" });
    img.addEventListener("error", () => { const fig = img.closest(".plate"); if (fig) fig.hidden = true; });
    return el("figure", { class: "plate", "data-ink": "light" },
      el("div", { class: "frame" }, img),
      el("figcaption", null, el("span", { text: f[1] }), el("span", { text: "Katsushika Hokusai, about 1832" })));
  }

  /* ---------- sections ---------- */

  function itemParts(it) {
    return {
      body: withSources(it.body, it.sources),
      soWhat: it.soWhat ? el("p", { class: "sowhat" }, "So what: ", rich(it.soWhat)) : null
    };
  }

  function lineup(s) {
    return el("section", { class: "sec lineup", id: s.id, "data-ink": "dark" },
      el("h2", { class: "head", text: s.title }),
      (s.items || []).map((it) => {
        const p = itemParts(it);
        return el("article", { class: "row" },
          el("h3", { class: "title", text: it.headline }),
          el("div", { class: "text" }, p.body),
          el("div", { class: "side" }, p.soWhat));
      }));
  }

  function posterList(s) {
    return el("section", { class: "sec on-night poster-list", id: s.id, "data-ink": "light" },
      el("h2", { class: "head", text: s.title }),
      (s.items || []).map((it) => {
        const p = itemParts(it);
        return el("article", { class: "row" },
          el("h3", { class: "name", text: it.headline }),
          el("div", { class: "desc" }, p.body, p.soWhat));
      }));
  }

  function ended(s) {
    return el("section", { class: "sec on-surface ended", id: s.id, "data-ink": "dark" },
      el("div", { class: "grid" },
        el("h2", { class: "head", text: s.title }),
        el("div", { class: "rows" }, (s.items || []).map((it) => {
          const p = itemParts(it);
          const first = (it.sources || [])[0];
          return el("article", { class: "row" },
            el("div", { class: "ends" },
              el("h3", { class: "title", text: it.headline }),
              first ? el("span", { class: "small", text: first.publisher || "" }) : null),
            el("div", { class: "rt" }, p.body, p.soWhat));
        }))));
  }

  function market(s, num) {
    const rows = el("div", { class: "market-rows" }, (s.items || []).map((it) => {
      const p = itemParts(it);
      return el("article", { class: "row" }, el("h3", { class: "title", text: it.headline }), p.body, p.soWhat);
    }));
    if (!num || !num.value) {
      return el("section", { class: "sec on-moss figure", id: s.id, "data-ink": "light" },
        el("h2", { class: "head", text: s.title }), rows);
    }
    const dots = "·".repeat(80);
    const slip = num.rows && num.rows.length ? el("div", { class: "slip", "data-ui": true },
      num.unit ? el("p", { class: "unit", text: num.unit }) : null,
      el("ul", null,
        num.rows.map((r) => el("li", null, el("span", { text: r.label }), el("span", { class: "dots", "aria-hidden": "true", text: dots }), el("span", { text: r.value }))),
        num.total ? el("li", { class: "sum" }, el("span", { text: "Total" }), el("span", { class: "dots", "aria-hidden": "true", text: dots }), el("span", { text: num.total })) : null)) : null;
    return el("section", { class: "sec on-moss figure", id: s.id, "data-ink": "light" },
      el("div", { class: "split" },
        el("div", { class: "left" },
          el("h2", { class: "head", text: s.title }),
          el("p", { class: "note" }, rich(num.caption)),
          el("p", { class: "total", text: num.value }),
          num.source ? el("p", { class: "caption" }, "From ", sourceLinks([num.source])) : null),
        slip),
      rows);
  }

  function deepDive(dd) {
    return el("section", { class: "sec dive", id: "deep", "data-ink": "dark" },
      el("div", { class: "top" },
        el("h2", { class: "head", text: dd.title }),
        dd.intro ? el("p", { class: "intro" }, rich(dd.intro)) : null),
      el("ol", { class: "bar", "data-ui": true }, (dd.steps || []).map((st) =>
        el("li", null, el("h3", { class: "title", text: st.title }), el("p", null, rich(st.body))))),
      dd.example && dd.example.rows && dd.example.rows.length ? el("div", { class: "run" },
        el("h3", { class: "title", text: dd.example.title || "One run, step by step" }),
        el("ol", { class: "trace", "data-ui": true }, dd.example.rows.map((r) =>
          el("li", { "data-state": r.state || null }, el("span", { class: "who", text: r.actor }), el("span", { text: r.text }))))) : null,
      dd.forRequirements && dd.forRequirements.length ? el("div", { class: "reqs" },
        el("h3", { class: "title", text: "What to put in the requirement" }),
        el("ul", null, dd.forRequirements.map((r) => el("li", null, rich(r))))) : null,
      sources(dd.sources));
  }

  function plainSection(plain) {
    const wide = matchMedia("(min-width: 900px)").matches;
    const stmt = plain.stair || plain.simple;
    return el("section", { class: "sec on-night stair", id: "plain", "data-ink": "light" },
      el("div", { class: "top" },
        el("h2", { class: "head", text: "Say it simply" }),
        el("div", { class: "intro" },
          el("p", { class: "term", text: plain.term }),
          plain.jargon ? el("p", { class: "jargon", text: plain.jargon }) : null)),
      el("p", { class: "steps-stmt" }, splitLines(stmt, wide ? 3 : 4).map((line, i) => {
        const span = el("span", { text: line + " " });
        span.style.setProperty("--i", i);
        return span;
      })),
      el("div", { class: "after" },
        plain.stair && plain.simple ? el("p", { class: "more" }, rich(plain.simple)) : null,
        plain.analogy ? el("p", { class: "more" }, rich(plain.analogy)) : null));
  }

  function roomSection(room) {
    return el("section", { class: "room", id: "room", "data-ink": "light" },
      el("div", { class: "quote" },
        el("h2", { class: "head", text: "A line for the room" }),
        el("blockquote", { text: "“" + room.line + "”" })),
      room.backup ? el("div", { class: "who" }, el("p", null, el("strong", { text: "If challenged" }), rich(room.backup.replace(/^If challenged:\s*/i, "")))) : null);
  }

  function quizSection(quiz) {
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

  function termsSection(list) {
    return el("section", { class: "sec terms", id: "glossary", "data-ink": "dark" },
      el("div", { class: "grid" },
        el("h2", { class: "head", text: "Terms used today" }),
        el("div", { class: "list" }, list.map((g) =>
          el("details", null, el("summary", { text: g.term }), el("p", null, rich(g.meaning)))))));
  }

  function footer(ed, index) {
    const read = store.get();
    const isRead = read.includes(ed.date);
    const streakLine = el("p", { class: "streak", text: isRead ? streakText(streak(read)) : "" });
    const done = el("button", { class: "btn done", type: "button", "aria-pressed": String(isRead), text: isRead ? "Read" : "Mark as read" });
    done.addEventListener("click", () => setRead(ed.date, done.getAttribute("aria-pressed") !== "true"));
    const editions = (index && index.editions) || [];
    return el("footer", { class: "foot", id: "end", "data-ink": "light" },
      el("div", { class: "top" },
        el("div", { class: "finish" },
          el("h2", { class: "head", text: "That's today" }), done, streakLine),
        el("div", { class: "cols" },
          el("div", null,
            el("h3", { text: "Editions" }),
            el("ul", null, editions.slice(0, 14).map((e) =>
              el("li", null, el("a", { href: "#" + e.date, "aria-current": e.date === ed.date ? "page" : null },
                el("span", { text: shortDate(e.date) }), el("span", { text: e.headline })))))),
          el("div", null,
            el("h3", { text: "How it works" }),
            el("p", { text: "A new edition is published every morning, Singapore time. The last one you opened stays on this phone and opens without a connection." })))),
      el("div"),
      el("div", null,
        el("p", { class: "wordmark fit", text: "Briefing" }),
        el("p", { class: "legal", text: "Written from public sources. Each item links to where it came from. Prints: Katsushika Hokusai, A Tour of Waterfalls in Various Provinces, about 1832, The Metropolitan Museum of Art, public domain." })));
  }

  function render(ed, index) {
    const lead = ed.lead || {};
    const poster = Array.isArray(lead.poster) && lead.poster.length === 2 ? lead.poster : splitLines(lead.headline, 2);
    const out = [];

    out.push(el("header", { class: "hero", id: "top", "data-ink": "light" },
      el("h1", { class: "poster fit", "aria-label": poster.join(" ") }, poster.map((l) => el("span", { text: l }))),
      el("p", { class: "hero-sub", text: lead.headline + "." }),
      el("a", { class: "btn", href: "#lead", text: "Start reading" }),
      el("div", { class: "hero-foot" },
        el("ul", { class: "inside" }, (ed.sections || []).filter((s) => s.items && s.items[0]).slice(0, 4).map((s) =>
          el("li", null, el("a", { href: "#" + s.id }, el("span", { text: s.title }), el("span", { text: s.items[0].headline }))))),
        el("p", { class: "hero-meta", text: "Daily Briefing, " + longDate(ed.date) + (ed.readMinutes ? ". A " + ed.readMinutes + " minute read." : ".") }))));

    out.push(el("section", { class: "sec lead", id: "lead", "data-ink": "dark" },
      el("div", { class: "grid" },
        el("h2", { class: "head", text: "Top story" }),
        lead.dek ? el("p", { class: "dek", text: lead.dek }) : null,
        el("div", { class: "body" }, (lead.body || []).map((p, i, all) =>
          i === all.length - 1 ? withSources(p, lead.sources) : el("p", null, rich(p)))))));
    if (lead.whyItMatters) {
      out.push(el("section", { class: "sec on-surface matters", id: "matters", "data-ink": "dark" },
        el("div", { class: "grid" },
          el("h2", { class: "head", text: "Why it matters to you" }),
          el("p", null, rich(lead.whyItMatters)))));
    }
    out.push(plate(ed, 0));

    const byId = {};
    (ed.sections || []).forEach((s) => { byId[s.id] = s; });
    if (byId.agents) out.push(lineup(byId.agents));
    if (byId.techniques) out.push(posterList(byId.techniques));
    out.push(plate(ed, 1));
    if (ed.deepDive) out.push(deepDive(ed.deepDive));
    if (byId.field) out.push(ended(byId.field));
    out.push(plate(ed, 2));
    if (byId.market) out.push(market(byId.market, ed.number));
    (ed.sections || []).filter((s) => !["agents", "techniques", "field", "market"].includes(s.id)).forEach((s) => out.push(lineup(s)));
    if (ed.plain) out.push(plainSection(ed.plain));
    if (ed.roomLine) out.push(roomSection(ed.roomLine));
    out.push(plate(ed, 3));
    if (ed.quiz && Array.isArray(ed.quiz.options)) out.push(quizSection(ed.quiz));
    if (ed.glossary && ed.glossary.length) out.push(termsSection(ed.glossary));
    out.push(footer(ed, index));

    app.replaceChildren(...out);
    shown = ed.date;
    current = ed;
    syncRead();
    document.title = "Briefing, " + shortDate(ed.date);

    app.querySelector(".hero .btn").addEventListener("click", (ev) => {
      ev.preventDefault();
      document.getElementById("lead").scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
    });
    app.querySelectorAll(".inside a").forEach((a) => a.addEventListener("click", (ev) => {
      const target = document.getElementById(a.getAttribute("href").slice(1));
      if (!target) return;
      ev.preventDefault();
      target.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
    }));

    fitAll();
    buildBar();
    entrances();
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

  /* ---------- the paydown bar ---------- */

  const dock = document.getElementById("dock");
  let dockOn = null;
  let chapters = [];
  let segs = [];
  let plates = [];
  let ticking = false;

  function buildBar() {
    dockOn = null;
    chapters = [...app.querySelectorAll("[data-ink]")];
    segs = chapters.filter((c) => !c.classList.contains("plate"));
    plates = [...app.querySelectorAll(".plate img")];
    paydown.replaceChildren(...segs.map(() => el("i")));
    sizeBar();
    paintBar();
  }
  function sizeBar() {
    segs.forEach((c, i) => {
      if (paydown.children[i]) paydown.children[i].style.flexGrow = Math.max(1, Math.round(c.offsetHeight));
    });
  }
  function paintBar() {
    ticking = false;
    stage(false);
    const line = window.innerHeight * 0.6;
    const doc = document.documentElement;
    const atEnd = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
    let ink = "dark";
    segs.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const done = atEnd ? 1 : Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height)));
      if (paydown.children[i]) paydown.children[i].style.setProperty("--read", done.toFixed(3));
    });
    let under = chapters[0];
    chapters.forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.top <= 50 && r.bottom > 50) { ink = c.dataset.ink; under = c; }
    });
    // The bar takes the ground and ink of the chapter beneath it, changing exactly at the edge.
    if (under && dock && under !== dockOn) {
      dockOn = under;
      let cs = getComputedStyle(under);
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) && under.firstElementChild) cs = getComputedStyle(under.firstElementChild);
      dock.style.backgroundColor = cs.backgroundColor;
      dock.style.color = cs.color;
    }
    // The prints drift a little against the scroll: the page's one moving picture.
    if (!reduced.matches) {
      const H = window.innerHeight;
      plates.forEach((img) => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < -50 || r.top > H + 50) return;
        const t = Math.min(1, Math.max(0, (H - r.top) / (H + r.height)));
        img.style.transform = "scale(1.14) translateY(" + ((t - 0.5) * -9).toFixed(2) + "%)";
      });
    }
    if (paydown.dataset.ink !== ink) paydown.dataset.ink = ink;
    const total = Math.max(1, doc.scrollHeight - window.innerHeight);
    paydown.setAttribute("aria-valuenow", String(Math.round((Math.min(total, window.scrollY) / total) * 100)));
  }

  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(paintBar); }
  }, { passive: true });
  window.addEventListener("resize", () => { fitAll(); sizeBar(); paintBar(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitAll(); sizeBar(); paintBar(); });

  /* ---------- entrances: the parts of each section arrive in reading order ---------- */

  // Each part waits just below the fold, hidden only while it is about to be scrolled into view,
  // then rises as it crosses the line. Nothing far down the page is ever hidden, so a jump,
  // a failed script or a long page cannot leave a hole.
  let parts = [];

  function stage(first) {
    if (!parts.length) return;
    const H = window.innerHeight;
    parts.forEach((p) => {
      if (p.state === "done") return;
      const top = p.node.getBoundingClientRect().top;
      if (p.state === "idle") {
        if (first && top < H * 0.94) {
          p.node.classList.add("rise");
          p.state = "armed";
        } else if (top >= H && top < H * 1.35) {
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
    const groups = [
      [".hero", ".poster span, .hero-sub, .btn, .inside li, .hero-meta"],
      [".lead", ".head, .dek, .body"],
      [".matters", ".head, p"],
      [".lineup", ".head, .row"],
      [".poster-list", ".head, .row"],
      [".dive", ".head, .intro, .bar li, .run .title, .trace li, .reqs .title, .reqs li"],
      [".ended", ".head, .row"],
      [".figure", ".head, .note, .total, .caption, .slip, .market-rows .row"],
      [".stair", ".head, .intro, .steps-stmt span, .more"],
      [".room", ".head, blockquote, .who p"],
      [".plate", "figcaption"],
      [".quiz", ".head, .question, .options button"],
      [".terms", ".head, details"],
      [".foot", ".head, .done, .cols > div, .wordmark"]
    ];
    groups.forEach(([sec, sel]) => {
      app.querySelectorAll(sec).forEach((s) => {
        let within = 0;
        s.querySelectorAll(sel).forEach((node) => {
          node.style.setProperty("--d", Math.min(within++, 5));
          parts.push({ node, state: "idle" });
        });
      });
    });
    stage(true);
    requestAnimationFrame(() => requestAnimationFrame(() => stage(false)));
  }

  /* ---------- reading record shown in two places ---------- */

  const readBtn = document.getElementById("readToggle");

  function syncRead() {
    if (!shown) return;
    const read = store.get();
    const isRead = read.includes(shown);
    if (readBtn) {
      readBtn.setAttribute("aria-pressed", String(isRead));
      readBtn.textContent = isRead ? "Read" : "Mark read";
    }
    const done = app.querySelector(".foot .done");
    if (done) {
      done.setAttribute("aria-pressed", String(isRead));
      done.textContent = isRead ? "Read" : "Mark as read";
    }
    const line = app.querySelector(".foot .streak");
    if (line) line.textContent = isRead ? streakText(streak(read)) : "";
  }
  function setRead(date, read) {
    store.set(date, read);
    syncRead();
  }
  if (readBtn) readBtn.addEventListener("click", () => { if (shown) setRead(shown, readBtn.getAttribute("aria-pressed") !== "true"); });

  /* ---------- the sheet: sections, editions, search ---------- */

  const sheet = document.getElementById("sheet");
  const sheetTitle = document.getElementById("sheetTitle");
  const sheetBody = document.getElementById("sheetBody");

  function closeSheet() { if (sheet.open) sheet.close(); }
  function openSheet(title, body) {
    sheetTitle.textContent = title;
    sheetBody.replaceChildren(...[body].flat());
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
  }
  function jump(id) {
    closeSheet();
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
  }
  function openEdition(date, sectionId) {
    closeSheet();
    if (date === shown) { if (sectionId) jump(sectionId); else window.scrollTo(0, 0); return; }
    pending = sectionId || null;
    location.hash = date;
  }

  // What each part of an edition is called, and where it sits on the page.
  function outline(ed) {
    const rows = [["top", "Front page", ed.lead.headline], ["lead", "Top story", ed.lead.dek], ["matters", "Why it matters to you", ""]];
    const byId = {};
    (ed.sections || []).forEach((s) => { byId[s.id] = s; });
    const sec = (id) => { if (byId[id]) rows.push([id, byId[id].title, (byId[id].items || []).map((i) => i.headline).join(". ")]); };
    sec("agents"); sec("techniques");
    if (ed.deepDive) rows.push(["deep", "Deep dive", ed.deepDive.title]);
    sec("field"); sec("market");
    if (ed.plain) rows.push(["plain", "Say it simply", ed.plain.term]);
    if (ed.roomLine) rows.push(["room", "A line for the room", ""]);
    if (ed.quiz) rows.push(["quiz", "Check yourself", ""]);
    if (ed.glossary) rows.push(["glossary", "Terms used today", ed.glossary.map((g) => g.term).join(", ")]);
    return rows;
  }

  function showSections() {
    if (!current) return;
    openSheet("Sections", el("ul", { class: "jump" }, outline(current).map(([id, title, sub]) => {
      const b = el("button", { type: "button" }, el("span", { class: "big", text: title }), sub ? el("span", { class: "small", text: sub }) : null);
      b.addEventListener("click", () => jump(id));
      return el("li", null, b);
    })));
  }

  function showEditions() {
    const editions = (index && index.editions) || [];
    const read = store.get();
    const at = editions.findIndex((e) => e.date === shown);
    const step = (label, to) => {
      const b = el("button", { class: "btn", type: "button", text: label, disabled: !editions[to] });
      b.addEventListener("click", () => editions[to] && openEdition(editions[to].date));
      return b;
    };
    openSheet("Editions", [
      el("div", { class: "pair" }, step("Older day", at + 1), step("Newer day", at - 1)),
      el("ul", { class: "days" }, editions.map((e) => {
        const b = el("button", { type: "button", "aria-current": e.date === shown ? "true" : null },
          el("span", { class: "when", text: shortDate(e.date) }),
          el("span", { class: "what", text: e.headline }),
          el("span", { class: "small", text: read.includes(e.date) ? "Read" : "Unread" }));
        b.addEventListener("click", () => openEdition(e.date));
        return el("li", null, b);
      }))
    ]);
  }

  // Search reads every edition once, then keeps them in memory.
  let corpus = null;
  async function loadCorpus() {
    if (corpus) return corpus;
    const editions = ((index && index.editions) || []).slice(0, 120);
    const loaded = await Promise.all(editions.map((e) => getJson("data/" + e.date + ".json").then((g) => g.data).catch(() => null)));
    const docs = [];
    loaded.filter(Boolean).forEach((ed) => {
      const add = (id, where, title, ...texts) => docs.push({ date: ed.date, id, where, title: title || where, text: texts.flat().filter(Boolean).join(" ") });
      const lead = ed.lead || {};
      add("lead", "Top story", lead.headline, lead.dek, lead.body, lead.whyItMatters);
      (ed.sections || []).forEach((s) => (s.items || []).forEach((it) => add(s.id, s.title, it.headline, it.body, it.soWhat)));
      const dd = ed.deepDive;
      if (dd) add("deep", "Deep dive", dd.title, dd.intro, (dd.steps || []).map((s) => s.title + ". " + s.body), dd.forRequirements, ((dd.example || {}).rows || []).map((r) => r.text));
      if (ed.plain) add("plain", "Say it simply", ed.plain.term, ed.plain.jargon, ed.plain.stair, ed.plain.simple, ed.plain.analogy);
      if (ed.roomLine) add("room", "A line for the room", ed.roomLine.line, ed.roomLine.backup);
      (ed.glossary || []).forEach((g) => add("glossary", "Terms", g.term, g.meaning));
    });
    corpus = docs;
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
          el("span", { class: "small", text: shortDate(d.date) + ", " + d.where }),
          el("span", { class: "what", text: d.title }),
          el("span", { class: "snip" }, snippet(d, terms)));
        b.addEventListener("click", () => openEdition(d.date, d.id));
        return el("li", null, b);
      }));
    }
    input.addEventListener("input", search);
    openSheet("Search", [input, status, list]);
    input.focus();
  }

  document.querySelectorAll("#dock [data-open]").forEach((b) => b.addEventListener("click", () => {
    const what = b.dataset.open;
    if (what === "sections") showSections();
    else if (what === "editions") showEditions();
    else showSearch();
  }));
  document.getElementById("sheetClose").addEventListener("click", closeSheet);

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
  let current = null;
  let pending = null;

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
      if (pending && document.getElementById(pending)) {
        document.getElementById(pending).scrollIntoView({ block: "start" });
      } else if (wanted === pick.date) {
        window.scrollTo(0, 0);
      }
      pending = null;
      say(got.cached || navigator.onLine === false ? "You're offline. This is the edition saved on this phone." : "");
      // Keep the last week available offline.
      editions.slice(0, 7).forEach((e) => { if (e.date !== pick.date) fetch("data/" + e.date + ".json").catch(() => {}); });
    } catch (err) {
      if (!shown) {
        const sub = app.querySelector(".hero-sub");
        if (sub) sub.textContent = "The briefing couldn't load. Connect to the internet and open it again.";
      }
    }
  }

  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(h)) { closeSheet(); show(); }
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
