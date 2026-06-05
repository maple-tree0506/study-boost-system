import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
INDEX_HTML = ROOT / "index.html"


def _strip_leading_indent(text: str, indent: str) -> str:
    lines = text.splitlines()
    return "\n".join([ln[len(indent) :] if ln.startswith(indent) else ln for ln in lines])


def main() -> None:
    s = INDEX_HTML.read_text(encoding="utf-8")

    css_match = re.search(r"<style>([\s\S]*?)</style>", s)
    if not css_match:
        raise RuntimeError("Could not find <style>...</style> block in index.html")
    css = css_match.group(1)
    css = _strip_leading_indent(css, "        ")  # remove 8-space indentation

    js_match = re.search(r"<script>([\s\S]*?)</script>", s)
    if not js_match:
        raise RuntimeError("Could not find <script>...</script> block in index.html")
    js = js_match.group(1)
    js = _strip_leading_indent(js, "        ")

    (ROOT / "css").mkdir(exist_ok=True)
    (ROOT / "js").mkdir(exist_ok=True)

    (ROOT / "css" / "styles.css").write_text(css, encoding="utf-8")
    (ROOT / "js" / "app.js").write_text(js, encoding="utf-8")

    new_s = re.sub(
        r"<style>[\s\S]*?</style>",
        '<link rel="stylesheet" href="/static/css/styles.css">',
        s,
        count=1,
    )
    new_s = re.sub(
        r"<script>[\s\S]*?</script>",
        '<script src="/static/js/app.js" defer></script>',
        new_s,
        count=1,
    )
    INDEX_HTML.write_text(new_s, encoding="utf-8", newline="\n")

    (ROOT / "README.md").write_text(
        """# TrackForge (StudyBoost AI)

## Run locally
1. Install deps: `py -m pip install -r requirements.txt`
2. Set your API key:
   - `set OPENAI_API_KEY=...` (OpenAI-compatible key)
   - optional `set OPENAI_BASE_URL=...` for an OpenAI-compatible provider (e.g. Groq)
3. Start server: `py server.py`
4. Open: http://127.0.0.1:8765/

## Notes
- This project uses a local proxy (`server.py`). The key stays on the server side.
- If the API key is missing, the UI falls back to offline demo questions.

## Project structure
- `index.html`: page markup
- `css/styles.css`: styling
- `js/app.js`: application logic
- `server.py`: API proxy
""",
        encoding="utf-8",
    )

    print("Extracted assets into css/ and js/; updated index.html; wrote README.md")


if __name__ == "__main__":
    main()

