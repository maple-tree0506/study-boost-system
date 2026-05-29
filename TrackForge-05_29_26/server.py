"""
StudyBoost AI — local API proxy.
Set keys via environment (never commit real keys):
  set OPENAI_API_KEY=sk-...
  set GEMINI_API_KEY=...   (optional, for Gemini)

Run: py server.py
Then open http://127.0.0.1:8765/
"""

from __future__ import annotations

import os
import sys
import time

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

APP_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=APP_DIR)
CORS(app)

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

# Basic abuse protection for local usage (prevents runaway costs).
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "10"))
RATE_WINDOW_SECONDS = 60
MAX_TOTAL_CHARS = int(os.environ.get("MAX_TOTAL_CHARS", "12000"))
MAX_MESSAGE_CHARS = int(os.environ.get("MAX_MESSAGE_CHARS", "6000"))
MAX_MESSAGES = int(os.environ.get("MAX_MESSAGES", "30"))

_rate_history: dict[str, list[float]] = {}


def _client_ip() -> str:
    # If behind a proxy, prefer X-Forwarded-For; otherwise fall back to remote_addr.
    xff = request.headers.get("X-Forwarded-For", "").strip()
    if xff:
        return xff.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.time()
    stamps = _rate_history.get(ip, [])
    # Prune old timestamps
    stamps = [t for t in stamps if now - t < RATE_WINDOW_SECONDS]
    if len(stamps) >= RATE_LIMIT_PER_MIN:
        _rate_history[ip] = stamps
        return True
    stamps.append(now)
    _rate_history[ip] = stamps
    return False


def _openai_chat(model: str, messages: list) -> str:
    if not OPENAI_KEY:
        raise RuntimeError("Server is missing OPENAI_API_KEY")
    url = f"{OPENAI_BASE}/chat/completions"
    res = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": model, "messages": messages, "temperature": 0.4},
        timeout=120,
    )
    if not res.ok:
        raise RuntimeError(res.text or f"OpenAI error {res.status_code}")
    data = res.json()
    return data["choices"][0]["message"]["content"]


def _gemini_chat(model: str, messages: list) -> str:
    if not GEMINI_KEY:
        raise RuntimeError("Server is missing GEMINI_API_KEY")
    system_chunks = [m["content"] for m in messages if m.get("role") == "system"]
    other = [m for m in messages if m.get("role") != "system"]
    user_text = "\n\n".join(m["content"] for m in other if m.get("content"))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload: dict = {
        "contents": [{"parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.4},
    }
    if system_chunks:
        payload["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_chunks)}]}

    res = requests.post(
        url,
        params={"key": GEMINI_KEY},
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if not res.ok:
        raise RuntimeError(res.text or f"Gemini error {res.status_code}")
    data = res.json()
    parts = data["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts)


@app.route("/")
def index_page():
    return send_from_directory(APP_DIR, "index.html")


@app.route("/css/<path:filename>")
def css_files(filename: str):
    return send_from_directory(os.path.join(APP_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def js_files(filename: str):
    return send_from_directory(os.path.join(APP_DIR, "js"), filename)


@app.route("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "openai_configured": bool(OPENAI_KEY),
            "gemini_configured": bool(GEMINI_KEY),
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat_proxy():
    body = request.get_json(silent=True) or {}
    provider = (body.get("provider") or "openai").lower().strip()
    model = (body.get("model") or "").strip()
    messages = body.get("messages")

    if not model:
        return jsonify({"error": "Missing model"}), 400
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Missing messages"}), 400

    ip = _client_ip()
    if _rate_limited(ip):
        return jsonify({"error": "Rate limit exceeded. Try again in about a minute."}), 429

    if len(messages) > MAX_MESSAGES:
        return jsonify({"error": "Too many messages in a single request."}), 413

    total_chars = 0
    for m in messages:
        if not isinstance(m, dict):
            continue
        content = m.get("content", "")
        if not isinstance(content, str):
            continue
        if len(content) > MAX_MESSAGE_CHARS:
            return jsonify({"error": "A message is too long."}), 413
        total_chars += len(content)
        if total_chars > MAX_TOTAL_CHARS:
            return jsonify({"error": "Request text is too large."}), 413

    if provider == "openai" and not OPENAI_KEY:
        return jsonify({"error": "Server is missing OPENAI_API_KEY"}), 503
    if provider == "gemini" and not GEMINI_KEY:
        return jsonify({"error": "Server is missing GEMINI_API_KEY"}), 503

    try:
        if provider == "openai":
            content = _openai_chat(model, messages)
        elif provider == "gemini":
            content = _gemini_chat(model, messages)
        else:
            return jsonify({"error": f"Unknown provider: {provider}"}), 400
        return jsonify({"content": content})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print("StudyBoost AI proxy — http://127.0.0.1:%s/" % port, file=sys.stderr)
    app.run(host="127.0.0.1", port=port, debug=False)
