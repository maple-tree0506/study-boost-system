# TrackForge (StudyBoost AI)

## Run locally
1. Install deps: `py -m pip install -r requirements.txt`
2. Set API keys (one of them):
   - OpenAI: `set OPENAI_API_KEY=sk-...`
   - Gemini: `set GEMINI_API_KEY=...` (optional)
3. Start server: `py server.py`
4. Open: http://127.0.0.1:8765/

## Notes
- This project uses a local proxy (`server.py`). Keys stay on the server side.
- If the selected provider key is missing, the UI falls back to offline demo questions.

## Project structure
- `index.html`: page markup
- `css/styles.css`: styling
- `js/app.js`: application logic
- `server.py`: API proxy
