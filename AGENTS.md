# AGENTS.md: StudyBoost handoff for coding agents

Everything an agent (Codex or another) needs to work on this repository without
re-discovering it. Read this first, then the doc linked for the area you touch.
Human-facing docs: `README.md`. Decision history: `DEVLOG.md` (newest first).

Contents: 1 Product · 2 Quick start · 3 Repository map · 4 Architecture ·
5 Data model · 6 HTTP API · 7 Learning systems · 8 Similar-question practice ·
9 Rules you must keep · 10 Testing and CI · 11 Deployment · 12 Known gaps and
next steps · 13 Current state and recent changes · 14 Playbooks for common tasks

---

## 1. Product

**StudyBoost** (repo name `study-boost-system`; older names: StudyBoost AI, TrackForge)
is an adaptive AP study app for high-school students:

1. **Notes**: paste class notes; get an AI summary (or an offline summary without a key).
2. **Practice**: generate AP-style questions (multiple choice + short answer) for one
   of 13 AP courses (plus an Other / General set), at basic / medium / challenge difficulty,
   optionally from the notes.
3. **Review**: every missed question enters a Mistake Log scheduled by SM-2 spaced
   repetition; due mistakes also resurface inside new practice sets.
4. **Similar questions** (newest feature): from any saved mistake, practise new
   questions on the same knowledge point, checked before they are shown, with
   adaptive difficulty and mastery evidence.
5. **Progress**: accuracy, per-subject and per-practice-type splits, 14-day trend,
   topic mastery (bars + radar).
6. **Home**: next step, daily missions, XP/level/streak, and a "review orbit" chart.

- Live demo: <https://studyboostai.pythonanywhere.com/>. It runs **without an API key**
  ("offline mode"): practice comes from the built-in bank in `js/question-bank.js`,
  and similar questions come from a built-in generator for seven AP Calculus skills.
- With a key in `.env` (Groq through an OpenAI-compatible endpoint), summaries,
  practice questions, and similar questions for every course use the AI.
- Audience: high-school AP students, many on phones. No accounts, no PII. Each browser
  gets an anonymous id `u-<uuid>`.
- License: MIT (`LICENSE`).

## 2. Quick start

Requirements: Python 3.9+ (CI uses 3.12), Node 18+ (CI uses 20). No JS build step, no
npm dependencies for the app itself.

```bash
pip install -r requirements-dev.txt      # flask, requests, pytest, Pillow
python server.py                         # http://127.0.0.1:8765/  (Windows: py server.py or start.bat)
```

On Debian-based images where `pip` refuses to replace the system `blinker`:
`pip install --ignore-installed blinker -r requirements-dev.txt`.

Enable AI (optional): create `.env` in the repo root (gitignored, never commit it):

```
OPENAI_API_KEY=gsk_...                          # a Groq key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
```

Always open the app through the server URL, not `file://` (offline-only, no stats).

Tests (all must pass before you commit):

```bash
pytest -q
node --test tests/spaced-repetition.test.js tests/practice-selection.test.js tests/mastery-model.test.js tests/question-bank.test.js tests/home-summary.test.js tests/variant-practice.test.js tests/review-orbit.test.js
node --test tests/e2e/variant-flow.e2e.js tests/e2e/redesign-flow.e2e.js   # needs: npm install --no-save playwright@1.49.1 && npx playwright install --with-deps chromium
```

Current counts: pytest 241, JS unit 122, end-to-end 41 (5 similar-question + 36 redesign, walkthrough, learning-feedback, phone-path, and load-guard tests). The JS file list is explicit on
purpose: never run bare `node --test tests/` (newer Node mis-handles the directory).

## 3. Repository map

```
server.py                 Flask app: static routes, /api/* endpoints, SQLite, AI client, rate limits (~730 lines)
variant_engine.py         Similar-question pipeline: input bounds, prompts, validation, quality gates, repair, fallback
variant_templates.py      Built-in generator: 7 AP Calculus skills x 3 levels; skill classifier
mathcheck.py              Safe ASCII-math parser (no eval), evaluator, LaTeX printer, answer checks
metrics_beta.py           Read-only beta metrics (stdlib only): Review Recovery Rate, similar-question accuracy, generation reliability
reset_demo.py             Wipes + reseeds the demo DB; refuses to run without DEMO_SEED=1
extract_assets.py         Historical one-off that split the original single-file HTML. DO NOT RUN: it overwrites css/styles.css, js/app.js, README.md
conftest.py               pytest fixture: points STUDYBOOST_DB at a temp file before importing server
start.bat                 Windows one-click launcher (installs deps, opens browser, runs server)
requirements.txt          flask>=3.0.0, requests>=2.31.0 (runtime)
requirements-dev.txt      runtime + pytest + Pillow
index.html                The whole app: one document, 6 views + 1 sub-page, icon sprite, script tags
css/styles.css            Design system implementation (tokens at the top)
js/app.js                 UI glue: rendering, generation, grading, mistake log, stats, backup, mistake page (~3.3k lines)
js/shell.js               Views, hash routing (incl. #mistake/<id>), page transition (disc), inverted type (fitInverts), nav marker, tooltips, confirm dialog
js/question-bank.js       window.OFFLINE_BANK: 14 subjects x {basic, medium, challenge} x {mcq, sa}
js/spaced-repetition.js   SM-2 scheduler (pure, pluggable)
js/mastery-model.js       Topic mastery: EMA + volume-gated levels + per-source counts (pure)
js/practice-selection.js  Injects due mistakes into new sets; skill catalog (SKILLS) and topic matching (pure)
js/home-summary.js        Home logic: level, streak, missions, next step, Progress top line (pure)
js/review-orbit.js        Review Orbit + Mistake Library rules: filter, sort, chart layout, snippet, review queue order (pure)
js/variant-practice.js    Similar-question rules: staircase, mastery evidence, SM-2 nudge, ranking (pure)
pages/about.html, privacy.html, terms.html   Trust pages served at /about, /privacy, /terms
assets/og-image.png       Social preview card (regenerate with scripts/make_og_image.py, needs Pillow)
assets/fonts/             Self-hosted Big Shoulders + Instrument Sans (SIL OFL licenses alongside)
robots.txt, sitemap.xml   SEO files, served by exact routes
tests/                    pytest suites (test_*.py), node:test suites (*.test.js), tests/e2e/ Playwright suite
tests/visual/             Review tool (not CI): capture.js (screenshots of 16 states, seeded so runs match, fonts-blocked state, overflow, axe, lab timings) + labelled fixtures.js
docs/ARCHITECTURE.md      Module overview
docs/DESIGN-SYSTEM.md     Visual rules (V5 "Orbit Field": the disc, rings, inverted type, paper scope, shapes, tokens, layout, motion, a11y, data honesty)
docs/REDESIGN-V5.md       The V5 visual redo record: baseline, two directions, decision, changes per scene, verification, image index
docs/redesign-v5/         V5 before/after pairs (V4 left), the two direction mock-ups, flow and state sheets
docs/REDESIGN-V4.md       The V4 "Cut Poster" record; docs/redesign-v4/ its images
docs/REDESIGN-PROGRESS.md The earlier "Signal Blue" redesign record (V3)
docs/redesign/            Before/after screenshots from the V3 redesign
docs/UX-FLOW.md           The guided "spine" and screen-by-screen flow
docs/VARIANT-PRACTICE.md  Similar-question practice: design, gates, rules, API, tests, limits
docs/QUESTION-BANK-STANDARD.md   Authoring rules for js/question-bank.js
docs/PRODUCT-ROADMAP.md, docs/BACKLOG.md   What is next and what is deliberately deferred
docs/archive/             A recovered transcript of an earlier work session (history only)
.github/workflows/ci.yml  CI: pytest, JS unit tests, Playwright end-to-end
```

Gitignored and never committed: `.env`, `studyboost.db`, `__pycache__/`, `node_modules/`, `.claude/`.

## 4. Architecture

### Front end

Vanilla JavaScript, no build chain. `index.html` runs classic scripts in this order (order
matters, later files use earlier globals) through its **load guard**: a small inline script
in `<head>` (`StudyBoostBoot`) and the list passed to `StudyBoostBoot.run([...])` at the end
of `<body>`. The files are preloaded (`<link rel="preload" as="script">`), so they download
in parallel, and run one after another. A failed request for one of the app's files (a
dropped connection, a 502) is asked for again up to 3 more times (0.4 / 1.2 / 2.5 s, with a
`?retry=n` URL); nothing after it runs early. A required file that never arrives shows a
`#loadProblem` message with a Reload button. KaTeX entries are `optional` (skipped if they
fail: math stays raw text). The stylesheet (`data-src`) and `js/question-bank.js`
(`ensureQuestionBank`) get the same retries. The window `load` event still waits for all
scripts. To add a script: add its preload link and its entry in the `run` list.

```
KaTeX 0.16.9 (CDN: katex.min.js, contrib/auto-render.min.js)
js/spaced-repetition.js -> js/practice-selection.js -> js/mastery-model.js -> js/home-summary.js
-> js/review-orbit.js -> js/variant-practice.js -> js/shell.js -> js/app.js
```

`js/question-bank.js` (~250 KB) is not in that list: `ensureQuestionBank()` in `app.js`
injects it the first time a set needs it and prefetches it when the browser is idle.
One inline script in `<head>` applies the student's "Reduce motion" setting
(`data-motion="reduce"` on `<html>`) before the first paint.

- **Logic modules** (`spaced-repetition`, `mastery-model`, `practice-selection`,
  `home-summary`, `review-orbit`, `variant-practice`) are pure IIFEs: no DOM, no storage.
  Each dual-exports: `window.X = api` in the browser and `module.exports = api` for Node
  tests. Globals: `ReviewSystem`, `MasteryModel`, `PracticeSelection`, `HomeSummary`,
  `ReviewOrbit`, `VariantPractice`, `OFFLINE_BANK` (once loaded), `Shell`.
- **`js/app.js`** is the glue: it owns state (top-level `let`s such as `errorRecords`,
  `masteryMap`, `generatedQuestions`, `quizResults`, `variantSession`), reads/writes
  `localStorage`, renders HTML strings, and wires events.
- **Rendering pattern**: build an HTML string where every piece of user or AI text goes
  through `escapeHtml()`, assign `innerHTML`, then call `typesetMath(el)` (KaTeX
  auto-render; degrades to raw text if the CDN is unreachable).
- **Views**: one document. `home`, `notes`, `practice`, `review`, `progress`, `setup`,
  plus the sub-page `mistake` (`#mistake/<id>`). `js/shell.js` shows one view at a time
  (all stay in the DOM), runs the page transition (a blue disc grows out of the page you
  leave and closes into the one you open), keeps the nav marker (the mistake page keeps **Review** marked; it follows size
  changes of the nav row), and fires `document` event `studyboost:view` with
  `detail { view, param }`. `Shell.go("mistake/err-123")`, `Shell.current()`,
  `Shell.param()`, `Shell.confirm({...})`, `Shell.countUp(el, n)`, `Shell.reducedMotion()`
  (device setting or the student's choice), `Shell.setBand({num, of, label} | null)` (a real
  number in the band instead of the page name; Practice sets it, though V5 hides the band
  during a set), `Shell.fitInverts()` (re-align inverted type after a re-render).
- **Layout (V5 "Orbit Field", `docs/DESIGN-SYSTEM.md`)**: `.rail` is a fixed top bar
  (bottom tab bar under 720px); `.band` is each page's masthead (a blue disc in the corner,
  hairline rings, the page name solid inside the disc and outlined outside, computed in CSS).
  Home has no masthead: `.command` is the review orbit at poster scale (`orbitSvg` with
  `disc`, `core`, `dueRim`, `ticks`), geometry from `--R`, `--W`, `--core`, `--cx`, `--cy`; the
  action sits in the core. Elements with `data-invert="<disc selector>"` turn black inside
  that disc (`Shell.fitInverts`). During a set and on the result the masthead, date, and
  display heading step aside. Reading and answering surfaces are **paper** (`.paper` and a
  few components flip the text, line, surface, and status-ink tokens; see "Paper" at the
  top of `css/styles.css`) with a 7px top rule (blue, then the result's colour). Shapes:
  capsules (`--r-cap`), circles, soft corners (`--r-card`, `--r-row`); nothing slants.
  Status colours as fills: `--good/--warn/--bad`; as text or thin lines:
  `--good-ink/--warn-ink/--bad-ink`.
- **Practice focus mode**: all cards of a set are rendered; only `.qa-card.is-current`
  shows. State in `app.js`: `practiceIndex`, `practiceSetupOpen`, `resultsShown`,
  `currentSetMeta` (`origin`: `ai` | `bank` | `review`). `#view-practice[data-mode]` is
  `setup` | `focus` | `results`. Completion bookkeeping (XP, streak) runs on the last
  grade; the result card (`#completionCard`) stays hidden until "See results".
- **Review**: one filter (`reviewFilter`: `when`, `course`, `query`, `sort`) drives the
  orbit chart and the library; `orbitSelectedId` is the selected mistake; `orbitView` is
  `chart` | `list`. Home's `#nextStep` is the command-center hero.
- **AI calls from the browser** go only to the local server: `/api/chat` (summaries and
  practice sets; prompts are built in `app.js`) and `/api/variants` (similar questions;
  prompts are built on the server). The key never reaches the browser.
- **Offline-first**: graded attempts are posted to `/api/attempt`; if the server is
  unreachable they queue in `localStorage` and flush later.

### Back end (`server.py`)

Flask 3 with `static_folder=None` (the project directory must never be served as a
whole; it contains `.env` and the DB). Every asset has an explicit route. SQLite file
`studyboost.db` (path override: `STUDYBOOST_DB`). One connection per request, wrapped
in `contextlib.closing` (a plain `with sqlite3.connect()` only commits, it does not close).

Per-IP rate limits live in memory (reset on restart, per process). The daily AI quota
for similar questions is stored in SQLite, so it survives restarts.

### AI

Provider: any OpenAI-compatible `/chat/completions` endpoint; in practice Groq with
`llama-3.3-70b-versatile` (the default in Setup, saved in `studyBoostUIPrefsV1`; the
server's default for similar questions is `VARIANT_MODEL`). JSON mode
(`response_format: json_object`) is always requested for structured output. AI output
is treated as untrusted input:

- Summaries: `validateSummaryShape`, one retry.
- Practice sets: `normalizeAIQuestions` + `isQuizQualityAcceptable`, one regeneration,
  then the offline bank.
- Similar questions: the full gate pipeline in `variant_engine.py` (section 8).
- Client-side reliability counters: `localStorage.studyBoostAiReliabilityV1`, read with
  `getAiReliability()` in the browser console (kinds: `summary`, `quiz`, `variant`).

## 5. Data model

### Browser `localStorage` (the student's data lives here)

| Key | Contents |
|---|---|
| `studyBoostMistakesV2` | Array of mistake records (shape below). Legacy key `learningAssistantErrorsV1` is migrated on read. |
| `studyBoostMasteryV1` | Topic mastery map (shape below). |
| `studyBoostUserIdV1` | Anonymous id `u-<uuid>` (no PII). |
| `studyBoostUIPrefsV1` | `{ model, motion }` (`motion`: `"system"` or `"reduce"`; older records lack it) |
| `studyBoostXpV1` | Total XP (string integer). 100 XP per level. |
| `studyBoostStreakV1` | `{ count, lastDay }` (the student's local dates, `HomeSummary.localDay`; keys saved under the old UTC days are carried over once by `HomeSummary.carryDay`). |
| `studyBoostDailyV1` | `{ day, questions, reviews, xp }` for today's missions (`day` is a local date). |
| `studyBoostAttemptQueueV1` | Unsynced attempts (max 500), each with an `eventId`. Uploaded one flush at a time (`attemptFlush`); an attempt leaves the queue only after the server accepted it. Not backed up (re-import would double-submit). |
| `studyBoostAiReliabilityV1` | `{ kind: { ok, repaired, failed, total } }` diagnostics. Not backed up. |
| `studyBoostOnboardedV1` | `"1"` once the first-run welcome card was dismissed. |
| `studyBoostSessionV1` | `{ savedAt, notes, summary, set: { questions, results, index, meta, preSet, drafts, complete, stats, shown } \| null }`: the Notes box, the last summary or excerpt (`{ source, text, points, notes }`), and the current practice set, restored after a refresh (24 h max). A finished set keeps what it earned (`stats: { streak, setXp, daily }`) and whether its result was on screen, and is redrawn read-only. Restore only redraws; nothing is graded or scored twice. Cleared when a new set starts. Not backed up. `drafts[qid]` is a string (short-answer draft) or `{ pick }` (an option chosen but not checked). |
| `studyBoostStatsCacheV1` | `{ at, userId, data }`: the last `/api/stats` reply (counts only). Offline, Progress shows it plus the unsynced queue (`HomeSummary.mergeStats`) and says when it was synced. Not backed up. |

"Download my data" / "Restore from file" (Setup) write and read a JSON backup
`{ app, type: "studyboost-backup", version: 2, exportedAt, data: { key: rawString } }`
for the keys in `BACKUP_KEYS` (`app.js`): mistakes, mastery, user id, UI prefs, XP,
streak, daily. Restore replaces, it does not merge.

**Mistake record** (all fields after `createdAt` are optional; old records lack them):

```js
{
  id: "err-1700000000000", sourceId: "<question id>", type: "Multiple Choice" | "Short Answer",
  question, answer, explanation,            // text; math as LaTeX inside $...$
  userAnswer,                               // MCQ: the picked option string; SA: typed text; "" if none
  options: ["A. ...", "B. ...", ...],       // MCQ only (saved since Nov 2026)
  difficulty: "basic" | "medium" | "challenge" | "",
  subject: "AP Calculus AB", topic: "Chain rule", topicKey: "chain rule",
  sr: { algo: "sm2", reps, ef, intervalDays, due: ISO, reviews, lastQuality, nudgedAt? },
  skills: ["chain-rule", ...],               // bank questions with skill tags (k), main skill first
  createdAt: ISO,
  analysis: { coreConcept, conceptKey, conceptTerms, solutionMethod, difficulty,
              diagnosis: { status: "diagnosed" | "insufficient_information", likelyError, evidence,
                           confidence: "high" | "medium" | "low" | null, grounded, source, reason },
              source: "ai" | "template" | "offline" },
  variantPractice: {
    pending: [ /* generated, unanswered similar questions, max 4 */ ],
    history: [ { id, q, level, relation, correct, chosen, at, generator, verified } ]   // max 40
  }
}
```

**Topic mastery map**: key `"<subject>::<topicKey>"` (topicKey = lowercased, trimmed,
collapsed whitespace; `""` is the subject-general bucket) to
`{ subject, topic, topicKey, attempts, correct, ema, lastAttemptAt, sources? }` where
`sources = { generated|review|variant: { attempts, correct } }`.

### Server SQLite

```sql
attempts (id INTEGER PK, subject TEXT, qtype TEXT, correct INTEGER, created_at TEXT,
          user_id TEXT NULL, source TEXT NULL,          -- source in {generated, review, variant}
          event_id TEXT NULL)                           -- random id per answer; unique where not NULL
ai_generation_log (id, created_at, user_id, kind, generator, outcome, error_code,
          requested, accepted, rejected, verified, rejection_reasons /* JSON of fixed codes */,
          llm_calls, prompt_tokens, completion_tokens, latency_ms, model)
```

Migrations are additive and idempotent, run on every start (`_init_db`):
`_migrate_attempts_columns` adds `user_id`/`source`/`event_id` to old tables and a partial
unique index on `event_id`;
`_create_generation_log` uses `CREATE TABLE IF NOT EXISTS`. Rows with
`user_id IS NULL` (legacy) or `'demo-seed'` (synthetic) are excluded from metrics.
**The server never stores notes, question text, answers, or explanations.**

## 6. HTTP API

| Method + path | Purpose |
|---|---|
| `GET /` and `/css/*`, `/js/*`, `/assets/*` | The app and its static files (explicit routes only). |
| `GET /about`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` | Trust and SEO pages. |
| `GET /api/health` | `{ ok, openai_configured, variants: { ai, builtInSkills: [...] } }` |
| `POST /api/attempt` | Body `{ subject, type, correct, ts, userId, source, eventId }`; stores one graded result and returns `{ ok, duplicate }`. A repeated `eventId` (8-64 of `A-Za-z0-9_-`) is stored once (`INSERT OR IGNORE`); a missing or malformed one is stored as NULL. Unknown `source` is stored as NULL. Limit `ATTEMPT_RATE_LIMIT_PER_MIN`. |
| `GET /api/stats?userId=&tz=` | `{ overall, bySubject, bySource, daily (14 days) }` for that user only; no `userId` gives empty stats. `tz` is the student's UTC offset in minutes (the browser sends `-getTimezoneOffset()`, clamped to ±840); days are bucketed in that offset. Missing or invalid `tz` means UTC. |
| `POST /api/chat` | Generic proxy `{ model, messages, json }` to the provider; returns `{ content }`. Limits: `RATE_LIMIT_PER_MIN`, `MAX_MESSAGES`, `MAX_MESSAGE_CHARS`, `MAX_TOTAL_CHARS`. 503 without a key. |
| `POST /api/variants` | Similar questions for one mistake (section 8). |

All request bodies are capped at 2 MB (`MAX_CONTENT_LENGTH`); `/api/variants` at 64 KB.

Environment variables (all optional): `OPENAI_API_KEY`, `OPENAI_BASE_URL`
(default `https://api.openai.com/v1`), `PORT` (8765), `HOST` (127.0.0.1; deployments set
0.0.0.0), `STUDYBOOST_DB`, `DEMO_SEED` (`1` seeds an empty DB with synthetic rows; demo
use only, currently retired), `RATE_LIMIT_PER_MIN` (10), `ATTEMPT_RATE_LIMIT_PER_MIN`
(60), `MAX_TOTAL_CHARS` (12000), `MAX_MESSAGE_CHARS` (6000), `MAX_MESSAGES` (30),
`VARIANT_RATE_LIMIT_PER_MIN` (6), `VARIANT_BUILTIN_RATE_LIMIT_PER_MIN` (30),
`VARIANT_DAILY_LIMIT` (40 AI requests per user per UTC day), `VARIANT_BUDGET_SECONDS`
(40), `LLM_READ_TIMEOUT` (25), `VARIANT_MODEL` (`llama-3.3-70b-versatile`).

## 7. Learning systems

- **SM-2** (`js/spaced-repetition.js`): ratings Forgot = 2, Hard = 3, Got it = 5.
  Intervals 1, 6, then `round(interval * EF)`; a rating below 3 resets to 1 day; EF floor
  1.3. Status: `new` (never reviewed), `learning`, `mastered` (reps >= 3 and interval >= 21).
  Schedulers are pluggable (`ReviewSystem.schedulers`). One SM-2 update per mistake per
  browser session (`sessionReviewedErrIds`).
- **Topic mastery** (`js/mastery-model.js`): EMA with alpha 0.4 per (subject, topic).
  Levels: mastered (attempts >= 4, EMA >= 0.85), proficient (>= 3, >= 0.70), developing
  (>= 1), new. "Weakest" needs >= 2 attempts. Fed by every graded practice answer, tagged
  with its source; Review ratings (Forgot/Hard/Got it) do NOT feed it.
- **Topic attribution offline** (`PracticeSelection.splitForRequest`): when the course has a
  skill catalog (`SKILLS`; AP Calculus AB: 23 skills, Units 1–8) and the typed topic names a
  skill (name, id, or alias), items are matched by their `k` tags. Otherwise
  `splitByTopic` matches the topic against each item's question and correct answer (the
  `{focus}` template token never counts). Matching items carry the topic; tagged fillers
  carry their own main skill; untagged fillers are general practice with `topic: ""` (the
  course's general bucket). The card, set bar, and status line say which is which. The setup
  offers the catalog as a list (`#topicOptions`), counts matching questions (`#bankHint`), and
  a choice to fill the set or keep only matching questions (`#topicFill`). AI sets keep the
  requested topic. Changing the Practice course clears a topic that is another course's
  catalog skill (Calculus BC keeps AB skills).
- **Result screen**: one line per skill practised in the set ("a of b right in this set ·
  N graded so far, M right · estimate: Before → After"), from the skill levels snapshotted
  when the set was drawn. A set with no skill topics says it was general practice and
  changes no skill estimate. The general bucket never shows a mastery level on Progress.
- **Review injection R1** (`js/practice-selection.js`): up to 3 due mistakes (same subject,
  or no subject) lead each new set, tagged `source: "review"`, rendered as recall cards.
  A strict "only questions on this topic" set takes only the due mistakes on that topic
  (`keep: recordMatchesRequest`); the rest are counted in `metadata.heldBack` and linked
  from the set bar. A wrong new question is auto-captured into the Mistake Log. A new set
  replaces the current one only once it exists (`installSet`), after a confirmation if the
  current one is unfinished.
- **Review queue**: Review opens with "N reviews are due now · Start review"
  (`#reviewToday`); Home's review step and the result screen start it too. Due mistakes are
  shown one at a time on their own page (`#queueBar`), most overdue first
  (`ReviewOrbit.queueOrder`); ratings unlock after the answer is shown; after each rating
  the bar says when it comes back and offers the next one, or a similar question first after
  Forgot or Hard. SM-2 still does all the scheduling.
- **Home** (`js/home-summary.js`): next step priority is a set in progress ("Continue at
  question N"), then due reviews (which start the review queue), then a weak topic
  with a saved mistake that can be practised (similar questions), then the weakest topic
  (new set), then "start". Missions: 5 new questions, clear due reviews, 50 XP. XP: correct
  10, wrong 4, +5 for a review, +20 per completed set. Orbit rings at 1, 6, 15, 38 days.
- **Metrics** (`metrics_beta.py`, pre-registered): Review Recovery Rate = accuracy of
  `source = review` attempts; `generated` is a baseline; `variant` is reported separately.

## 8. Similar-question practice (newest feature)

Full design: `docs/VARIANT-PRACTICE.md`. Summary:

- **Entry points**: "Practice similar" on every Mistake Log card; "Practice similar
  questions next" recommendations above the log (weakest topic first); Home next step.
  The page `#mistake/<id>` shows the original with the student's pick, "What it tests"
  (knowledge point, method, likely error), and a practice strip.
- **Availability and data timing**: `canPracticeSimilar` decides in the browser, from the
  AI connection, the record's `skills` and `/api/health` `variants.builtInSkills`, or (for
  untagged records) the course. Opening a mistake page sends nothing; the mistake is sent
  to `/api/variants` only when the student presses a start button.
- **Request**: `POST /api/variants` with `{ mistake: {id, subject, topic, question,
  options, answer, userAnswer, explanation, difficulty}, level, count (1-3), avoid
  (stems already seen, max 12), analysis (from an earlier round), model, userId }`.
  Response `{ analysis, variants: [{ id, question, options, answer, explanation,
  optionNotes, concept, conceptKey, difficulty, relation, changes, verification:
  {status: verified|unverified|not_applicable, method}, generator: ai|template }],
  generator, notice, level, relation }`. Errors `{ error, code, retryAfter?, analysis? }`
  with codes `bad_input` 400, `rate_limited` / `too_many_requests` / `daily_limit` 429,
  `timeout` 504, `invalid_output` / `bad_response` / `auth_error` / `bad_request` /
  `upstream_error` 502, `no_generator` / `not_configured` 503, `server_error` 500.
- **Pipeline** (`variant_engine.generate_variants`): one JSON-mode AI call returns the
  analysis plus a batch of multiple-choice variants. Every variant must pass schema,
  knowledge-point (concept key, concept terms, rule structure), duplicate (vs. the
  original, the avoid list, each other), and math gates. For computable questions the
  model supplies a plain-ASCII verification spec; `mathcheck.check_spec` recomputes the
  answer (derivative, antiderivative, definite integral, limit, or value), requires
  exactly one correct option and clearly different distractors, and the shown options
  are re-typeset from what was checked (`{{expr}}` in the stem is replaced by the
  checked function). Rejected variants get one targeted repair call. Then the built-in
  generator (`variant_templates.py`) as fallback for its seven calculus skills (power,
  chain, product, quotient rules; reverse power rule; definite integrals; trig limits),
  used only when the AI's concept is that same skill. Otherwise an honest error.
- **Diagnosis rules**: no recorded answer gives "insufficient information"; an AI
  diagnosis must quote the student's answer or it is marked unconfirmed (confidence low);
  offline, only a pick that the stored explanation names as a trap is diagnosed.
- **Adaptive rules** (`js/variant-practice.js`): difficulty staircase "2 up / 1 down"
  within one level of the original; "likely mastered" when a Beta(1+s, 1+f) posterior
  gives P(rate > 0.6) >= 0.8, the last answer is right, and >= 2 distinct variants are
  right at the original level or above (easier ones count half): at least 3 in a row,
  or 5 after a miss. A missed variant can only move the original's SM-2 due date
  forward to tomorrow (reps, EF, interval untouched); a correct one never moves it.
- **Cost control**: batches of 2 per call, at most 1 repair call, `max_tokens` scaled to
  the batch, analysis reused after round 1, unanswered variants stored and served before
  any new call, inputs truncated, AI and built-in rate-limit buckets, a daily quota that
  counts only calls that consumed tokens.

## 9. Rules you must keep

1. **No build step, no app dependencies.** Plain script files run in order by the inline
   load guard in `index.html` (plus the one-line motion script in `<head>`); a new file
   needs a preload link and an entry in `StudyBoostBoot.run([...])`. New logic goes in a
   pure dual-export module with `node:test` tests; `app.js` stays glue.
2. **Escape everything** inserted with `innerHTML` (`escapeHtml`), then `typesetMath`.
3. **Buttons rendered by `app.js` contain text only**, no child elements: their slanted
   shape lives on `::before`/`::after`, and several click handlers read `ev.target` directly.
4. **Math is LaTeX in `$...$`**; keep `$` balanced; no bare `$` in content. Never `eval`
   AI-produced math: use `mathcheck.py`.
5. **Privacy promises are product requirements** (`pages/privacy.html`): the server stores
   one row per graded answer (subject, type, correct, time, anonymous id, source) and
   counts-only generation logs. It must never store notes, question text, or answers. Any
   change to what is sent or stored must update the privacy page in the same commit.
6. **The API key stays on the server** (`.env`, gitignored). Never return it or raw
   provider error bodies to the browser from new endpoints.
7. **Database changes are additive and idempotent**; an old database must start and keep
   its rows. Add a test like `test_legacy_database_migrates_without_losing_rows`.
8. **SM-2 owns review timing.** Do not replace scheduled review with generated practice.
   The `attempts.source` whitelist (`generated`, `review`, `variant`) feeds pre-registered
   metrics: do not change what `review` means.
9. **Data honesty** (`docs/DESIGN-SYSTEM.md`): every number on screen comes from the
   student's own activity; empty states say what to do; `–` not `0%` before data; no
   invented diagnoses, no placeholder content, no unrelated "similar" questions.
10. **Study content is never slanted, skewed, or set in display type.** Style surrounds the
    content. Colors only from the tokens in `css/styles.css`; status colors mean state.
11. **Question bank content** follows `docs/QUESTION-BANK-STANDARD.md`; the structural
    validator `tests/question-bank.test.js` must stay green.
12. **Accessibility**: keyboard focus visible, `aria-live` status lines, 44px touch targets
    on phones, `prefers-reduced-motion` respected, no horizontal scroll at 360-390px.
13. **Workflow**: conventional commit messages (`feat(scope): ...`, `fix(scope): ...`,
    `docs: ...`); add a `DEVLOG.md` entry for significant changes; keep README and docs
    accurate; run all three test suites before committing.

## 10. Testing and CI

| Suite | Command | Covers |
|---|---|---|
| Python | `pytest -q` | `test_api.py` (attempts, stats, chat proxy JSON mode, migrations, seed, rate limit), `test_mathcheck.py`, `test_variant_templates.py`, `test_variant_engine.py` (every gate, repair, diagnosis, fallbacks with a scripted fake LLM), `test_variants_api.py` (endpoint with a mocked provider: success, repair, 429, timeouts, 401/404/500, quota, legacy DB, "no question text in the DB"). Uses a temp DB via `conftest.py`. |
| JS unit | `node --test <explicit list>` (section 2) | SM-2, practice selection, mastery, bank validator, Home logic (incl. the Progress top line), Review Orbit and library rules, similar-question rules. |
| End to end | `node --test tests/e2e/variant-flow.e2e.js tests/e2e/redesign-flow.e2e.js` | `variant-flow`: two `server.py` copies on free ports (no key; a scripted mock OpenAI-compatible provider) drive Chromium through capture, the full loop to "likely mastered", the honest no-generator path, the AI path with a rate limit, key never in the browser, phone width. `redesign-flow`: Home command center (returning and first visit), Practice focus mode with keyboard answers and the result sequence, typing never triggers shortcuts, Review Orbit filters / keyboard selection / list view / search / confirmed delete, the offline Notes excerpt keeps one point per line, Reduce motion applied before first paint, 320px width, plus skill-tag matching, the only-matching option, per-skill result lines, offline Progress and its separate course filter, stale-topic clearing, locked recall ratings, a refresh-safe pick, strict sets without other skills' reviews, replacing a set safely, the Home button with real and fallback fonts at 4 sizes, the phone band, the review queue, the full phone path (miss → feedback → similar → due review), upload retries counted once, finished sets and the Notes excerpt after a refresh, phone touch targets, Continue on Home, and the load guard (failed script, stylesheet, and question-bank requests retried with the scripts still in order; a file that never arrives shows the Reload message and nothing after it runs). Set `KATEX_DIST=<katex/dist>` to render math offline; otherwise the CDN is blocked and math stays raw text. |
| Visual review (not CI) | `node tests/visual/capture.js <outDir> [--only=a,b] [--perf] [--axe] [--sizes]` | Screenshots of 16 labelled-fixture states (45 shots), console errors, horizontal overflow at 9 sizes (320×568 to 1920×1080), axe-core (WCAG 2.x A/AA tags, needs `AXE_JS`), lab timings (LCP, CLS, long tasks; median of 3 plus a 4x CPU run). Lab numbers are diagnostics, not field Core Web Vitals. |

CI (`.github/workflows/ci.yml`, on push/PR to `main`): jobs `test` (pytest, Python 3.12),
`js-test` (Node 20), `e2e` (installs `playwright@1.49.1` + Chromium). No real AI provider is
ever contacted by tests.

## 11. Deployment

PythonAnywhere free tier, always-on, **no API key** (visitors can never spend quota).
Web tab, manual configuration, source + working directory `/home/<user>/study-boost-system`,
WSGI:

```python
import os, sys
path = "/home/<user>/study-boost-system"
if path not in sys.path:
    sys.path.insert(0, path)
from server import app as application
```

Install with `pip3 install --user -r requirements.txt`. Update: `git pull`, then Reload
in the Web tab (the owner does this step). Ops notes: set `ATTEMPT_RATE_LIMIT_PER_MIN=240`
in the WSGI environment for classroom use (one school IP); `DEMO_SEED` is retired (Progress
is per user). New similar-question code needs no new packages or settings.

## 12. Known gaps and next steps

- Without a key, similar questions exist only for the seven calculus skills; other topics
  say so and offer a general set for the course.
- Conceptual (non-math) questions cannot be machine-checked; they pass the schema,
  concept, and duplicate gates and are labelled.
- Topic identity is the student's free-text topic (no synonym merging) except for catalog
  skills; only AP Calculus AB has a catalog and tagged bank so far. A blank topic feeds the
  course's general bucket.
- Recall ratings in Review unlock only after the answer is shown (`revealedErrIds`, per page
  session).
- The display-font fallback is width-matched (`Big Shoulders Fallback*` faces with
  `size-adjust`) for Arial/Liberation/Helvetica, Roboto, and DejaVu; another system font
  would still wrap differently. Checked with the fonts blocked at 320, 390, 1100, 1440 px.
- The load guard covers `index.html`'s scripts, its stylesheet, and the question bank. It
  cannot retry the page itself (a failed `/` is the browser's error page), and the trust
  pages (`/about`, `/privacy`, `/terms`, no scripts) do not retry their stylesheet.
- Rate limits are in memory per process; a multi-instance deployment needs a shared
  store. `/api/chat` (older code) still returns provider error text to the browser.
- Answers ship to the browser (client-side answer gating); a determined user can read them.
- Not yet verified against the real Groq API in this environment (tests use mocks):
  do one real similar-question round with a key before relying on the AI path.
- Product direction: `docs/PRODUCT-ROADMAP.md` (retention first) and `docs/BACKLOG.md`
  (deferred: completion-funnel analytics, APUSH Cold War coverage, AP World distractors).

## 13. Current state and recent changes

- November 2026, load guard: the app's scripts run through a small inline loader in
  `index.html` that retries failed requests (up to 3 more times) and keeps the order, so a
  dropped request no longer leaves app.js running without a module. The stylesheet and the
  question bank are retried too; a file that never arrives shows a Reload message. Found
  while checking the live site: about 5% of parallel requests from a cloud test session
  failed (connection resets, 502s from its proxy), and some page loads broke. Real
  visitors' rates are unknown.
- Default branch: `main`. Similar-question practice and the redesigns were developed on
  branch `claude/zen-ramanujan-t57aza`. Merge it into `main`, or point your tools at that
  branch, to work on the newest code.
- November 2026, V5 visual redo "Orbit Field" (record in `docs/REDESIGN-V5.md`):
  - Home is the review orbit at poster scale: the 15-day ring is the blue disc, the core
    holds the next action, due cards sit round the core's edge, PRACTICE turns black inside
    the disc. Results is a horizon arc (one segment per answer) over the score, with one
    learning line and one next step first. Review's due count sits in a yellow disc; the
    orbit's rings carry real dates. Mastheads are a corner disc with the page name inverted.
    Answering hides the masthead, date, and display heading. Capsules and circles replace
    the slants; the page change is a disc.
  - New: `ReviewOrbit.layout` option `dueRim` (+ test), `orbitSvg` options, `resultArcSvg`,
    `growthRows`/`growthLeadHtml`, `Shell.fitInverts` and `[data-invert]`, font preloads on
    the trust pages.
  - No change to grading, generation rules, skill counting, review scheduling, variant
    generation, data sent or stored, persistence, or the API.
- November 2026, V4 visual redo "Cut Poster" (record in `docs/REDESIGN-V4.md`):
  - Shell: a top bar instead of the left rail; a masthead plane per page instead of the
    vertical band; a new page transition. Home is a cut poster (giant word or real count
    on blue, the action on paper, the orbit on the dark desk). Practice setup is a paper
    form with course and topic first ("Start practice"); questions are paper sheets with an
    off-register print that turns to the state's colour (a wrong answer jolts). Results is a
    score poster with the set's questions as numbered dots on a ring. Review leads with a
    giant due count. Settings lists "Your data" first.
  - New: the paper token scope, `--paper`, `--on-dark`, status `-ink` tokens, width-sized
    plane boxes, `resultRingSvg` (decorative, `app.js`), nav marker `ResizeObserver`,
    two harness states (`home-first-fallback`, `review-queue`) and seeded randomness.
  - No change to grading, generation rules, skill counting, review scheduling, variant
    generation, data sent or stored, persistence, or the API.
- November 2026, design review round 2 (first screens and the phone path):
  - Strict topic sets no longer carry other skills' due reviews; a failed or empty request
    keeps the current set; replacing an unfinished set asks first.
  - Home first visit: width-matched fallback fonts, the headline sized by its own column,
    a shorter phone headline, the step number said once (not in the band); the button is in
    the first screen at 320-1440 px with real or fallback fonts.
  - Phone path: compact practice header with the set's source, layered wrong-answer
    feedback, a result screen led by one next step, a review queue (Review "Today" card,
    queue bar, Home and results start it), "Continue at question N" on Home.
  - Data safety: one attempt upload at a time, removal by `eventId`, server dedup
    (`event_id` column); finished sets and the Notes excerpt survive a refresh; backup
    restore shows the backup date and counts first.
  - Accessibility: `--control-edge` (3:1+) for control borders, 44 px formula buttons on
    phones, orbit tap targets up to 44 px without overlap.
- November 2026, trustworthy learning feedback (from a product design review):
  - AP Calculus AB bank tagged with skills (`k`), skill catalog and picker, tag-first topic
    matching, "only questions on this topic" option, per-skill evidence on the result
    screen, no level for the general bucket.
  - Progress: last synced numbers kept offline (`studyBoostStatsCacheV1`), its course filter
    no longer changes Practice, and missions, streak, and the 14-day chart use local dates
    (`tz` on `/api/stats`).
  - Mistake page sends nothing until a start button is pressed; ratings unlock after the
    answer is shown; picked-but-unchecked options survive a refresh; "Built-in question
    bank" chip; "13 AP courses"; the offline Notes output is an excerpt, not a summary;
    the topic hint updates on every keystroke so Generate no longer moves under a tap.
- November 2026, flagship redesign ("Signal Blue", record in `docs/REDESIGN-PROGRESS.md`):
  - Home command center (real next task first), Practice focus mode (one question at a
    time, set bar, keyboard keys, band shows the question number), result sequence,
    Review Orbit (course sectors × SM-2 days, filters, selectable nodes, list view) with
    the Mistake Library (search, sort, confirmed delete), editorial Notes, Progress top
    line and labelled 14-day bars, Setup with a Reduce-motion setting and the AI
    connection folded away.
  - New: `js/review-orbit.js` (+ tests), `HomeSummary.weekTopLine`, `Shell.setBand`,
    `tests/visual/` (capture harness + fixtures), `docs/REDESIGN-PROGRESS.md`.
  - Fixed: offline Notes summary merged lines; built-in questions claimed to come from
    the student's notes ("[From your notes: …]" prefix) and carried a "[Medium · course]"
    prefix into saved mistakes; single delete had no confirmation; late font swap (CLS);
    the 250 KB bank loaded on every page.
  - No API, SM-2, mastery, storage-format, or deployment change. One optional field
    (`motion`) in `studyBoostUIPrefsV1`.
- November 2026, similar-question practice (adaptive error-based practice):
  - New: `mathcheck.py`, `variant_templates.py`, `variant_engine.py`,
    `js/variant-practice.js`, `docs/VARIANT-PRACTICE.md`, the mistake page, `/api/variants`,
    the `ai_generation_log` table, the `variant` attempt source, `bySource` stats,
    Progress "By practice type", Topic Mastery "N similar", Home variant next step,
    Review recommendations, a Playwright end-to-end suite and CI job.
  - Changed: MCQ picks, options, and difficulty are now saved with each mistake; mastery
    keeps per-source counts; privacy page describes the similar-question data flow;
    request bodies capped at 2 MB.
  - Test growth: pytest 16 to 237, JS 67 to 93, plus 5 end-to-end tests.
- Earlier history (redesign into six views, KaTeX, AP-authentic question bank, SM-2,
  topic mastery, per-user progress, backups, deployment): `DEVLOG.md`.

## 14. Playbooks for common tasks

- **Add a built-in similar-question skill**: write a builder in `variant_templates.py`
  returning `(kind, expression, [correct, d1, d2, d3], notes, explanation, stem, extra)`,
  register it in `_BUILDERS` and `SKILLS`, add a classifier pattern, and add it to the
  parametrized test in `tests/test_variant_templates.py` (every level must verify across
  40 draws with at least 10 distinct questions).
- **Add a verification kind**: implement it in `mathcheck.check_spec` (with pairwise
  option distinctness), add tests in `tests/test_mathcheck.py`, then describe it in
  `SYSTEM_PROMPT` in `variant_engine.py`.
- **Change AI prompts or gates**: `variant_engine.py`; every new rejection message needs a
  fixed code in `_PROBLEM_CODES` (codes, never messages, reach the database).
- **Add a view**: a `<section class="view" data-view="...">` in `index.html`, the name in
  `VIEWS` (and `BAND`, `TITLES`) in `js/shell.js`, a nav link if top level, and render on
  the `studyboost:view` event in `app.js`.
- **Add a stored field**: optional and backward compatible (old records lack it);
  if it is a new `localStorage` key that the student would miss, add it to `BACKUP_KEYS`.
- **Add a subject to the bank**: follow `docs/QUESTION-BANK-STANDARD.md`, add the id to
  `AP_SUBJECTS` in `app.js`, keep `tests/question-bank.test.js` green.
- **Tag a course with skills**: add its catalog to `SKILLS` in `js/practice-selection.js`, tag
  every item with `k` (main skill first), reuse the built-in generator's ids where they
  overlap; the bank validator then requires full coverage (`docs/QUESTION-BANK-STANDARD.md`).
