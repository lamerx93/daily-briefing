# Daily Briefing

A personal daily briefing, published as an offline-capable web app on GitHub Pages
(https://lamerx93.github.io/daily-briefing/). One reader opens it on an iPhone every morning.

This repository is public. Never put a company name, colleague, client, deal detail or anything
else internal or personal into it. Editions are built from public sources only.

## Who it is for

A technology and AI leader at a firm that structures and services securitisations of consumer
credit across Asia, outside mainland China, funded by international institutional investors. The reader writes AI
requirements and has to explain AI to non-technical senior people. The briefing exists so that
they are the best-informed person in the room on four things:

1. What is new in AI and AI agents.
2. The tools and techniques a requirements writer should know, and how agents work in depth.
3. How AI is being applied in structured finance, lending, servicing and capital markets.
4. Consumer credit markets across Asia, excluding China: digital and non-bank lending, BNPL,
   securitisation and private credit, funding flows, credit quality, regulation and currencies.
   Indonesia is covered in depth (OJK, Bank Indonesia, pindar, the rupiah). The Philippines,
   Thailand, Vietnam, Malaysia, Singapore, India and the rest of the region are covered as the
   news warrants. China is left out of this market coverage for now; AI news from Chinese
   labs still belongs in the AI sections.

Readability is the top priority. If an edition is accurate but a chore to read, it has failed.

## Publishing an edition

The date is today's date in Asia/Singapore. One edition per day.

1. Read `data/index.json` to see recent headlines, deep-dive titles and terms. Do not repeat a
   deep dive or a term from the last 30 editions. If today's file already exists, improve it
   in place instead of creating a second one.
2. Research with web search. Prefer the last 24 to 72 hours for news, and go to original
   sources (company posts, regulators, papers, wire services) over aggregators. For the
   market section, search by country as well as by region, and in Bahasa Indonesia as well as
   English. Read the pages you rely on.
3. Write `data/YYYY-MM-DD.json` following the shape of the most recent edition exactly.
4. Add the edition as the FIRST entry of `data/index.json`:
   `{ "date", "edition", "headline", "deepDive", "term" }`. `edition` is the previous number plus one.
5. Run `python3 scripts/validate.py YYYY-MM-DD` and fix everything it reports.
6. Commit only the two data files and push to `main`. GitHub Pages redeploys by itself.

Leave `index.html`, `styles.css`, `app.js`, `sw.js` and the manifest alone unless you are fixing
a bug in them. If you do change any of them, bump `VERSION` in `sw.js` so phones pick it up.

## Shape of an edition

- `lead`: the one story that matters most today. `headline` (70 characters at most), `dek`,
  `body` (1 to 4 short paragraphs), `whyItMatters` (addressed to the reader, concrete), `sources`.
- `sections`: exactly four, in this order, with these ids: `agents` ("AI and agents"),
  `techniques` ("For your requirements"), `field` ("In our field"), `market` ("Asia market").
  The market section should not be all one country: aim for at least one item from outside
  Indonesia whenever there is real news, and start each headline with the country when the
  item is about a single market.
  Each has 2 to 4 `items`: `headline`, `body` (95 words at most), `soWhat`, `sources`.
- `deepDive`: one concept explained properly, as 3 to 6 ordered `steps`, plus `forRequirements`
  (3 to 6 lines the reader could lift into a requirements document). Work through a curriculum
  over time rather than chasing the news: the agent loop, tool calling and MCP, context windows
  and context engineering, memory, retrieval (RAG), planning and sub-agents, evaluation and
  test sets, guardrails and prompt injection, human approval patterns, observability and
  tracing, cost and latency, model selection, fine-tuning versus prompting, structured outputs,
  document extraction, agent identity and permissions, audit and model risk management.
- `plain`: one term. `jargon` is how an insider would say it, `simple` is how to say it to a
  board member, `analogy` is a picture from everyday working life (finance analogies land well).
- `roomLine`: one sentence the reader could say in a meeting today, and a `backup` fact for it.
- `quiz`: one question that tests the deep dive or the lead. 3 or 4 `options`, `answer` is the
  zero-based index, `explanation` says why.
- `glossary`: 2 to 5 terms that appeared today.
- `readMinutes`: prose words divided by 220, rounded. Aim for 6 to 8.

Text is plain. The only markup the app understands is `**bold**`.

## Writing rules

- Short sentences, plain verbs, active voice. Write for someone reading on a phone before work.
- Lead with what happened, then what it means. Every item earns its place with a `soWhat` that
  says what the reader should do, ask or watch. No generic "this shows AI is growing" lines.
- Explain every acronym the first time, or put it in the glossary.
- Put everything in your own words. Never copy sentences from a source. At most one short
  quotation in a whole edition, and usually none.
- Every item needs at least one working source link. Give dates and figures exactly as the
  source does. If a claim comes only from an aggregator or could not be confirmed at the
  original source, say so in the item. If nothing new happened in an area, say less rather
  than padding; an older but useful piece is fine if its date is stated.
- Neutral on politics and on named companies. Report, do not cheerlead or sneer.
- No investment advice.
