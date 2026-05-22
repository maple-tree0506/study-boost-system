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

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

APP_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=APP_DIR)
CORS(app)

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()


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
