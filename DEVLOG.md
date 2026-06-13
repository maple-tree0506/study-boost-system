# Development Log — StudyBoost AI

A running record of what I built, the bugs I hit, and the decisions I made.
Newest entries first.

> Note on history: development began as a single-file prototype around February 2026.
> I adopted Git version control in June 2026, so commits before that date are not in
> the history; the entries below reconstruct the earlier work honestly. I use AI tools
> to assist (commits are marked with a Co-Authored-By trailer), but the architecture,
> decisions, and debugging direction are mine.

---

## 2026-06 — Learning-data export / import (browser-loss guard)
**Why:** beta runs on students' phones; iOS Safari evicts localStorage after ~7 days of
non-visit and clearing site data wipes everything. A "Download my data / Restore from file"
pair in the Setup panel lets a student back up and recover their mistake log + topic mastery.
**What I did:** `exportUserData()` writes a versioned JSON (`type:"studyboost-backup"`,
`version:1`) of the durable keys — mistakes (`studyBoostMistakesV2`), mastery
(`studyBoostMasteryV1`), the anonymous id (`studyBoostUserIdV1`), and UI prefs; `importUserData()`
validates type/version, confirms, then writes back and re-hydrates in-memory state +
re-renders. Pure client, no server, no new deps.
**Decisions:** (1) **Replace, not merge** on import — merging SM-2 schedules / mastery EMAs would
need conflict rules and is error-prone; replace is predictable and matches the "restore lost data"
use case, guarded by a confirm dialog and "this device" wording. (2) **Include the anonymous
userId** so a restore on a new device stays the same beta user (metrics don't split one student
into two). (3) **Exclude** the offline attempt queue (re-importing would double-submit attempts
and pollute metrics) and the AI-reliability counters (local diagnostics). DOM/localStorage-coupled,
so browser-verified (consistent with addErrorRecord/reviewMistake), no new unit tests.

## 2026-06 — Beta instrumentation + pre-registered metrics
**Why:** to run a 10–20 student beta and report *measurable* learning outcomes (for UC
application materials) instead of anecdotes. R1 already tags every practice item
`source: review|generated`, but `recordAttempt` dropped it at the API boundary. This adds
that tag plus an anonymous per-user dimension so outcomes can be grouped per student.
**What I did:**
- DB: additive, idempotent migration adds nullable `user_id`, `source` to `attempts`
  (verified on an old 4-column DB like the live instance). `/api/attempt` accepts optional
  `userId` (≤64 chars) and whitelisted `source` (else NULL). `/api/stats` and the Progress
  panel are unchanged.
- Frontend: `getOrCreateUserId()` = opaque `u-` + `crypto.randomUUID()` in localStorage
  (`studyBoostUserIdV1`), no PII; `recordAttempt` now sends `userId` + `source`.
- `metrics_beta.py` (read-only, stdlib, `--since/--until`): reports the metrics below,
  excluding `user_id IS NULL` (legacy/offline-queue) and `user_id='demo-seed'` (Progress seed).
**Pre-registered metrics (defined BEFORE collecting data, to avoid cherry-picking):**
- **Review Recovery Rate** (primary): correctness rate of attempts with `source='review'` —
  i.e. questions *scheduled for review from the Mistake Log*. Phrased deliberately, not
  "previously-missed", because a user can also add an item manually before answering it wrong.
- Baseline: `source='generated'` correctness = new-question first-attempt level (a reference
  point, NOT a control group / causal comparison).
- Unique users, retention (≥2 distinct active days), median attempts/user.
**Honest limits (PIQ wording must respect these):** rates are *attempt-level* (a question
reviewed N times contributes N rows, not "N mistakes cured"); short answers are self-graded;
no control group → these are *outcome* metrics. Use "answered correctly after scheduled
review", never "proves/causes". Public-demo visitors share the URL and also get `u-*` ids, so
isolate the beta cohort with `--since/--until` (date window is the only clean separator).
**Privacy:** anonymous opaque id only; no names/emails/PII; disclosed in README. Beta data
only lands in the deployed instance — locally-run copies don't reach `metrics_beta.py`.
**Ops note:** set `ATTEMPT_RATE_LIMIT_PER_MIN=240` in the PA WSGI env (rate limit is per-IP;
a class on shared school WiFi is one IP). This is PA config, not in git — re-add if the WSGI
file is recreated.

## 2026-06 — Public demo deployment (PythonAnywhere, keyless)
**Why:** README promised a reviewer-friendly deployed link; admissions reviewers won't run a
local server. Live at **https://studyboostai.pythonanywhere.com/**.
**Key decisions (and the honest trade-offs):**
- **No API key on the demo server.** Visitors can never spend my Groq quota, there's no AI
  output to moderate, and the per-IP rate limits can't be gamed into cost. The demo runs the
  offline path — which the app already treated as a first-class mode: the full adaptive loop
  (R1 injection, SM-2, topic mastery) works from the built-in 14-subject bank. AI summaries/
  generation are local-run features with your own key.
- **Platform: PythonAnywhere free tier** over Render free: always-on (no 30–60s cold start —
  measured ~0.5s page load), which matters more for a reviewer clicking a link than push-to-
  deploy automation. Updates are `cd ~/study-boost-system && git pull` + Reload in the Web tab.
- **Progress is seeded + shared.** `DEMO_SEED=1` populates an EMPTY attempts table with ~61
  deterministic synthetic records so first-time visitors see real charts (disclosed in README).
  All visitors share one SQLite, so Progress is global/mixed on the demo; each visitor's
  Mistake Log and Topic Mastery live in their own browser (localStorage) and are isolated.
  `reset_demo.py` (refuses to run without `DEMO_SEED=1`) wipes + re-seeds; note the WSGI
  import also auto-seeds an empty DB, so the reset script's re-seed is a no-op safety net.
- **Env-gated everything:** `HOST` (default 127.0.0.1 — local behavior unchanged), `DEMO_SEED`
  (off locally; pytest covers both on and off), `STUDYBOOST_DB` (reused from the test suite).
**PythonAnywhere config (archived for reproducibility):** Web tab → Manual configuration →
set *Source code* and *Working directory* to `/home/<user>/study-boost-system`; WSGI file:
```python
import os, sys
os.environ["DEMO_SEED"] = "1"
path = "/home/<user>/study-boost-system"
if path not in sys.path:
    sys.path.insert(0, path)
from server import app as application
```
Install deps in a Bash console: `pip3 install --user -r requirements.txt`. Optional daily
reset task: `DEMO_SEED=1 python3 ~/study-boost-system/reset_demo.py` (free-tier scheduled
tasks permitting; otherwise run it manually on occasion).
**Known limits (accepted):** in-memory rate limiting is fine on PA's single worker; the free
account needs a login every 3 months or the app is reclaimed; KaTeX still comes from a CDN
(now async, so it can't block first paint).

## 2026-06 — Micro-interactions, focus rings, accessible busy state
Presentation pass: button hover/press feedback, input/select/checkbox **keyboard focus rings**
(previously only the hero links had them — a real a11y gap, now closed), a soft reveal on the
details panels and freshly rendered cards, polished empty states, and a busy **spinner on the
generate buttons** driven by `aria-busy` set only on the generation paths (deliberately NOT in
`setAIControlsBusy`, which also runs during the startup health check — a `:disabled`-keyed
spinner would have spun there misleadingly). All new motion is ≤200ms and fully neutralized
under `prefers-reduced-motion`. No logic changes; 4 presentational lines in `app.js`.

## 2026-06 — Productization: hero + dashboard information architecture
**Why:** The app worked but read like a class project — it opened with developer setup
(`.env` / `server.py`), used worksheet-style numbered sections ("1)…5)"), and stacked
everything in one flat column. The goal was an academic-SaaS feel credible to AP students
and admissions reviewers, **without** touching any learning logic.
**What I did (presentation only — `index.html` + `css/styles.css`):**
- **Product hero**: a `StudyBoost` wordmark, a value-prop `<h1>` ("The adaptive study system
  for AP students."), credibility chips (adaptive practice · SM-2 · topic-mastery analytics ·
  offline practice bank), and a CTA that anchors to the first tool. The old developer-facing
  subtitle ("keys stay on the server") is gone from the first screen.
- **Dashboard IA**: grouped the five panels into three labeled clusters — **Create** (Summary +
  Practice), **Review** (Adaptive Mistake Review), **Insights** (Progress + Topic Mastery). The
  two analytics panels sit side-by-side in a responsive grid that goes 2-column at **≥1100px**
  and stacks below that (1100, not 1024, so Progress's stat-cards/trend keep room).
- **Heading outline fixed**: hero `<h1>` → group `<h2>` eyebrows → panel `<h3>` (titles demoted
  and de-numbered; ids unchanged so JS/anchors/`aria-labelledby` are unaffected).
- **Setup relocated**: the connection/model panel moved to the bottom as a quiet "Setup &
  connection" utility.
- System font stack (off Arial), subtle card shadow, `:focus-visible` rings, smooth scroll with
  a `prefers-reduced-motion` guard.
**Safety:** no `app.js`/module/test/server changes; every JS-referenced id preserved; DOM order =
visual order (grouping wrappers, no CSS reordering) so tab order is intact. R1/R2 behavior, AI
flows, SM-2, and mastery logic are untouched. Browser-verified across 360/768/1100/1280px.

## 2026-06 — R2: Topic-level mastery modeling
**Why:** Accuracy was only tracked at the *course* level (the 14 AP subjects). That's too
coarse to answer "which topics am I weak on?" — the question an adaptive system should answer.
R2 adds a per-topic mastery signal computed from real graded outcomes.
**What I did (staged, like R1):**
- **2A — pure model** (`js/mastery-model.js`, dual-export peer to the SR/planner modules):
  `normalizeTopicKey` (lowercase/trim/collapse; blank → subject-general bucket), `updateMastery`
  (immutable; attempts/correct counters + a recency-weighted accuracy EMA, α=0.4), `masteryLevel`
  (volume-gated new / developing / proficient / mastered — a high EMA alone never reads as mastered),
  `summarizeMastery` (topics + weakest, optional subject filter). 22 `node:test` cases; added to CI.
- **2B — feed:** `finalizeSet` stamps `topic`/`topicKey` on generated items; the planner carries them
  into resurfaced reviews; `recordAttempt` folds each outcome into the mastery map *after* the existing
  attempt/SQLite path (additive — can't affect grading); mistakes copy the question's own topic on
  capture (never the live input, same rule as the subject fix); persisted in `studyBoostMasteryV1`.
- **2C — read-only panel** ("5) Topic Mastery"): topics tracked / mastered / graded, a "focus next"
  list of the 3 weakest topics, and per-topic rows (level badge + accuracy + attempts), scoped to the
  selected course. Reuses the existing `.review-stats` / `.tag` patterns.
**Honest limitations (by design):** topic identity is the learner's *normalized free-text* topic —
casing/whitespace merge, but synonyms ("derivatives" vs "the derivative") stay distinct, and a blank
topic aggregates at the subject level. Topic mastery counts **practice quiz grading only** — the
Forgot/Hard/Got it ratings in Section 3 feed SM-2 scheduling, not topic mastery. Mastery lives in
localStorage for now; moving it server-side (with a topic column) is deferred to R3.
**R1 unchanged:** selection/injection/auto-capture behavior is identical; the planner only gained
additive `topic`/`topicKey` passthrough.

## 2026-06 — H-F: one SM-2 update per item per session
**Why:** A resurfaced mistake could be graded twice in one session — in practice
(`applyGradeOutcome → reviewMistake`) and again in Section 3 (Forgot/Hard/Got it) — applying two
conflicting SM-2 updates (e.g. "Got it" grows the interval, then "Forgot" resets it).
**Fix:** an in-memory `sessionReviewedErrIds` Set guards the single chokepoint `reviewMistake`:
first grade per item wins; a second grade is a no-op with a soft notice (no DB write / re-render).
Cleared when the mistake log is cleared. **Known leak:** the Set resets on page reload (acceptable);
a durable day-level dedup is deferred to R3 (review recency belongs in the unified event log, not
welded onto SR state now). Browser-verified (`sr.reviews` goes +1, not +2); DOM-coupled so no unit test.

## 2026-06 — Explanation layer (real remediation, no synthesis)
**Why:** Getting a question wrong only showed the *answer*, not *why*. Added an explanation that
surfaces precisely on incorrect responses — turning the mistake loop into remediation.
**What I did:**
- `explanation` is a real optional field. AI emits it (prompt: explain why correct + each
  distractor's misconception, do not repeat the answer); a dedupe filter blanks it if it just
  restates the answer or is < 20 chars (filtering, **not** synthesis).
- Offline explanations come only from an authored bank `e` field (deterministic). **No synthesis
  from the answer** — if there's no explanation, nothing is shown (not an answer restatement).
- Shown **only after an incorrect response** (MCQ `!ok`, SA self-wrong); hidden on correct.
  Answer-box heading split into "Answer" + a separate "Why" block.
- Stored with mistake records and carried into resurfaced reviews (folded `<details>Why</details>`
  to preserve active recall).
**Honest coverage gap:** none of the 364 offline bank items carry `e` yet, so offline wrong-answers
currently show no "why" until the bank is enriched (deferred; MCQ medium/challenge first). The AI
path provides explanations now.
**R1 unchanged:** selection/grading/auto-capture/due-injection behavior is identical; the planner
only gained an additive `explanation` passthrough.

## 2026-06 — Math rendering with KaTeX
**Why:** AP Calculus/Physics/Chemistry questions were plain ASCII (`x^2`, `integral from a to b`),
which read like a prototype. Added real LaTeX typesetting.
**What I did:**
- Load KaTeX (CDN) + auto-render; a `typesetMath(el)` helper renders `$...$` / `$$...$$` after
  every dynamic DOM update (quiz, summary, mistake review). Guarded so it degrades to raw text if
  KaTeX or the CDN is unavailable — never crashes.
- Updated the AI prompts (summary + quiz) to emit math as LaTeX in `$...$`. Verified: the model
  now returns e.g. `$\frac{1}{x^2+1}$` and it renders.
**Follow-ups (done):**
- Converted all STEM offline banks to LaTeX (all 3 tiers each): AP Calculus AB, Calculus BC,
  Physics 1, Physics C: Mechanics, Chemistry, and Statistics — so the no-API-key demo shows typeset
  math (subscripts, fractions, integrals, Δ, scientific notation). Verified offline rendering and
  that LaTeX options don't break MCQ letter-matching. The remaining subjects (bio, history, English,
  psych, CS) have little/no math and are left as prose.
- Tuned the quiz quality gate: removed the topic-keyword check (it false-rejected valid
  LaTeX/symbol questions, causing needless fallback). The gate now relies on the structural
  count check plus the P2 shape validation.

## 2026-06 — Adaptive Mistake Review System (spaced repetition)
**Why:** The mistake log was a static list with a manual "mastered" toggle — it never told you
*what to review or when*. Turned it into a system that schedules reviews and tracks mastery.
**What I did:**
- New `js/spaced-repetition.js` implementing the **SM-2** algorithm as a *pure* function behind a
  **pluggable scheduler registry** (`ReviewSystem.schedulers`), so another algorithm (e.g. Leitner)
  can be added later without touching the app — designed as a system, not a hard-coded rule.
- Each mistake carries a review state `{algo, reps, ef, intervalDays, due, reviews}`; old records
  migrate automatically.
- Ratings **Forgot / Hard / Got it** map to SM-2 quality (2 / 3 / 5); the next due date and a
  derived **mastery status** (new / learning / mastered) are computed automatically.
- Added review **analytics** (Due / Learning / Mastered / mastery %) and a "due for review" filter,
  with items sorted soonest-due first.
**Verified** (browser): SM-2 progression 1→6→16→45 days with EF climbing 2.5→2.9, auto-mastery at
reps≥3 & interval≥21, and "Forgot" correctly resetting the interval to 1.
**Follow-up (done):** added Node `node:test` unit tests for the SM-2 scheduler
(`tests/spaced-repetition.test.js`, zero dependencies) and a JS job in CI, so the algorithm is
now automatically tested on every push — not just browser-verified.

## 2026-06 — AI reliability layer (treat the LLM as an unreliable input)
**Why:** The AI is the one component I don't control. Previously I relied on a prompt saying
"return JSON" plus regex brace-extraction — brittle, and I had no idea how often it failed.
**What I did:**
- **JSON mode**: the proxy now forwards `response_format: {"type":"json_object"}` so the model
  returns syntactically valid JSON. Confirmed Groq's Llama model supports it.
- **Shape validation**: JSON mode guarantees valid JSON but not the right *shape* — in testing,
  the model returned `key_items` instead of the requested key. So the client validates the
  structure and does exactly one repair retry before falling back to the offline bank. Summaries
  use `validateSummaryShape`; quizzes are filtered by `normalizeAIQuestions` and then checked for
  the requested MCQ/short-answer structure by `isQuizQualityAcceptable`.
- **A reliability metric**: every generation is recorded as ok / repaired / failed in
  localStorage (`getAiReliability()`), so the malformed-output rate is now *measurable* instead
  of a guess.
**Lesson:** "valid JSON" and "correct JSON" are different guarantees — validate the contract at
the boundary, and instrument it so reliability is a number, not a feeling.
**Tests:** added pytest coverage that the proxy forwards JSON mode only when requested
(monkeypatched, no network).

## 2026-06 — Difficulty levels were cosmetic only
**Problem:** Basic / Medium / Challenge produced identical questions.
**Cause:** Difficulty only changed a label prefix; the AI prompt never defined what
each level meant, and the offline question seed ignored difficulty.
**Fix:** Gave the AI concrete per-level guidance (recall vs. application vs. synthesis)
and told it to calibrate strictly; folded difficulty into the offline seed.
**Lesson:** A parameter that doesn't change behavior is a silent bug — verify outputs,
don't assume the knob is wired up.

## 2026-06 — Khan-style answer gating + short-answer input
**Why:** You could open the "suggested answer" before attempting a question, and
free-response items had no place to actually write an answer.
**What I did:** Removed the always-open `<details>`; the model answer now stays hidden
until you check (MCQ) or submit (short answer). Added a textarea for short answers;
after submitting, the answer locks, the model answer reveals, and you self-grade. The
typed answer is stored in the mistake log so review shows "what I actually wrote."
**Trade-off (honest):** The answer text still ships to the browser (hidden via JS), so
a determined user could view-source. Truly hiding it would need a server round-trip per
check. For a study tool, client-side gating is acceptable; noted for a future server pass.

## 2026-06 — Offline question bank for all 14 AP subjects
**Problem (the biggest one):** The offline bank only had Calculus and Biology; 12 of 14
subjects silently returned *calculus* questions relabeled with the wrong subject.
**Decisions:**
- Moved the bank out of `app.js` into `js/question-bank.js` as a global object
  (`window.OFFLINE_BANK`), loaded as a plain `<script>` so it still works under
  `file://` (a local `fetch` of JSON would be blocked by the browser).
- Made `createMockQuestions` return `null` for subjects with no bank, so the UI
  degrades **honestly** ("no offline bank for this subject") instead of lying.
- Then authored banks for all 14 subjects (basic/medium/challenge), ~364 questions.
  Math/science answers are fixed and checked; history/English short answers are written
  as scoring-direction key points, matching how FRQ rubrics work.

## 2026-06 — SQLite persistence + Progress analytics
**Why:** A "track your weak spots" product that stored everything in one browser tab
wasn't really tracking anything. Added a server-side data layer.
**What I did:** SQLite `attempts` table; `POST /api/attempt` records each graded result;
`GET /api/stats` returns overall, per-subject, and 14-day trend. New Progress panel draws
accuracy cards, per-subject bars, and a trend chart with plain HTML/CSS (no chart library).
**Resilience:** Offline-first — if the server is down, attempts queue in `localStorage`
and sync when it returns.

### Bugs found while building this
- **Timezone off-by-one:** `created_at` is stored in UTC but the 14-day window used
  `date.today()` (server-local), so attempts made "today" vanished from the trend when
  local time was behind UTC. Fix: compute the window in UTC too. Added a regression test.
- **SQLite connection leak:** `with sqlite3.connect() as conn` only *commits* — it does
  not *close* — so connections leaked and locked the DB file on Windows (my tests caught
  this). Fix: wrap connections in `contextlib.closing`.

## 2026-06 — Tests + CI
Added a `pytest` suite for the API (validation, aggregation math, the timezone
regression) using a temporary database via an injectable `STUDYBOOST_DB` path, so tests
never touch real data. Wired up GitHub Actions to run the suite on every push.

## 2026-06 — AI provider: Groq via the OpenAI-compatible API
Discovered my key started with `gsk_` — a **Groq** key, not OpenAI — so it kept getting
401s against `api.openai.com`. Pointed `OPENAI_BASE_URL` at Groq's OpenAI-compatible
endpoint and used a Llama model. Later removed the unused Gemini provider entirely:
one provider is enough, and dead options are just surface area for bugs.

## Earlier (pre-Git, ~Feb–May 2026)
- Started as a single ~1,400-line HTML file; reviewed it and split into
  `index.html` / `css/styles.css` / `js/app.js` for maintainability.
- Hardened for demos: server-side API key (never in the client), `.env` + `.gitignore`,
  per-IP rate limiting and request-size caps on the proxy, a health check that gates the
  generate buttons, and offline fallbacks throughout.
- Fixed MCQ grading to accept both "B" and "B. full option text", and made practice
  questions use the notes currently in the box instead of a stale cached summary.
