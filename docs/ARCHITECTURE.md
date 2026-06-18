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
| `js/app.js` | UI glue (~1600 lines): rendering, generate, grading, mistake log, stats, export/import. Renders via `escapeHtml` then `innerHTML`, then `typesetMath` (KaTeX). |

KaTeX is loaded from CDN for math; question text is HTML-escaped before insertion,
so code/markup in questions renders literally (the only authoring constraint is
avoiding a bare `$`, which KaTeX would treat as a math delimiter).

## Back end

| File | Responsibility |
|---|---|
| `server.py` | Flask app. `/api/chat` (Groq, OpenAI-compatible), `/api/health`, `/api/attempt`, `/api/stats`. SQLite `attempts` table (nullable `user_id` + `source`). |
| `metrics_beta.py` | Read-only metrics (Review Recovery Rate), stdlib only, `--since/--until`. |
| `reset_demo.py` | Wipe + reseed demo data (refuses without `DEMO_SEED=1`). |

## Data & storage

- **Server**: SQLite `attempts` (one row per graded answer; anon `user_id`, `source`).
- **Client**: `localStorage` — `studyBoostUserIdV1` (anon `u-`+uuid, no PII),
  mistakes, mastery, `studyBoostUIPrefsV1`, and the versioned export/import backup
  (`studyboost-backup` JSON).
- **AI**: `.env` holds a **Groq** key used via `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
  with a llama model. The deployed demo runs **keyless (offline mode)** so visitors
  never consume the quota.

## Tests & CI

- `node --test` over `tests/spaced-repetition.test.js`, `practice-selection.test.js`,
  `mastery-model.test.js`, `question-bank.test.js` (explicit file list, never bare `tests/`).
- `pytest` (`conftest.py`) for the server.
- GitHub Actions runs both on push.

## Deploy

PythonAnywhere (free tier), keyless offline mode, ~0.5s load. Update path: PA
`git pull` + Web-tab Reload (the only step not delegated to Claude). See
[PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) for what's next, [UX-FLOW.md](UX-FLOW.md)
for the user journey, and [QUESTION-BANK-STANDARD.md](QUESTION-BANK-STANDARD.md)
for question authoring rules.
