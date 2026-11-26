"""Integration tests for /api/variants and the related attempts/stats/DB changes."""

import json
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone

import pytest
import requests

import server
from tests.test_variant_engine import ANALYSIS, BIO_RAW, MISTAKE_RAW, v_exp, v_sin


@pytest.fixture(autouse=True)
def _reset_limits():
    server._variant_rate_history.clear()
    server._variant_builtin_rate_history.clear()
    server._attempt_rate_history.clear()
    yield


def post(client, mistake=None, **body):
    payload = {"mistake": mistake or MISTAKE_RAW, "count": 2, "userId": "u-var"}
    payload.update(body)
    return client.post("/api/variants", json=payload)


class FakeResponse:
    def __init__(self, status=200, body=None, headers=None, text=""):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.text = text or (json.dumps(body) if body is not None else "")

    @property
    def ok(self):
        return 200 <= self.status_code < 300

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


def completion(content_obj):
    return FakeResponse(200, {
        "choices": [{"message": {"content": json.dumps(content_obj)}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 812, "completion_tokens": 640},
    })


@pytest.fixture
def ai(monkeypatch):
    """Configure a key and script the provider's HTTP responses."""
    calls = []
    script = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        r = script.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(server, "OPENAI_KEY", "sk-test-secret")
    monkeypatch.setattr(server.requests, "post", fake_post)
    return {"calls": calls, "script": script}


def log_rows():
    with closing(server._db()) as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM ai_generation_log ORDER BY id")]


# --- without a key ---------------------------------------------------------------------------

def test_no_key_calculus_uses_the_built_in_generator(client, monkeypatch):
    monkeypatch.setattr(server, "OPENAI_KEY", "")
    resp = post(client)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["generator"] == "template" and len(data["variants"]) == 2
    assert data["level"] == "medium" and data["relation"] == "same"
    assert "meta" not in data
    v = data["variants"][0]
    assert v["answer"] in v["options"] and v["verification"]["status"] == "verified"
    row = log_rows()[-1]
    assert row["generator"] == "template" and row["llm_calls"] == 0 and row["accepted"] == 2 and row["verified"] == 2


def test_no_key_biology_is_an_honest_503_with_analysis(client, monkeypatch):
    monkeypatch.setattr(server, "OPENAI_KEY", "")
    resp = post(client, BIO_RAW)
    assert resp.status_code == 503
    data = resp.get_json()
    assert data["code"] == "no_generator" and "AI connection" in data["error"]
    assert data["analysis"]["coreConcept"] == "Enzymes"
    assert log_rows()[-1]["error_code"] == "no_generator"


@pytest.mark.parametrize("payload, status", [
    ({"mistake": {"answer": "x"}}, 400),
    ({"mistake": "nope"}, 400),
    ({}, 400),
])
def test_bad_input(client, payload, status):
    resp = client.post("/api/variants", json=payload)
    assert resp.status_code == status and resp.get_json()["code"] == "bad_input"


def test_non_json_and_oversized_bodies(client):
    assert client.post("/api/variants", data="hello", content_type="text/plain").status_code == 400
    big = {"mistake": dict(MISTAKE_RAW, question="q" * 70000)}
    assert client.post("/api/variants", json=big).status_code == 413


def test_endpoint_rate_limit_for_the_built_in_generator(client, monkeypatch):
    monkeypatch.setattr(server, "OPENAI_KEY", "")
    monkeypatch.setattr(server, "VARIANT_BUILTIN_RATE_LIMIT_PER_MIN", 2)
    assert post(client).status_code == 200
    assert post(client).status_code == 200
    blocked = post(client)
    assert blocked.status_code == 429 and blocked.headers["Retry-After"] == "60"
    assert blocked.get_json()["code"] == "too_many_requests"     # ours, not the AI provider's


def test_ai_requests_have_their_own_tighter_bucket(client, ai, monkeypatch):
    monkeypatch.setattr(server, "VARIANT_RATE_LIMIT_PER_MIN", 1)
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    assert post(client).status_code == 200
    blocked = post(client)
    assert blocked.status_code == 429 and blocked.get_json()["code"] == "too_many_requests"
    assert len(ai["calls"]) == 1


# --- with a (mocked) AI provider ---------------------------------------------------------------

def test_ai_success_end_to_end(client, ai):
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    resp = post(client, model="llama-3.3-70b-versatile")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["generator"] == "ai" and len(data["variants"]) == 2
    assert data["analysis"]["diagnosis"]["grounded"] is True
    sent = ai["calls"][0]
    assert sent["url"].endswith("/chat/completions")
    assert sent["json"]["response_format"] == {"type": "json_object"}
    assert sent["json"]["max_tokens"] <= 2200 and sent["json"]["model"] == "llama-3.3-70b-versatile"
    assert sent["headers"]["Authorization"] == "Bearer sk-test-secret"
    assert "sk-test-secret" not in resp.get_data(as_text=True)
    row = log_rows()[-1]
    assert row["generator"] == "ai" and row["outcome"] == "ok" and row["llm_calls"] == 1
    assert row["prompt_tokens"] == 812 and row["completion_tokens"] == 640 and row["verified"] == 2


def test_no_question_text_is_ever_stored(client, ai):
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    assert post(client).status_code == 200
    with closing(server._db()) as conn:
        dump = "\n".join(conn.iterdump())
    for secret in ("(3x + 1)^4", "4(3x+1)^3", "inner derivative", "sin(3x^2)", "Chain rule for composite"):
        assert secret not in dump


def test_wrong_key_is_repaired_with_a_second_call(client, ai):
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(correct_option=1), v_exp()]}))
    ai["script"].append(completion({"variants": [v_sin(question="Differentiate $y = {{expr}}$ with respect to $x$.")]}))
    data = post(client).get_json()
    assert len(ai["calls"]) == 2 and len(data["variants"]) == 2
    row = log_rows()[-1]
    assert row["outcome"] == "repaired" and row["rejected"] == 1
    assert json.loads(row["rejection_reasons"]) == {"answer_key_wrong": 1}


def test_provider_rate_limit_reports_retry_after(client, ai):
    ai["script"].append(FakeResponse(429, {"error": "slow down"}, headers={"retry-after": "30"}))
    resp = post(client, BIO_RAW)
    assert resp.status_code == 429
    assert resp.headers["Retry-After"] == "30" and resp.get_json()["retryAfter"] == 30
    assert resp.get_json()["code"] == "rate_limited"


def test_short_rate_limit_waits_and_retries_once(client, ai, monkeypatch):
    slept = []
    monkeypatch.setattr(server.time, "sleep", lambda s: slept.append(s))
    ai["script"].append(FakeResponse(429, {}, headers={"x-ratelimit-reset-requests": "1.2s"}))
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    resp = post(client)
    assert resp.status_code == 200 and slept == [1.2] and len(ai["calls"]) == 2


def test_provider_rate_limit_on_calculus_falls_back_with_notice(client, ai):
    ai["script"].append(FakeResponse(429, {}, headers={"retry-after": "30"}))
    data = post(client).get_json()
    assert data["generator"] == "template" and "rate-limiting" in data["notice"]
    assert log_rows()[-1]["outcome"] == "fallback"


@pytest.mark.parametrize("failure, status, code", [
    (requests.Timeout("slow"), 504, "timeout"),
    (requests.ConnectionError("down"), 502, "upstream_error"),
    (FakeResponse(401, {"error": "bad key"}), 502, "auth_error"),
    (FakeResponse(404, {"error": "model not found"}), 502, "bad_request"),
    (FakeResponse(500, {"error": "oops"}), 502, "upstream_error"),
    (FakeResponse(200, {"choices": []}), 502, "bad_response"),
])
def test_provider_failures_map_to_clear_codes(client, ai, failure, status, code):
    ai["script"].append(failure)
    resp = post(client, BIO_RAW)
    assert resp.status_code == status and resp.get_json()["code"] == code
    assert "oops" not in resp.get_data(as_text=True) and "bad key" not in resp.get_data(as_text=True)


def test_invalid_output_twice_is_502_for_non_calculus(client, ai):
    junk = FakeResponse(200, {"choices": [{"message": {"content": "not json at all"}}]})
    ai["script"].extend([junk, FakeResponse(200, {"choices": [{"message": {"content": "{}"}}]})])
    resp = post(client, BIO_RAW)
    assert resp.status_code == 502 and resp.get_json()["code"] == "invalid_output"
    assert log_rows()[-1]["llm_calls"] == 2


def test_daily_quota_switches_to_built_in_or_429(client, ai, monkeypatch):
    monkeypatch.setattr(server, "VARIANT_DAILY_LIMIT", 2)
    now = datetime.now(timezone.utc).isoformat()
    with closing(server._db()) as conn:
        for _ in range(2):
            conn.execute("INSERT INTO ai_generation_log (created_at, user_id, kind, generator, outcome, llm_calls, "
                         "prompt_tokens, completion_tokens) VALUES (?, 'u-var', 'variant', 'ai', 'ok', 1, 800, 600)", (now,))
        conn.commit()
    data = post(client).get_json()                 # calculus: built-in generator, no AI call
    assert data["generator"] == "template" and "today's AI" in data["notice"] and ai["calls"] == []
    resp = post(client, BIO_RAW)                   # biology: nothing to fall back on
    assert resp.status_code == 429 and resp.get_json()["code"] == "daily_limit"
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    other_user = post(client, userId="u-other")    # the quota is per user
    assert other_user.status_code == 200 and other_user.get_json()["generator"] == "ai"
    assert len(ai["calls"]) == 1


def test_internal_errors_are_not_blamed_on_the_provider(client, monkeypatch):
    monkeypatch.setattr(server, "OPENAI_KEY", "")

    def boom(*args, **kwargs):
        raise KeyError("bug")

    monkeypatch.setattr(server.ve, "generate_variants", boom)
    resp = post(client)
    assert resp.status_code == 500 and resp.get_json()["code"] == "server_error"


def test_body_size_cap_applies_to_every_endpoint(client):
    huge = "x" * (3 * 1024 * 1024)
    assert client.post("/api/attempt", data=huge, content_type="application/json").status_code == 413


def test_rejected_provider_calls_do_not_use_up_the_daily_quota(client, ai, monkeypatch):
    monkeypatch.setattr(server, "VARIANT_DAILY_LIMIT", 1)
    ai["script"].append(FakeResponse(429, {}, headers={"retry-after": "30"}))
    assert post(client, BIO_RAW).status_code == 429          # provider said no: no tokens spent
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    assert post(client).get_json()["generator"] == "ai"       # still allowed


def test_retry_after_zero_is_honoured(client, ai, monkeypatch):
    slept = []
    monkeypatch.setattr(server.time, "sleep", lambda s: slept.append(s))
    ai["script"].append(FakeResponse(429, {}, headers={"retry-after": "0", "x-ratelimit-reset-requests": "9s"}))
    ai["script"].append(completion({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    assert post(client).status_code == 200 and slept == [0.0]


def test_health_reports_variant_capabilities(client, monkeypatch):
    monkeypatch.setattr(server, "OPENAI_KEY", "")
    data = client.get("/api/health").get_json()
    assert data["variants"]["ai"] is False and "chain-rule" in data["variants"]["builtInSkills"]


# --- attempts and stats -------------------------------------------------------------------------

def test_variant_attempts_are_recorded_and_split_by_source(client):
    for source, correct in [("generated", True), ("generated", False), ("review", True),
                            ("variant", True), ("variant", True), ("variant", False)]:
        client.post("/api/attempt", json={"subject": "AP Calculus AB", "type": "Multiple Choice",
                                          "correct": correct, "userId": "u-src", "source": source})
    data = client.get("/api/stats?userId=u-src").get_json()
    by = {row["source"]: row for row in data["bySource"]}
    assert by["generated"]["answered"] == 2 and by["review"]["answered"] == 1
    assert by["variant"]["answered"] == 3 and by["variant"]["correct"] == 2
    assert abs(by["variant"]["accuracy"] - 2 / 3) < 1e-9
    assert data["overall"]["answered"] == 6


def test_legacy_database_migrates_without_losing_rows(monkeypatch):
    path = os.path.join(tempfile.gettempdir(), "studyboost_legacy_test.db")
    if os.path.exists(path):
        os.remove(path)
    with closing(sqlite3.connect(path)) as conn:
        conn.execute("CREATE TABLE attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, "
                     "qtype TEXT NOT NULL, correct INTEGER NOT NULL, created_at TEXT NOT NULL)")
        conn.execute("INSERT INTO attempts (subject, qtype, correct, created_at) VALUES ('AP Biology', 'MC', 1, '2026-06-01')")
        conn.commit()
    monkeypatch.setattr(server, "DB_PATH", path)
    server._init_db()
    server._init_db()  # idempotent
    with closing(server._db()) as conn:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(attempts)")}
        tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        old = conn.execute("SELECT subject, correct, user_id, source FROM attempts").fetchall()
    assert {"user_id", "source", "event_id"} <= cols and "ai_generation_log" in tables
    assert [tuple(r) for r in old] == [("AP Biology", 1, None, None)]
    server.app.config["TESTING"] = True
    with server.app.test_client() as c:
        assert c.post("/api/attempt", json={"subject": "S", "type": "MC", "correct": True,
                                            "userId": "u-1", "source": "variant"}).status_code == 200
        assert c.get("/api/stats?userId=u-1").get_json()["bySource"][0]["source"] == "variant"
    os.remove(path)


def test_parse_duration():
    assert server._parse_duration("12") == 12
    assert server._parse_duration("2m59.5s") == pytest.approx(179.5)
    assert server._parse_duration("750ms") == pytest.approx(0.75)
    assert server._parse_duration(None) is None and server._parse_duration("soon") is None
