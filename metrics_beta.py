"""Beta metrics for StudyBoost — read-only learning-outcome report.

Run on the demo server (PythonAnywhere Bash console) where the SQLite DB lives,
or download studyboost.db and run locally:

    python metrics_beta.py
    python metrics_beta.py --since 2026-09-01 --until 2026-10-15

Excludes synthetic and legacy rows: user_id IS NULL (pre-instrumentation /
offline-queue rows) and user_id = 'demo-seed' (Progress seed data) are never
counted. Use --since/--until to isolate a beta cohort window from random demo
visitors (both have real u-* ids; only the date range separates them).

Stdlib only; opens the database read-only and never writes.
"""

import argparse
import os
import sqlite3
import sys

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("STUDYBOOST_DB") or os.path.join(APP_DIR, "studyboost.db")

EXCLUDE = "(user_id IS NOT NULL AND user_id != 'demo-seed')"


def _pct(correct, total):
    return (100.0 * correct / total) if total else 0.0


def main():
    ap = argparse.ArgumentParser(description="StudyBoost beta metrics (read-only).")
    ap.add_argument("--since", help="ISO date lower bound, inclusive (e.g. 2026-09-01)")
    ap.add_argument("--until", help="ISO date upper bound, inclusive (e.g. 2026-10-15)")
    args = ap.parse_args()

    if not os.path.exists(DB_PATH):
        print("Database not found:", DB_PATH, file=sys.stderr)
        return 1

    where = [EXCLUDE]
    params = []
    if args.since:
        where.append("created_at >= ?")
        params.append(args.since)
    if args.until:
        where.append("created_at <= ?")
        params.append(args.until + "T23:59:59+00:00")
    clause = " AND ".join(where)

    conn = sqlite3.connect("file:%s?mode=ro" % DB_PATH, uri=True)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT user_id, source, correct, created_at FROM attempts WHERE " + clause,
        params,
    ).fetchall()
    conn.close()

    total = len(rows)
    if not total:
        print("No real beta attempts in range (excluding seed/legacy rows).")
        return 0

    users = {r["user_id"] for r in rows}
    review = [r for r in rows if r["source"] == "review"]
    generated = [r for r in rows if r["source"] == "generated"]
    review_correct = sum(int(r["correct"]) for r in review)
    gen_correct = sum(int(r["correct"]) for r in generated)

    # Per-user activity and retention (>=2 distinct active days).
    per_user_days = {}
    per_user_count = {}
    for r in rows:
        per_user_days.setdefault(r["user_id"], set()).add((r["created_at"] or "")[:10])
        per_user_count[r["user_id"]] = per_user_count.get(r["user_id"], 0) + 1
    retained = sum(1 for d in per_user_days.values() if len(d) >= 2)
    counts = sorted(per_user_count.values())
    median = counts[len(counts) // 2] if counts else 0

    window = (args.since or "start") + " .. " + (args.until or "now")
    print("=== StudyBoost beta metrics (%s) ===" % window)
    print("Real attempts (excl. seed/legacy): %d" % total)
    print("Unique users:                      %d" % len(users))
    print("Retained users (>=2 active days):  %d" % retained)
    print("Median attempts per user:          %d" % median)
    print()
    print("** Review Recovery Rate **")
    print("  Attempts on questions scheduled for review (Mistake Log): %d" % len(review))
    print("  Answered correctly after scheduled review:                %d (%.1f%%)"
          % (review_correct, _pct(review_correct, len(review))))
    print()
    print("Baseline — newly generated questions (first-attempt level):")
    print("  Generated attempts: %d, correct: %d (%.1f%%)"
          % (len(generated), gen_correct, _pct(gen_correct, len(generated))))
    print()
    print("Note: attempt-level rates (a question reviewed N times = N rows). "
          "Short answers are self-graded. Outcome metrics, not a controlled trial.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
