"""
Pytest fixtures for StudyBoost AI.

Point the app at a throwaway SQLite file *before* importing the server module,
so tests never read from or write to the real studyboost.db.
"""

import os
import tempfile

import pytest

_TEST_DB = os.path.join(tempfile.gettempdir(), "studyboost_test.db")
os.environ["STUDYBOOST_DB"] = _TEST_DB

import server  # noqa: E402  (import after env var is set on purpose)


@pytest.fixture
def client():
    # Fresh, empty database for every test.
    if os.path.exists(_TEST_DB):
        os.remove(_TEST_DB)
    server._init_db()
    server.app.config["TESTING"] = True
    with server.app.test_client() as test_client:
        yield test_client
