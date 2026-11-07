# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

**TrackForge (StudyBoost AI)** is a local, single-user AP exam study app: Flask backend + vanilla HTML/JS frontend. SQLite (`studyboost.db`) stores progress; no Docker or external databases.

### Services

| Service | Required? | Notes |
|---------|-----------|-------|
| Flask (`server.py`) | **Yes** | Serves UI + API on `http://127.0.0.1:8765/` |
| SQLite | **Yes** (embedded) | Auto-created on first server start; tests use `STUDYBOOST_DB` |
| Browser | **Yes** | Must use `http://127.0.0.1:8765/`, not `file://` |
| OpenAI-compatible API | Optional | Set `OPENAI_API_KEY` in `.env`; without it, offline question bank works |

### PATH note

`pip install --user` puts `pytest` and `flask` in `~/.local/bin`. Add to PATH before running tests or the server:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Running the app

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /workspace
python3 server.py
```

Then open http://127.0.0.1:8765/. Use a tmux session (e.g. `studyboost-server`) for a long-running server process.

Optional AI setup: create `.env` with `OPENAI_API_KEY=...` (and optionally `OPENAI_BASE_URL=...`), then restart the server.

### Testing

See `README.md` Testing section. Quick reference:

```bash
export PATH="$HOME/.local/bin:$PATH"
pytest -q
node --test tests/spaced-repetition.test.js tests/practice-selection.test.js
```

Backend tests use a temporary DB via `conftest.py`; they never touch `studyboost.db`.

### Linting

No dedicated linter is configured in this repo. CI runs only `pytest` and Node unit tests.

### API endpoints (local)

- `GET /api/health` — server status and whether an API key is configured
- `POST /api/attempt` — record a graded question
- `GET /api/stats` — progress dashboard data
- `POST /api/chat` — AI proxy (requires API key)
