"""Tests for the StudyBoost AI attempt/stats API."""

from datetime import datetime, timezone

import server


# Default test user — attempts and the matching stats query share this id, since
# Progress is now scoped per anonymous user.
_USER = "u-test"


def _attempt(client, subject="AP Biology", qtype="Multiple Choice", correct=True, ts=None, user=_USER):
    body = {"subject": subject, "type": qtype, "correct": correct}
    if ts is not None:
        body["ts"] = ts
    if user is not None:
        body["userId"] = user
    return client.post("/api/attempt", json=body)


def _stats(client, user=_USER):
    url = "/api/stats" + ("?userId=" + user if user is not None else "")
    return client.get(url).get_json()


def test_attempt_then_stats_aggregates(client):
    _attempt(client, correct=True)
    _attempt(client, correct=False)

    data = _stats(client)
    assert data["overall"]["answered"] == 2
    assert data["overall"]["correct"] == 1
    assert abs(data["overall"]["accuracy"] - 0.5) < 1e-9


def test_stats_by_subject_split(client):
    _attempt(client, subject="AP Biology", correct=True)
    _attempt(client, subject="AP Biology", correct=True)
    _attempt(client, subject="AP Calculus AB", correct=False)

    by_subject = {row["subject"]: row for row in _stats(client)["bySubject"]}

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

    data = _stats(client)
    today_utc = datetime.now(timezone.utc).date().isoformat()

    assert len(data["daily"]) == 14
    last_day = data["daily"][-1]
    assert last_day["date"] == today_utc
    assert last_day["answered"] == 1
    assert last_day["correct"] == 1


def test_empty_stats(client):
    data = _stats(client)  # user with no attempts
    assert data["overall"]["answered"] == 0
    assert data["bySubject"] == []
    assert len(data["daily"]) == 14
    assert all(day["answered"] == 0 for day in data["daily"])


def test_stats_scoped_per_user(client):
    # Each user sees only their own attempts; others/legacy/seed are excluded.
    _attempt(client, user="u-A", correct=True)
    _attempt(client, user="u-A", correct=True)
    _attempt(client, user="u-B", correct=False)
    client.post("/api/attempt", json={"subject": "AP Biology", "type": "MC", "correct": True})  # legacy NULL user

    a = _stats(client, "u-A")
    assert a["overall"]["answered"] == 2 and a["overall"]["correct"] == 2
    b = _stats(client, "u-B")
    assert b["overall"]["answered"] == 1 and b["overall"]["correct"] == 0


def test_stats_without_userid_is_empty(client):
    # No userId => no identity => empty Progress, even when rows exist.
    _attempt(client, user="u-A", correct=True)
    data = _stats(client, user=None)  # GET /api/stats with no query
    assert data["overall"]["answered"] == 0
    assert data["bySubject"] == []


def test_attempt_defaults_for_missing_fields(client):
    # Missing subject/type should fall back to safe defaults, not crash.
    resp = client.post("/api/attempt", json={"correct": True, "userId": _USER})
    assert resp.status_code == 200

    data = _stats(client)
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


def _last_row(client):
    import server as _s
    from contextlib import closing as _closing
    with _closing(_s._db()) as conn:
        return conn.execute(
            "SELECT user_id, source FROM attempts ORDER BY id DESC LIMIT 1"
        ).fetchone()


def test_attempt_stores_userid_and_source(client):
    resp = client.post(
        "/api/attempt",
        json={"subject": "AP Biology", "type": "Multiple Choice", "correct": True,
              "userId": "u-abc123", "source": "review"},
    )
    assert resp.status_code == 200
    row = _last_row(client)
    assert row["user_id"] == "u-abc123"
    assert row["source"] == "review"


def test_attempt_without_new_fields_still_works(client):
    # Legacy / offline-queue payload (only the original 4 fields) must still 200,
    # with the new columns left NULL.
    resp = client.post(
        "/api/attempt",
        json={"subject": "AP Biology", "type": "Short Answer", "correct": False},
    )
    assert resp.status_code == 200
    row = _last_row(client)
    assert row["user_id"] is None
    assert row["source"] is None


def test_attempt_rejects_unknown_source(client):
    # An out-of-whitelist source is stored as NULL, not persisted verbatim.
    resp = client.post(
        "/api/attempt",
        json={"subject": "AP Biology", "type": "Multiple Choice", "correct": True,
              "userId": "u-x", "source": "hacker"},
    )
    assert resp.status_code == 200
    assert _last_row(client)["source"] is None


def test_init_db_is_idempotent(client):
    # Running the migration twice must not raise or duplicate columns.
    import server as _s
    _s._init_db()
    _s._init_db()
    from contextlib import closing as _closing
    with _closing(_s._db()) as conn:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(attempts)")}
    assert {"user_id", "source"}.issubset(cols)


def _seed_count(user="demo-seed"):
    from contextlib import closing as _closing
    with _closing(server._db()) as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM attempts WHERE user_id = ?", (user,)
        ).fetchone()[0]


def test_demo_seed_populates_empty_db(client, monkeypatch):
    # DEMO_SEED=1 + empty table -> synthetic attempts inserted, tagged demo-seed.
    # (Counted via DB, not /api/stats: seed rows are not in any per-user view.)
    monkeypatch.setenv("DEMO_SEED", "1")
    server._seed_demo_attempts_if_needed()

    seeded = _seed_count()
    assert seeded > 0
    from contextlib import closing as _closing
    with _closing(server._db()) as conn:
        subjects = conn.execute(
            "SELECT COUNT(DISTINCT subject) FROM attempts WHERE user_id = 'demo-seed'"
        ).fetchone()[0]
    assert subjects >= 3

    # Idempotent: a second call must not add more rows.
    server._seed_demo_attempts_if_needed()
    assert _seed_count() == seeded


def test_no_seed_without_env(client, monkeypatch):
    # Without DEMO_SEED, an empty database stays empty (local behavior unchanged).
    monkeypatch.delenv("DEMO_SEED", raising=False)
    server._seed_demo_attempts_if_needed()
    assert _seed_count() == 0


def test_attempt_rate_limited(client, monkeypatch):
    # With a small per-minute limit, the (limit+1)th attempt should be rejected.
    monkeypatch.setattr(server, "ATTEMPT_RATE_LIMIT_PER_MIN", 3)
    server._attempt_rate_history.clear()

    for _ in range(3):
        assert _attempt(client).status_code == 200

    blocked = _attempt(client)
    assert blocked.status_code == 429

    # Stored attempts should be only the 3 that were accepted.
    data = _stats(client)
    assert data["overall"]["answered"] == 3
