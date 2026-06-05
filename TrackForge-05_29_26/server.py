"""
StudyBoost AI — local API proxy.

Set keys in the project .env file (recommended), or via environment variables.
Run: py server.py
Then open http://127.0.0.1:8765/
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(APP_DIR, ".env")
DB_PATH = os.path.join(APP_DIR, "studyboost.db")


def _load_local_env() -> None:
    """Load KEY=value pairs from .env (does not override existing env vars)."""
    if not os.path.isfile(ENV_FILE):
        return
    with open(ENV_FILE, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_local_env()


def _db() -> sqlite3.Connection:
    """Open a fresh connection per request (safe across Flask worker threads)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL,
                qtype TEXT NOT NULL,
                correct INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


_init_db()

app = Flask(__name__, static_folder=APP_DIR)
CORS(app)

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

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
        }
    )


@app.route("/api/attempt", methods=["POST"])
def record_attempt():
    body = request.get_json(silent=True) or {}
    subject = (str(body.get("subject") or "Uncategorized")).strip()[:120] or "Uncategorized"
    qtype = (str(body.get("type") or "Unknown")).strip()[:60] or "Unknown"
    correct = 1 if body.get("correct") else 0

    ts = str(body.get("ts") or "").strip()
    if not _valid_iso(ts):
        ts = datetime.now(timezone.utc).isoformat()

    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO attempts (subject, qtype, correct, created_at) VALUES (?, ?, ?, ?)",
                (subject, qtype, correct, ts),
            )
            conn.commit()
    except Exception as e:  # noqa: BLE001
        print("[StudyBoost ERROR] attempt insert", repr(e), file=sys.stderr)
        return jsonify({"error": "Could not store attempt"}), 500

    return jsonify({"ok": True})


@app.route("/api/stats")
def stats():
    try:
        with _db() as conn:
            rows = conn.execute(
                "SELECT subject, qtype, correct, created_at FROM attempts"
            ).fetchall()
    except Exception as e:  # noqa: BLE001
        print("[StudyBoost ERROR] stats query", repr(e), file=sys.stderr)
        return jsonify({"error": "Could not read stats"}), 500

    total = len(rows)
    correct_total = sum(int(r["correct"]) for r in rows)

    by_subject_map: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})
    by_day_map: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})
    for r in rows:
        subj = by_subject_map[r["subject"] or "Uncategorized"]
        subj["answered"] += 1
        subj["correct"] += int(r["correct"])

        day = (r["created_at"] or "")[:10]
        if day:
            by_day_map[day]["answered"] += 1
            by_day_map[day]["correct"] += int(r["correct"])

    by_subject = [
        {
            "subject": name,
            "answered": v["answered"],
            "correct": v["correct"],
            "accuracy": (v["correct"] / v["answered"]) if v["answered"] else 0,
        }
        for name, v in by_subject_map.items()
    ]
    by_subject.sort(key=lambda x: (-x["answered"], x["subject"]))

    today = date.today()
    daily = []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        e = by_day_map.get(d, {"answered": 0, "correct": 0})
        daily.append(
            {
                "date": d,
                "answered": e["answered"],
                "correct": e["correct"],
                "accuracy": (e["correct"] / e["answered"]) if e["answered"] else 0,
            }
        )

    return jsonify(
        {
            "overall": {
                "answered": total,
                "correct": correct_total,
                "accuracy": (correct_total / total) if total else 0,
            },
            "bySubject": by_subject,
            "daily": daily,
        }
    )


def _valid_iso(value: str) -> bool:
    if not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


@app.route("/api/chat", methods=["POST"])
def chat_proxy():
    body = request.get_json(silent=True) or {}
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

    if not OPENAI_KEY:
        return jsonify({"error": "Server is missing OPENAI_API_KEY"}), 503

    try:
        content = _openai_chat(model, messages)
        return jsonify({"content": content})
    except RuntimeError as e:
        print("[StudyBoost ERROR]", model, str(e), file=sys.stderr)
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print("[StudyBoost ERROR]", model, repr(e), file=sys.stderr)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print("StudyBoost AI proxy — http://127.0.0.1:%s/" % port, file=sys.stderr)
    app.run(host="127.0.0.1", port=port, debug=False)
