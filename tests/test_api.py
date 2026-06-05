"""Tests for the StudyBoost AI attempt/stats API."""

from datetime import datetime, timezone


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
