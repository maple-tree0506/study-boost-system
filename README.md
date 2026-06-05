# TrackForge (StudyBoost AI)

[![CI](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml/badge.svg)](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml)

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
- A non-technical reviewer who cannot run a server can still see everything via a
  short demo video / a deployed link (planned).

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

## Practice & answers
- **Answers are gated (Khan-style):** the model answer stays hidden until you
  act — multiple-choice reveals after "Check answer"; short-answer/FRQ reveals
  after you type an answer and click "Submit answer", then you self-grade.
- Short-answer questions include a text box so you write your own response; your
  answer is saved alongside the question in the mistake log.

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
- Install dev deps: `py -m pip install -r requirements-dev.txt`
- Run the suite: `pytest -q`
- Tests use a temporary database (via the `STUDYBOOST_DB` env var) and never touch
  your real `studyboost.db`. CI runs them on every push (see the badge above).

## Project structure
- `index.html`: page markup
- `css/styles.css`: styling
- `js/app.js`: application logic
- `js/question-bank.js`: offline question bank (all 14 AP subjects, 3 tiers)
- `server.py`: API proxy + SQLite persistence
- `studyboost.db`: local progress database (auto-created, git-ignored)
- `tests/`: pytest suite (run with `pytest -q`; also runs in CI)
- `DEVLOG.md`: dated development log (decisions, bugs, fixes)
