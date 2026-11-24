# StudyBoost — Architecture

A vanilla-JS front end over a small Flask + SQLite back end, with AI supplied by
Groq through an OpenAI-compatible endpoint. No build chain: scripts load via
classic `<script>` tags, and each logic module dual-exports (`window.*` for the
browser, `module.exports` for Node tests).

## Front end (`index.html` + `js/`)

| Module | Responsibility |
|---|---|
| `js/question-bank.js` | `window.OFFLINE_BANK`: 14 subjects, each `{basic, medium, challenge}` × `{mcq, sa}`. Powers keyless offline practice. |
| `js/spaced-repetition.js` | SM-2 scheduling for the Mistake Log (intervals, ease, due dates). |
| `js/mastery-model.js` | Per subject+topic mastery via EMA (α=0.4), volume-gated levels (new/developing/proficient/mastered). |
| `js/practice-selection.js` | Practice planner: injects due mistakes into a generated set (cap 3, provenance tags `review`/`generated`). |
| `js/home-summary.js` | Home logic: level progress, live streak, daily missions, next-step choice, review-orbit geometry. Pure, tested. |
| `js/variant-practice.js` | Similar-question rules: difficulty staircase, Beta-posterior mastery evidence, SM-2 forward nudge, weakest-topic ranking, request/response handling. Pure, tested. |
| `js/shell.js` | Views and motion: hash routing, page wipe, nav marker, tooltips, themed confirm dialog. No learning logic and no data. |
| `js/app.js` | UI glue: rendering, generate, grading, mistake log, stats, export/import. Renders via `escapeHtml` then `innerHTML`, then `typesetMath` (KaTeX). |

The page is one document with six views (`home`, `notes`, `practice`, `review`,
`progress`, `setup`) plus one sub-page, `mistake` (`#mistake/<id>`, a saved mistake and
its similar questions; the nav keeps Review marked), addressed by URL hash. All views stay in the DOM, so `app.js`
keeps its element references and in-progress state while the student moves around;
`shell.js` only toggles which view shows and fires `studyboost:view`. Visual rules
are in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

KaTeX is loaded from CDN for math; question text is HTML-escaped before insertion,
so code/markup in questions renders literally (the only authoring constraint is
avoiding a bare `$`, which KaTeX would treat as a math delimiter).

## Back end

| File | Responsibility |
|---|---|
| `server.py` | Flask app. `/api/chat` (Groq, OpenAI-compatible), `/api/health`, `/api/attempt`, `/api/stats`, `/api/variants`. SQLite `attempts` table (nullable `user_id` + `source` ∈ generated/review/variant) and `ai_generation_log` (counts only). |
| `variant_engine.py` | Similar-question pipeline: input bounds, prompts, schema validation, quality gates, diagnosis rules, one repair call, fallback. LLM injected for tests. |
| `variant_templates.py` | Built-in generator for seven AP Calculus skills, each distractor a named misconception; skill classifier. |
| `mathcheck.py` | Safe ASCII-math parser and checks (derivative, antiderivative, definite integral, limit, value) and a LaTeX printer. No `eval`. |
| `metrics_beta.py` | Read-only metrics (Review Recovery Rate, similar-question accuracy, generation reliability), stdlib only, `--since/--until`. |
| `reset_demo.py` | Wipe + reseed demo data (refuses without `DEMO_SEED=1`). |

## Data & storage

- **Server**: SQLite `attempts` (one row per graded answer; anon `user_id`, `source`) and
  `ai_generation_log` (one row per similar-question request: counts, codes, tokens; no text).
- **Client**: `localStorage` — `studyBoostUserIdV1` (anon `u-`+uuid, no PII),
  mistakes, mastery, `studyBoostUIPrefsV1`, XP/streak/daily (`studyBoostXpV1`,
  `studyBoostStreakV1`, `studyBoostDailyV1`), and the versioned export/import backup
  (`studyboost-backup` JSON, version 2 since XP/streak/daily were added; `BACKUP_KEYS`
  in `app.js` is the list).
- **AI**: `.env` holds a **Groq** key used via `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
  with a llama model. The deployed demo runs **keyless (offline mode)** so visitors
  never consume the quota.

## Tests & CI

- `node --test` over `tests/spaced-repetition.test.js`, `practice-selection.test.js`,
  `mastery-model.test.js`, `question-bank.test.js`, `home-summary.test.js`,
  `variant-practice.test.js` (explicit file list, never bare `tests/`).
- `pytest` (`conftest.py`) for the server, the math engine, the templates, and the variant engine.
- `tests/e2e/variant-flow.e2e.js`: Playwright end-to-end run of similar-question practice.
- GitHub Actions runs all three on push.

## Deploy

PythonAnywhere (free tier), keyless offline mode, ~0.5s load. Update path: PA
`git pull` + Web-tab Reload (the only step not delegated to Claude). See
[PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) for what's next, [UX-FLOW.md](UX-FLOW.md)
for the user journey, [QUESTION-BANK-STANDARD.md](QUESTION-BANK-STANDARD.md)
for question authoring rules, and [VARIANT-PRACTICE.md](VARIANT-PRACTICE.md) for
similar-question practice.
