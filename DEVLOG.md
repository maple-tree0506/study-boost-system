# Development Log — StudyBoost AI

A running record of what I built, the bugs I hit, and the decisions I made.
Newest entries first.

> Note on history: development began as a single-file prototype around February 2026.
> I adopted Git version control in June 2026, so commits before that date are not in
> the history; the entries below reconstruct the earlier work honestly. I use AI tools
> to assist (commits are marked with a Co-Authored-By trailer), but the architecture,
> decisions, and debugging direction are mine.

---

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
