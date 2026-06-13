# TrackForge (StudyBoost AI)

[![CI](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml/badge.svg)](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml)

**Live demo:** <https://studyboostai.pythonanywhere.com/> — runs in **offline mode**
(no AI key on the demo server): practice questions come from the built-in bank for
all 14 AP subjects, and the adaptive loop (spaced repetition, mistake review, topic
mastery) is fully functional. The Progress panel starts with **synthetic seed data**
(disclosed here, periodically reset); your Mistake Log and Topic Mastery are stored
in your own browser. Run it locally with your own API key to enable real AI
summaries and AI-generated questions.

**Privacy:** the demo records anonymous usage statistics — an opaque random ID per
browser, plus each question's subject, type, and whether it was answered correctly —
to measure learning outcomes. No names, emails, or personal information are collected
or requested. **Beta testers:** please use the live link above (results from a copy
run locally with `python server.py` are not part of the study). Your mistake log and
topic mastery live in your browser — use **Setup & connection → Download my data** to
back them up (browsers can clear local storage), and **Restore from file** to bring
them back or move them to another device.

> **This is a client + server app — it is not a static page.** Opening
> `index.html` directly (`file://`) only runs the offline mode; AI features and
> progress tracking need the local server below. Always use the
> `http://127.0.0.1:8765/` URL.

## Quick start (Windows, easiest)
1. **Double-click `start.bat`.** It installs dependencies, starts the server, and
   opens the app in your browser. Keep the black window open while you use it;
   close it to stop the server.
2. (For AI features) add your API key first — see "Run locally (manual)" step 2
   below. Without a key,
   the app still works in **offline mode** (built-in question bank for all 14 AP
   subjects), so you can try the full workflow with no setup.

## For other people running this
- They need [Python 3](https://www.python.org/) installed, then double-click
  `start.bat` (or follow "Run locally" below).
- **AI features use a key, and the key is never shared in this repo.** Each person
  adds their **own** API key to a local `.env` (OpenAI, or any OpenAI-compatible
  provider such as Groq via `OPENAI_BASE_URL`). With no key, offline mode works.
- A non-technical reviewer who cannot run a server can use the
  [live demo](https://studyboostai.pythonanywhere.com/) directly (offline mode,
  see above).

## Run locally (manual)
1. Install deps: `py -m pip install -r requirements.txt`
2. Open `.env` in the project folder and fill in your key:
   - `OPENAI_API_KEY=...` — your OpenAI-compatible API key
   - `OPENAI_BASE_URL=...` — optional; set this to use an OpenAI-compatible provider
     (e.g. Groq: `https://api.groq.com/openai/v1`). Leave unset for OpenAI itself.
3. Start server: `py server.py` (restart after editing `.env`)
4. Open: http://127.0.0.1:8765/

## Notes
- This project uses a local proxy (`server.py`). The key stays on the server side.
- If the API key is missing or an AI call fails, the UI falls back to an offline
  question bank that covers **all 14 AP subjects** (basic / medium / challenge
  tiers). Subjects without a bank degrade honestly instead of showing
  wrong-subject questions.

## Math rendering
Mathematical expressions are written as LaTeX delimited with `$...$` and rendered with
**KaTeX**. The AI is prompted to emit LaTeX, so equations in AP Calculus/Physics/Chemistry
questions are typeset rather than shown as plain ASCII. If KaTeX (loaded from a CDN) is
unavailable, the raw text is shown instead — it degrades gracefully, never crashes.
(The built-in offline question bank is still plain text; converting it to LaTeX is a follow-up.)

## Practice & answers
- **Answers are gated (Khan-style):** the suggested answer stays hidden until you
  act — multiple-choice reveals after "Check answer"; short-answer/FRQ reveals
  after you type an answer and click "Submit answer", then you self-grade.
- Short-answer questions include a text box so you write your own response; your
  answer is saved alongside the question in the Mistake Log.

## Progress tracking (SQLite)
- Every graded question (MCQ "Check answer" or short-answer "Mark correct/incorrect")
  is recorded server-side in `studyboost.db` (created automatically on first run).
- The **Progress** panel shows overall accuracy, total answered, per-subject accuracy,
  and a 14-day accuracy/volume trend — drawn with plain HTML/CSS (no chart library).
- Resilience: if the server is unreachable, grading still works and results queue in
  `localStorage`, then sync automatically once the server is reachable again.
- The database file is local-only and git-ignored.

### API
- `POST /api/attempt` — body `{ subject, type, correct, ts }`; stores one graded result.
- `GET /api/stats` — returns `{ overall, bySubject, daily }` for the dashboard.

## Testing
- **Backend (Python):** `py -m pip install -r requirements-dev.txt` then `pytest -q`.
  Tests use a temporary database (via the `STUDYBOOST_DB` env var) and never touch your
  real `studyboost.db`.
- **Frontend (JS):** `node --test tests/spaced-repetition.test.js tests/practice-selection.test.js tests/mastery-model.test.js`
  — unit tests for the SM-2 scheduler, the R1 practice-selection planner (due-review
  selection + explanation passthrough), and the topic-mastery model (normalization, EMA
  update math, volume-gated levels, summary ordering), using Node's built-in test runner
  (no dependencies; Node 18+).
- Both suites run in CI on every push (see the badge above).

## AI output reliability
LLM responses are treated as an unreliable input that must be validated:
- **JSON mode**: the proxy forwards `response_format: {"type":"json_object"}` so the model
  returns syntactically valid JSON.
- **Shape validation**: JSON mode guarantees valid JSON but *not the right shape*, so the client
  validates the structure and **retries once** before falling back to the offline bank. The two
  generators validate differently:
  - *Summary*: `validateSummaryShape` checks the object (e.g. the model may return `key_items`
    instead of `keyPoints`); on failure the same request is retried once.
  - *Quiz*: `normalizeAIQuestions` filters out malformed items, then `isQuizQualityAcceptable`
    enforces the requested MCQ/short-answer structure; if the set falls short it regenerates once
    before falling back.
- **Reliability metric**: each generation is recorded as `ok` (valid first try), `repaired`
  (valid after one retry), or `failed`. Open the browser console and run `getAiReliability()`
  to see the running counts — this is how the malformed-output rate is measured.

## Security model & limitations
This is a **local, single-user** tool; the security model is scoped to that, and stated honestly:
- **API keys stay on the server.** They are read from `.env` (gitignored) and never sent to the
  browser. The frontend only talks to the local proxy.
- **Same-origin only.** The page and the API are served from the same Flask app, so CORS is not
  enabled — arbitrary websites cannot call the proxy.
- **Per-IP rate limiting** on the AI (`/api/chat`) and attempt (`/api/attempt`) endpoints, plus
  request size/count caps, to prevent runaway cost and database flooding.
- **Known limitation:** rate limiting is **in-memory** — it resets when the server restarts and is
  per-process, so it is suitable for local single-user use, not multi-instance production. A real
  deployment would move it to a shared store (e.g. Redis) and add a hard usage cap.

## Project structure
- `index.html`: page markup
- `css/styles.css`: styling
- `js/app.js`: application logic
- `js/question-bank.js`: offline question bank (all 14 AP subjects, 3 tiers)
- `server.py`: API proxy + SQLite persistence
- `studyboost.db`: local progress database (auto-created, git-ignored)
- `tests/`: pytest suite (run with `pytest -q`; also runs in CI)
- `DEVLOG.md`: dated development log (decisions, bugs, fixes)
