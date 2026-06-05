# TrackForge (StudyBoost AI)

[![CI](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml/badge.svg)](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml)

## Run locally
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
