"""Reset the PUBLIC DEMO database: wipe all attempts, then re-seed synthetic data.

Intended for the demo instance only (e.g. a PythonAnywhere daily scheduled task):

    DEMO_SEED=1 python reset_demo.py

Safety: refuses to run unless DEMO_SEED=1 is set in the environment, so it can
never wipe a local development database by accident.
"""

import os
import sys

if os.environ.get("DEMO_SEED") != "1":
    print("Refusing to run: set DEMO_SEED=1 (demo instances only).", file=sys.stderr)
    sys.exit(1)

from contextlib import closing  # noqa: E402

import server  # noqa: E402  (import runs _init_db + seed-if-empty)

with closing(server._db()) as conn:
    deleted = conn.execute("DELETE FROM attempts").rowcount
    conn.commit()

server._seed_demo_attempts_if_needed()

with closing(server._db()) as conn:
    count = conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]

print("Demo DB reset: removed %d rows, re-seeded %d synthetic attempts." % (deleted, count))
