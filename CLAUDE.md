# Daily Briefing

A personal news briefing, published as an offline-capable web app on GitHub Pages
(https://lamerx93.github.io/daily-briefing/). One reader uses it on an iPhone through the day.

This repository is public. Never put a company name, colleague, client, deal detail or anything
else internal or personal into it. Articles are built from public sources only.

## Who it is for

A technology and AI leader at a firm that structures and services securitisations of consumer
credit across Asia, outside mainland China, funded by international institutional investors.
The reader writes AI requirements and has to explain AI to non-technical senior people. The
briefing exists so that they are the best-informed person in the room on four things:

1. What is new in AI and AI agents (section `agents`, "AI and agents").
2. The tools and techniques a requirements writer should know (section `techniques`,
   "For your requirements"), and how agents work in depth (the daily deep dive).
3. How AI is being applied in structured finance, lending, servicing and capital markets
   (section `field`, "In our field").
4. Consumer credit markets across Asia, excluding China (section `market`, "Asia market"):
   digital and non-bank lending, BNPL, securitisation and private credit, funding flows, credit
   quality, regulation and currencies. Indonesia is covered in depth (OJK, Bank Indonesia,
   pindar, the rupiah). The Philippines, Thailand, Vietnam, Malaysia, Singapore, India and the
   rest of the region are covered as the news warrants. China is left out of the market
   coverage for now; AI news from Chinese labs still belongs in the AI sections.

Readability is the top priority. An article that is accurate but a chore to read has failed.

## How the app is organised

- Home lists every day. A day opens its front page. A front-page row opens one article. The
  reader marks each article as read.
- `data/YYYY-MM-DD.json` holds one day: `{ "date", "line", "terms", "articles": [...] }`.
  Dates and times are Asia/Singapore.
- `data/index.json` is generated. Never edit it by hand: run `python3 scripts/build_index.py`.

## Publishing

There are two kinds of run. Both end the same way:

1. `python3 scripts/build_index.py`
2. `python3 scripts/validate.py YYYY-MM-DD` (add `--full` for the morning set) and fix
   everything it reports. Never publish a day that fails.
3. Commit only files under `data/` and push to `main`. GitHub Pages redeploys by itself.

4. Notify the reader, if the private keys folder is available (the run's instructions say
   where). One notification per new story in an update:
   `NODE_USE_ENV_PROXY=1 node scripts/send_push.mjs --keys <folder> --title "<headline>" --body "<section name>" --url "#/YYYY-MM-DD/<id>"`.
   For the morning set send one only: the lead headline as the title, "Morning edition, N
   articles" as the body, and `#/YYYY-MM-DD` as the url. Never print, copy or commit anything
   from the keys folder. If it is not available, skip this step and say so in the report.

Leave `index.html`, `styles.css`, `app.js`, `sw.js`, the manifest and `scripts/` alone unless
you are fixing a bug in them. If you change a file the app loads, bump `VERSION` in `sw.js`;
phones then update themselves and show the new number at the foot of the home screen.

### The morning set (first run of the day)

Creates the day's file with the full set, all with the same `time`:

- one lead story (`"lead": true`, with `poster`);
- 2 to 4 stories in each of the four sections;
- one deep dive and one plain-language term;
- `line` (the line for the room) and `terms` (2 to 8 glossary terms used that day);
- `number` on one market story when there is a good figure.

Before writing, read `data/index.json` and the last few day files. Do not repeat a deep dive
or a term from the last 30 days, and do not re-report a story already published.

### An update (any later run that day)

Adds only what is new and worth the reader's attention since the last article was published.

- Read today's file first. Check every candidate against the headlines and source links
  already there and in yesterday's file. If it is already covered, or it is not clearly
  relevant to the reader, publish nothing. Publishing nothing is the normal result of most
  updates; never pad.
- Add at most two stories per update. Append them to `articles` with the current time. Do not
  change, reorder or delete existing articles, and do not add a second lead, deep dive or term.
- If something already published has materially changed, add a new story that says so and
  links the newer source; do not rewrite the old one.
- If today's file does not exist yet, write the morning set instead.

## Articles

Every article has `id` (lowercase words joined by hyphens, unique in the day, 48 characters at
most, never changed once published), `time` ("HH:MM") and `kind`.

**`kind: "story"`** is a news article.

- `section`: `agents`, `techniques`, `field` or `market`.
- `headline`: 48 characters at most, no full stop. In `techniques` it is set at poster size,
  so 36 at most there, and it names the technique ("Replay tests for agents"). In `market`,
  start with the country when the story is about one market.
- `dek` (optional): one sentence, 32 words at most, shown under the headline and on the
  front page. Without it the front page shows the opening sentence of the body.
- `body`: 1 to 5 short paragraphs, 30 to 320 words in all. Say what happened, with dates and
  figures exactly as the source gives them.
- `soWhat`: 70 words at most, addressed to the reader. What to do, ask or watch. No generic
  "this shows AI is growing" lines.
- `sources`: at least one `{ "title", "publisher", "url" }`.
- The lead also has `"lead": true` and `poster`: exactly two lines of 3 to 12 characters each,
  set in capitals at poster size, so make them a blunt four-word summary ("Banks leash" /
  "their agents").
- `number` (optional, one article a day): the figure of the day, shown very large. `value` is
  8 characters at most ("$19.8bn"), with a `caption` saying exactly what it measures and a
  `source`. Add `rows` (label and value), a `unit` and a `total` only when the rows are the
  real parts of that figure and add up to it; use a "Rest of ..." row for a remainder you
  have calculated. If no honest breakdown exists, leave `rows` out.

**`kind: "deepdive"`** is the daily lesson: one concept explained properly.

- `headline` 34 characters at most, `dek` (the introduction), 3 to 6 ordered `steps` (`title`
  34 characters at most, `body`), and `forRequirements`: 3 to 6 lines the reader could lift
  into a requirements document.
- `example`: a worked run that makes the concept concrete. 4 to 9 rows, each with an `actor`
  (one word: Person, Model, Harness, Tool) and a `text` of 110 characters at most. Mark a row
  `"state": "held"` where a control stops something and `"state": "done"` on the outcome. Set
  it in the reader's world (loan pools, servicing, investor reports) and keep every number in
  it plainly illustrative.
- `quiz`: one question on the lesson. 3 or 4 `options`, `answer` is the zero-based index,
  `explanation` says why.
- Work through a curriculum over time rather than chasing the news: the agent loop, tool
  calling and MCP, context windows and context engineering, memory, retrieval (RAG), planning
  and sub-agents, evaluation and test sets, guardrails and prompt injection, human approval
  patterns, observability and tracing, cost and latency, model selection, fine-tuning versus
  prompting, structured outputs, document extraction, agent identity and permissions, audit
  and model risk management.

**`kind: "plain"`** is one term in plain language.

- `headline` is the term itself (24 characters at most). `jargon` is how an insider would say
  it. `stair` is the line to remember, 10 to 18 words, set large. `simple` carries on from it
  in one or two sentences without repeating it. `analogy` is a picture from everyday working
  life (finance analogies land well).

**Day-level fields**

- `line`: `{ "line", "backup" }`. `line` is what the reader could say in a meeting today, 18
  words at most. `backup` is the fact behind it, starting with the fact itself.
- `terms`: `[{ "term", "meaning" }]`, 2 to 8 terms that appeared that day.

Text is plain. The only markup the app understands is `**bold**`.

## Writing rules

- Short sentences, plain verbs, active voice. Write for someone reading on a phone.
- Lead with what happened, then what it means.
- Explain every acronym the first time, or put it in `terms`.
- Put everything in your own words. Never copy sentences from a source. At most one short
  quotation in a whole day, and usually none.
- Go to original sources (company posts, regulators, papers, wire services) over aggregators,
  and read the pages you rely on. For the market section, search by country as well as by
  region, and in Bahasa Indonesia as well as English. If a claim comes only from an
  aggregator or could not be confirmed at the original source, say so in the article.
- An older but useful piece is fine if its date is stated.
- Neutral on politics and on named companies. Report, do not cheerlead or sneer.
- No investment advice.
