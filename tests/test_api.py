"""Tests for the StudyBoost AI attempt/stats API."""

from datetime import datetime, timezone

import server


def _attempt(client, subject="AP Biology", qtype="Multiple Choice", correct=True, ts=None):
    body = {"subject": subject, "type": qtype, "correct": correct}
    if ts is not None:
        body["ts"] = ts
    return client.post("/api/attempt", json=body)


def test_attempt_then_stats_aggregates(client):
    _attempt(client, correct=True)
    _attempt(client, correct=False)

    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["overall"]["answered"] == 2
    assert data["overall"]["correct"] == 1
    assert abs(data["overall"]["accuracy"] - 0.5) < 1e-9


def test_stats_by_subject_split(client):
    _attempt(client, subject="AP Biology", correct=True)
    _attempt(client, subject="AP Biology", correct=True)
    _attempt(client, subject="AP Calculus AB", correct=False)

    data = client.get("/api/stats").get_json()
    by_subject = {row["subject"]: row for row in data["bySubject"]}

    assert by_subject["AP Biology"]["answered"] == 2
    assert by_subject["AP Biology"]["correct"] == 2
    assert by_subject["AP Calculus AB"]["answered"] == 1
    assert by_subject["AP Calculus AB"]["correct"] == 0


def test_today_utc_attempt_appears_in_daily_window(client):
    """Regression test for the timezone off-by-one bug.

    created_at is stored in UTC. The 14-day window must also be UTC, otherwise
    an attempt made "today" (UTC) is dropped when the server's local date is
    behind UTC. This test fails against the old date.today() implementation.
    """
    now_utc = datetime.now(timezone.utc).isoformat()
    _attempt(client, correct=True, ts=now_utc)

    data = client.get("/api/stats").get_json()
    today_utc = datetime.now(timezone.utc).date().isoformat()

    assert len(data["daily"]) == 14
    last_day = data["daily"][-1]
    assert last_day["date"] == today_utc
    assert last_day["answered"] == 1
    assert last_day["correct"] == 1


def test_empty_stats(client):
    data = client.get("/api/stats").get_json()
    assert data["overall"]["answered"] == 0
    assert data["bySubject"] == []
    assert len(data["daily"]) == 14
    assert all(day["answered"] == 0 for day in data["daily"])


def test_attempt_defaults_for_missing_fields(client):
    # Missing subject/type should fall back to safe defaults, not crash.
    resp = client.post("/api/attempt", json={"correct": True})
    assert resp.status_code == 200

    data = client.get("/api/stats").get_json()
    assert data["overall"]["answered"] == 1
    assert data["bySubject"][0]["subject"] == "Uncategorized"


def test_chat_forwards_json_mode(client, monkeypatch):
    # When the client asks for json mode, chat_proxy must pass it to _openai_chat.
    captured = {}

    def fake_openai_chat(model, messages, json_mode=False):
        captured["json_mode"] = json_mode
        return '{"ok": true}'

    monkeypatch.setattr(server, "_openai_chat", fake_openai_chat)
    monkeypatch.setattr(server, "OPENAI_KEY", "test-key")
    server._rate_history.clear()

    resp = client.post(
        "/api/chat",
        json={"model": "m", "messages": [{"role": "user", "content": "hi"}], "json": True},
    )
    assert resp.status_code == 200
    assert captured["json_mode"] is True


def test_chat_no_json_mode_by_default(client, monkeypatch):
    captured = {}

    def fake_openai_chat(model, messages, json_mode=False):
        captured["json_mode"] = json_mode
        return "{}"

    monkeypatch.setattr(server, "_openai_chat", fake_openai_chat)
    monkeypatch.setattr(server, "OPENAI_KEY", "test-key")
    server._rate_history.clear()

    resp = client.post(
        "/api/chat",
        json={"model": "m", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 200
    assert captured["json_mode"] is False


def test_attempt_rate_limited(client, monkeypatch):
    # With a small per-minute limit, the (limit+1)th attempt should be rejected.
    monkeypatch.setattr(server, "ATTEMPT_RATE_LIMIT_PER_MIN", 3)
    server._attempt_rate_history.clear()

    for _ in range(3):
        assert _attempt(client).status_code == 200

    blocked = _attempt(client)
    assert blocked.status_code == 429

    # Stored attempts should be only the 3 that were accepted.
    data = client.get("/api/stats").get_json()
    assert data["overall"]["answered"] == 3
