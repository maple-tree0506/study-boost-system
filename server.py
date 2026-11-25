"""
StudyBoost AI — local API proxy.

Set keys in the project .env file (recommended), or via environment variables.
Run: py server.py
Then open http://127.0.0.1:8765/
"""

from __future__ import annotations

import json
import os
import random
import re
import sqlite3
import sys
import time
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timedelta, timezone

import requests
from flask import Flask, jsonify, request, send_from_directory

import variant_engine as ve
import variant_templates as vt

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(APP_DIR, ".env")
# Allow tests (or alternate deployments) to point at a different DB file.
DB_PATH = os.environ.get("STUDYBOOST_DB") or os.path.join(APP_DIR, "studyboost.db")


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


def _seed_demo_attempts_if_needed() -> None:
    """Demo-instance seeding (public deploy): when DEMO_SEED=1 and the attempts
    table is EMPTY, insert ~60 synthetic graded results spread over the last 14
    days so the Progress panel has content for first-time visitors. Never runs
    locally (env-gated) and never touches a non-empty table. The demo README
    discloses that this data is synthetic."""
    if os.environ.get("DEMO_SEED") != "1":
        return
    import random
    from datetime import datetime, timedelta, timezone

    with closing(_db()) as conn:
        count = conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]
        if count:
            return
        rng = random.Random(20260822)  # deterministic seed -> same demo data each reset
        subjects = [
            ("AP Calculus AB", 0.72),
            ("AP Biology", 0.78),
            ("AP Physics 1", 0.61),
            ("AP United States History", 0.69),
        ]
        now = datetime.now(timezone.utc)
        rows = []
        for day_back in range(13, -1, -1):
            day = now - timedelta(days=day_back)
            for subject, accuracy in subjects:
                for _ in range(rng.choice([0, 1, 1, 2])):  # ~1 per subject per day
                    qtype = rng.choice(["Multiple Choice", "Short Answer"])
                    correct = 1 if rng.random() < accuracy else 0
                    ts = day.replace(
                        hour=rng.randint(15, 22), minute=rng.randint(0, 59), second=0, microsecond=0
                    ).isoformat()
                    # user_id='demo-seed' marks synthetic rows so the beta metrics
                    # script can exclude them (alongside legacy NULL rows).
                    rows.append((subject, qtype, correct, ts, "demo-seed", "generated"))
        conn.executemany(
            "INSERT INTO attempts (subject, qtype, correct, created_at, user_id, source) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()


def _migrate_attempts_columns(conn: sqlite3.Connection) -> None:
    """Additive, idempotent migration: add the beta-instrumentation columns
    (user_id, source) if they are not already present. Existing rows get NULL,
    which the metrics script excludes. Safe to run on every startup."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(attempts)")}
    if "user_id" not in existing:
        conn.execute("ALTER TABLE attempts ADD COLUMN user_id TEXT")
    if "source" not in existing:
        conn.execute("ALTER TABLE attempts ADD COLUMN source TEXT")


def _create_generation_log(conn: sqlite3.Connection) -> None:
    """Additive, idempotent: one row per similar-question request, METADATA ONLY.

    It holds counts, codes, and token usage so the daily AI quota survives restarts
    and generation reliability can be measured. It never stores question text,
    answers, or explanations (the privacy page promises that).
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_generation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            user_id TEXT,
            kind TEXT NOT NULL,
            generator TEXT NOT NULL,
            outcome TEXT NOT NULL,
            error_code TEXT,
            requested INTEGER NOT NULL DEFAULT 0,
            accepted INTEGER NOT NULL DEFAULT 0,
            rejected INTEGER NOT NULL DEFAULT 0,
            verified INTEGER NOT NULL DEFAULT 0,
            rejection_reasons TEXT,
            llm_calls INTEGER NOT NULL DEFAULT 0,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER,
            model TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_generation_log_user_day "
        "ON ai_generation_log (user_id, created_at)"
    )


def _init_db() -> None:
    with closing(_db()) as conn:
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
        _migrate_attempts_columns(conn)
        _create_generation_log(conn)
        conn.commit()
    _seed_demo_attempts_if_needed()


_init_db()

# static_folder=None disables Flask's built-in static route. It previously pointed
# at APP_DIR, and Flask derives static_url_path from the folder's NAME, so the whole
# project directory — including .env and studyboost.db — was downloadable at
# /<project-dir-name>/<file>. Every asset the page needs has an explicit route below.
app = Flask(__name__, static_folder=None)
# Hard cap on any request body (legitimate requests are far smaller: notes are capped
# at 12,000 characters). Werkzeug answers 413 before a larger body is buffered.
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
# No CORS: the page and the API are served from the same origin, so cross-origin
# headers are unnecessary. Not enabling CORS prevents arbitrary sites from calling
# this local proxy while the server is running.

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

# Basic abuse protection for local usage (prevents runaway costs).
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "10"))
# The attempt endpoint is lightweight but high-frequency (one call per graded
# question), so it gets its own, larger bucket than the AI chat endpoint.
ATTEMPT_RATE_LIMIT_PER_MIN = int(os.environ.get("ATTEMPT_RATE_LIMIT_PER_MIN", "60"))
RATE_WINDOW_SECONDS = 60
MAX_TOTAL_CHARS = int(os.environ.get("MAX_TOTAL_CHARS", "12000"))
MAX_MESSAGE_CHARS = int(os.environ.get("MAX_MESSAGE_CHARS", "6000"))
MAX_MESSAGES = int(os.environ.get("MAX_MESSAGES", "30"))

# Similar-question practice. Each request makes at most two AI calls (one generation,
# one targeted repair), so these bound both cost and latency.
VARIANT_RATE_LIMIT_PER_MIN = int(os.environ.get("VARIANT_RATE_LIMIT_PER_MIN", "6"))           # requests that may call the AI
VARIANT_BUILTIN_RATE_LIMIT_PER_MIN = int(os.environ.get("VARIANT_BUILTIN_RATE_LIMIT_PER_MIN", "30"))  # built-in generator only
VARIANT_DAILY_LIMIT = int(os.environ.get("VARIANT_DAILY_LIMIT", "40"))      # AI requests per user per UTC day
VARIANT_BUDGET_SECONDS = float(os.environ.get("VARIANT_BUDGET_SECONDS", "40"))
LLM_READ_TIMEOUT = float(os.environ.get("LLM_READ_TIMEOUT", "25"))
VARIANT_MODEL = os.environ.get("VARIANT_MODEL", ve.DEFAULT_MODEL)
MAX_VARIANT_BODY = 64 * 1024

_rate_history: dict[str, list[float]] = {}
_attempt_rate_history: dict[str, list[float]] = {}
_variant_rate_history: dict[str, list[float]] = {}
_variant_builtin_rate_history: dict[str, list[float]] = {}


def _client_ip() -> str:
    # If behind a proxy, prefer X-Forwarded-For; otherwise fall back to remote_addr.
    xff = request.headers.get("X-Forwarded-For", "").strip()
    if xff:
        return xff.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited(ip: str, history: dict[str, list[float]], limit: int) -> bool:
    now = time.time()
    stamps = history.get(ip, [])
    # Prune old timestamps
    stamps = [t for t in stamps if now - t < RATE_WINDOW_SECONDS]
    if len(stamps) >= limit:
        history[ip] = stamps
        return True
    stamps.append(now)
    history[ip] = stamps
    return False


def _openai_chat(model: str, messages: list, json_mode: bool = False) -> str:
    if not OPENAI_KEY:
        raise RuntimeError("Server is missing OPENAI_API_KEY")
    url = f"{OPENAI_BASE}/chat/completions"
    payload: dict = {"model": model, "messages": messages, "temperature": 0.4}
    if json_mode:
        # Ask the provider to return syntactically valid JSON. This eliminates most
        # parse failures; the client still validates the JSON *shape* separately.
        payload["response_format"] = {"type": "json_object"}
    res = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=120,
    )
    if not res.ok:
        raise RuntimeError(res.text or f"OpenAI error {res.status_code}")
    data = res.json()
    return data["choices"][0]["message"]["content"]


_DURATION_PART = re.compile(r"(\d+(?:\.\d+)?)(ms|h|m|s)")


def _parse_duration(value) -> float | None:
    """Seconds from a Retry-After value ("12", "1.5") or a reset hint ("2m59.56s", "750ms")."""
    if value is None:
        return None
    text = str(value).strip().lower()
    try:
        return max(0.0, float(text))
    except ValueError:
        pass
    total, matched = 0.0, False
    for amount, unit in _DURATION_PART.findall(text):
        matched = True
        total += float(amount) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[unit]
    return total if matched else None


def _llm_complete(model: str, messages: list, max_tokens: int, temperature: float, timeout: float):
    """One JSON-mode chat completion. Returns (content, usage); raises ve.LLMError with a
    code the client can explain (rate_limited, timeout, auth_error, bad_request,
    upstream_error, bad_response, not_configured). Provider error bodies are logged
    server-side, never sent to the browser."""
    if not OPENAI_KEY:
        raise ve.LLMError("not_configured")
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    try:
        res = requests.post(
            f"{OPENAI_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=(5, max(1.0, timeout)),
        )
    except requests.Timeout:
        raise ve.LLMError("timeout", "provider timed out") from None
    except requests.RequestException as e:
        raise ve.LLMError("upstream_error", type(e).__name__) from None
    if res.status_code == 429:
        retry = None
        for header in ("retry-after", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"):
            retry = _parse_duration(res.headers.get(header))
            if retry is not None:  # 0 is a valid answer: retry now
                break
        raise ve.LLMError("rate_limited", "provider 429", retry_after=retry)
    if res.status_code in (401, 403):
        raise ve.LLMError("auth_error", "provider %d" % res.status_code)
    if res.status_code in (400, 404, 422):
        print("[StudyBoost ERROR] variant request rejected:", res.status_code, res.text[:300], file=sys.stderr)
        raise ve.LLMError("bad_request", "provider %d" % res.status_code)
    if not res.ok:
        raise ve.LLMError("upstream_error", "provider %d" % res.status_code)
    try:
        data = res.json()
        content = data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise ve.LLMError("bad_response", "unreadable provider response") from None
    if not isinstance(content, str):
        raise ve.LLMError("bad_response", "empty content")
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    return content, usage


def _make_llm(model: str, deadline: float):
    """The engine's llm callable: bounded by the request deadline, with one short wait
    and retry when the provider's rate limit resets within a couple of seconds."""
    def llm(messages, max_tokens, temperature):
        for attempt in (1, 2):
            remaining = deadline - time.monotonic()
            if remaining < 3:
                raise ve.LLMError("timeout", "request budget used up")
            try:
                return _llm_complete(model, messages, max_tokens, temperature, min(LLM_READ_TIMEOUT, remaining - 1))
            except ve.LLMError as e:
                wait = e.retry_after
                if (e.code == "rate_limited" and attempt == 1 and wait is not None and wait <= 2.5
                        and deadline - time.monotonic() > wait + 8):
                    time.sleep(wait)
                    continue
                raise
    return llm


def _today_utc_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _ai_requests_today(user_id: str | None) -> int:
    if not user_id:
        return 0
    with closing(_db()) as conn:
        return conn.execute(
            # Only requests that actually consumed tokens count: a provider 429 or a
            # timeout spends nothing and must not lock the student out.
            "SELECT COUNT(*) FROM ai_generation_log WHERE user_id = ? AND llm_calls > 0 "
            "AND prompt_tokens + completion_tokens > 0 AND created_at >= ?",
            (user_id, _today_utc_start()),
        ).fetchone()[0]


def _log_generation(user_id, generator, outcome, error_code, requested, variants, meta, latency_ms) -> None:
    """Metadata only. Never pass question text, answers, or explanations here."""
    meta = meta or {}
    verified = sum(1 for v in variants if (v.get("verification") or {}).get("status") == "verified")
    try:
        with closing(_db()) as conn:
            conn.execute(
                "INSERT INTO ai_generation_log (created_at, user_id, kind, generator, outcome, error_code, "
                "requested, accepted, rejected, verified, rejection_reasons, llm_calls, prompt_tokens, "
                "completion_tokens, latency_ms, model) VALUES (?, ?, 'variant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    datetime.now(timezone.utc).isoformat(), user_id, generator, outcome, error_code,
                    requested, len(variants), int(meta.get("rejected") or 0), verified,
                    json.dumps(meta.get("rejectionReasons") or {}, sort_keys=True)[:1000],
                    int(meta.get("llmCalls") or 0), int(meta.get("promptTokens") or 0),
                    int(meta.get("completionTokens") or 0), latency_ms, meta.get("model"),
                ),
            )
            conn.commit()
    except Exception as e:  # noqa: BLE001 - logging must never break a response
        print("[StudyBoost ERROR] generation log", repr(e), file=sys.stderr)


_VARIANT_STATUS = {
    "bad_input": 400, "rate_limited": 429, "too_many_requests": 429, "daily_limit": 429, "timeout": 504,
    "invalid_output": 502, "bad_response": 502, "auth_error": 502, "bad_request": 502,
    "upstream_error": 502, "no_generator": 503, "not_configured": 503, "server_error": 500,
}


def _variant_error(code: str, message: str, retry_after=None, analysis=None):
    body = {"error": message, "code": code}
    if retry_after is not None:
        body["retryAfter"] = int(retry_after + 0.999)
    if analysis is not None:
        body["analysis"] = analysis
    resp = jsonify(body)
    resp.status_code = _VARIANT_STATUS.get(code, 500)
    if retry_after is not None:
        resp.headers["Retry-After"] = str(int(retry_after + 0.999))
    return resp


@app.route("/api/variants", methods=["POST"])
def generate_variants():
    """Similar-question practice for one saved mistake.

    Body: { mistake: {question, options, answer, userAnswer, explanation, subject, topic,
            difficulty, id}, level, count (1-3), avoid: [stems already seen],
            analysis (from an earlier round, re-validated), model, userId }
    The question text is processed (and sent to the AI provider when a key is set)
    but never stored; only counts and codes are logged.
    """
    # Flood guard first: it is cheap and runs before any database work.
    if _rate_limited(_client_ip(), _variant_builtin_rate_history, VARIANT_BUILTIN_RATE_LIMIT_PER_MIN):
        return _variant_error("too_many_requests", "Too many similar-question requests in the last minute. "
                              "Try again in about a minute.", 60)
    if (request.content_length or 0) > MAX_VARIANT_BODY:
        return jsonify({"error": "Request is too large.", "code": "bad_input"}), 413
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _variant_error("bad_input", "Send a JSON object.")
    try:
        mistake = ve.normalize_mistake(body.get("mistake"))
        req = ve.normalize_request(body, mistake)
    except ve.InputError as e:
        return _variant_error("bad_input", str(e))
    user_id = (str(body.get("userId") or "").strip()[:64]) or None

    started = time.monotonic()
    model = req["model"] or VARIANT_MODEL
    over_quota = bool(OPENAI_KEY) and VARIANT_DAILY_LIMIT >= 0 and _ai_requests_today(user_id) >= VARIANT_DAILY_LIMIT
    uses_ai = bool(OPENAI_KEY) and not over_quota
    # Requests that can spend AI quota also pass the tighter AI bucket; the built-in
    # generator costs no tokens, so the flood guard above is enough for it.
    if uses_ai and _rate_limited(_client_ip(), _variant_rate_history, VARIANT_RATE_LIMIT_PER_MIN):
        return _variant_error("too_many_requests", "Too many similar-question requests in the last minute. "
                              "Try again in about a minute.", 60)
    llm = _make_llm(model, started + VARIANT_BUDGET_SECONDS) if uses_ai else None
    try:
        result = ve.generate_variants(mistake, req, llm=llm, deadline=started + VARIANT_BUDGET_SECONDS,
                                      rng=random.Random(), model=model)
    except ve.VariantError as e:
        latency = int((time.monotonic() - started) * 1000)
        code, message = e.code, e.message
        if over_quota and code == "no_generator":
            code, message = "daily_limit", "You've used today's AI similar-question limit. It resets at midnight UTC."
        _log_generation(user_id, "none", "failed", code, req["count"], [], e.meta, latency)
        return _variant_error(code, message, e.retry_after, e.analysis)
    except Exception as e:  # noqa: BLE001
        print("[StudyBoost ERROR] variants", repr(e), file=sys.stderr)
        return _variant_error("server_error", "Something went wrong while generating questions.")

    if over_quota and result["generator"] == "template":
        result["notice"] = ("You've used today's AI similar-question limit, so these come from the built-in "
                            "generator. The AI limit resets at midnight UTC.")
    latency = int((time.monotonic() - started) * 1000)
    meta = result.pop("meta", {})
    _log_generation(user_id, result["generator"], meta.get("outcome", "ok"), None, req["count"],
                    result["variants"], meta, latency)
    result["level"] = req["level"]
    result["relation"] = req["relation"]
    return jsonify(result)


@app.route("/")
def index_page():
    return send_from_directory(APP_DIR, "index.html")


@app.route("/css/<path:filename>")
def css_files(filename: str):
    return send_from_directory(os.path.join(APP_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def js_files(filename: str):
    return send_from_directory(os.path.join(APP_DIR, "js"), filename)


@app.route("/assets/<path:filename>")
def asset_files(filename: str):
    """Static brand assets (the og:image social preview card, future icons).

    Link-preview crawlers fetch these anonymously, so they must be reachable
    without any app state.
    """
    return send_from_directory(os.path.join(APP_DIR, "assets"), filename)


# SEO discovery files. These are declared as EXACT routes on purpose: APP_DIR also
# holds .env and studyboost.db, so a catch-all root route would expose secrets.
# Trust pages. Clean URLs, one explicit route each — again deliberately not a
# catch-all, so nothing outside pages/ can ever be reached.
@app.route("/privacy")
def privacy_page():
    return send_from_directory(os.path.join(APP_DIR, "pages"), "privacy.html")


@app.route("/terms")
def terms_page():
    return send_from_directory(os.path.join(APP_DIR, "pages"), "terms.html")


@app.route("/about")
def about_page():
    return send_from_directory(os.path.join(APP_DIR, "pages"), "about.html")


@app.route("/robots.txt")
def robots_txt():
    return send_from_directory(APP_DIR, "robots.txt", mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    return send_from_directory(APP_DIR, "sitemap.xml", mimetype="application/xml")


@app.route("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "openai_configured": bool(OPENAI_KEY),
            # Similar-question practice: AI for any course when a key is set; the
            # built-in generator covers these AP Calculus skills with or without one.
            "variants": {"ai": bool(OPENAI_KEY), "builtInSkills": sorted(vt.SKILLS)},
        }
    )


@app.route("/api/attempt", methods=["POST"])
def record_attempt():
    if _rate_limited(_client_ip(), _attempt_rate_history, ATTEMPT_RATE_LIMIT_PER_MIN):
        return jsonify({"error": "Rate limit exceeded. Try again in about a minute."}), 429

    body = request.get_json(silent=True) or {}
    subject = (str(body.get("subject") or "Uncategorized")).strip()[:120] or "Uncategorized"
    qtype = (str(body.get("type") or "Unknown")).strip()[:60] or "Unknown"
    correct = 1 if body.get("correct") else 0

    ts = str(body.get("ts") or "").strip()
    if not _valid_iso(ts):
        ts = datetime.now(timezone.utc).isoformat()

    # Beta instrumentation (both optional; absent on legacy/offline-queue payloads).
    user_id = (str(body.get("userId") or "").strip()[:64]) or None
    source = body.get("source")
    # whitelist: a new question, a scheduled review of a saved mistake, or a similar
    # ("variant") question generated from a saved mistake
    source = source if source in ("review", "generated", "variant") else None

    try:
        with closing(_db()) as conn:
            conn.execute(
                "INSERT INTO attempts (subject, qtype, correct, created_at, user_id, source) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (subject, qtype, correct, ts, user_id, source),
            )
            conn.commit()
    except Exception as e:  # noqa: BLE001
        print("[StudyBoost ERROR] attempt insert", repr(e), file=sys.stderr)
        return jsonify({"error": "Could not store attempt"}), 500

    return jsonify({"ok": True})


@app.route("/api/stats")
def stats():
    # Progress is per-user: scope to the caller's anonymous userId. No userId =>
    # empty stats (Progress has no identity to report). Matches the trim/length
    # rules used when storing attempts.
    user_id = (str(request.args.get("userId") or "").strip()[:64]) or None
    try:
        with closing(_db()) as conn:
            if user_id is None:
                rows = []
            else:
                rows = conn.execute(
                    "SELECT subject, qtype, correct, created_at, source FROM attempts WHERE user_id = ?",
                    (user_id,),
                ).fetchall()
    except Exception as e:  # noqa: BLE001
        print("[StudyBoost ERROR] stats query", repr(e), file=sys.stderr)
        return jsonify({"error": "Could not read stats"}), 500

    total = len(rows)
    correct_total = sum(int(r["correct"]) for r in rows)

    by_subject_map: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})
    by_day_map: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})
    by_source_map: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})
    for r in rows:
        src = by_source_map[r["source"] if r["source"] in ("generated", "review", "variant") else "other"]
        src["answered"] += 1
        src["correct"] += int(r["correct"])
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

    # Practice type split: new questions vs. scheduled reviews vs. similar questions.
    by_source = [
        {
            "source": name,
            "answered": by_source_map[name]["answered"],
            "correct": by_source_map[name]["correct"],
            "accuracy": (by_source_map[name]["correct"] / by_source_map[name]["answered"])
            if by_source_map[name]["answered"] else 0,
        }
        for name in ("generated", "review", "variant", "other")
        if by_source_map.get(name, {}).get("answered")
    ]

    # Use UTC to match created_at (stored in UTC); date.today() is server-local
    # and would drop "today" from the window when local date < UTC date.
    today = datetime.now(timezone.utc).date()
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
            "bySource": by_source,
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
    json_mode = bool(body.get("json"))

    if not model:
        return jsonify({"error": "Missing model"}), 400
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Missing messages"}), 400

    ip = _client_ip()
    if _rate_limited(ip, _rate_history, RATE_LIMIT_PER_MIN):
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
        content = _openai_chat(model, messages, json_mode=json_mode)
        return jsonify({"content": content})
    except RuntimeError as e:
        print("[StudyBoost ERROR]", model, str(e), file=sys.stderr)
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print("[StudyBoost ERROR]", model, repr(e), file=sys.stderr)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    # HOST stays loopback-only by default; deployment platforms set HOST=0.0.0.0.
    host = os.environ.get("HOST", "127.0.0.1")
    print("StudyBoost AI proxy — http://%s:%s/" % (host, port), file=sys.stderr)
    app.run(host=host, port=port, debug=False)
