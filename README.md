# TrackForge (StudyBoost AI)

[![CI](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml/badge.svg)](https://github.com/maple-tree0506/study-boost-system/actions/workflows/ci.yml)

**Live demo:** <https://studyboostai.pythonanywhere.com/> — runs in **offline mode**
(no AI key on the demo server): practice questions come from the built-in bank for
13 AP courses (plus an Other / General set), and the adaptive loop (spaced repetition, mistake review, topic
mastery) is fully functional. Progress, Mistake Log, and Topic Mastery are all
**per-user and start empty** — Progress is scoped to an anonymous per-browser id on
the server; Mistake Log and Topic Mastery live in your own browser. Answer a few
questions to see them fill in. Run it locally with your own API key to enable real AI
summaries and AI-generated questions.

**Privacy:** the demo records anonymous usage statistics — an opaque random ID per
browser, plus each question's subject, type, and whether it was answered correctly —
to measure learning outcomes. No names, emails, or personal information are collected
or requested. **Beta testers:** please use the live link above (results from a copy
run locally with `python server.py` are not part of the study). Your mistake log, topic
mastery, XP, and streak live in your browser — use **Setup → Download my data** to
back them up (browsers can clear local storage), and **Restore from file** to bring
them back or move them to another device.

> **This is a client + server app — it is not a static page.** Opening
> `index.html` directly (`file://`) only runs the offline mode; AI features and
> progress tracking need the local server below. Always use the
> `http://127.0.0.1:8765/` URL.

## Quick start (Windows, easiest)
1. **Double-click `start.bat`.** It installs dependencies, starts the server, and
   opens the app in your browser. Keep the black window open while you use it;
   close it to stop the server.
2. (For AI features) add your API key first — see "Run locally (manual)" step 2
   below. Without a key,
   the app still works in **offline mode** (built-in question bank for 13 AP
   courses), so you can try the full workflow with no setup.

## For other people running this
- They need [Python 3](https://www.python.org/) installed, then double-click
  `start.bat` (or follow "Run locally" below).
- **AI features use a key, and the key is never shared in this repo.** Each person
  adds their **own** API key to a local `.env` (OpenAI, or any OpenAI-compatible
  provider such as Groq via `OPENAI_BASE_URL`). With no key, offline mode works.
- A non-technical reviewer who cannot run a server can use the
  [live demo](https://studyboostai.pythonanywhere.com/) directly (offline mode,
  see above).

## Run locally (manual)
1. Install deps: `py -m pip install -r requirements.txt`
2. Open `.env` in the project folder and fill in your key:
   - `OPENAI_API_KEY=...` — your OpenAI-compatible API key
   - `OPENAI_BASE_URL=...` — optional; set this to use an OpenAI-compatible provider
     (e.g. Groq: `https://api.groq.com/openai/v1`). Leave unset for OpenAI itself.
3. Start server: `py server.py` (restart after editing `.env`)
4. Open: http://127.0.0.1:8765/

## Notes
- This project uses a local proxy (`server.py`). The key stays on the server side.
- If the API key is missing or an AI call fails, the UI falls back to an offline
  question bank that covers **13 AP courses** plus an Other / General set (basic /
  medium / challenge tiers). AP Calculus AB questions are tagged with 23 course skills,
  so a topic like "Chain rule" gets exactly the questions on that skill. Subjects without a bank degrade honestly instead of showing
  wrong-subject questions.

## Math rendering
Mathematical expressions are written as LaTeX delimited with `$...$` and rendered with
**KaTeX**. The AI is prompted to emit LaTeX, so equations in AP Calculus/Physics/Chemistry
questions are typeset rather than shown as plain ASCII. If KaTeX (loaded from a CDN) is
unavailable, the raw text is shown instead — it degrades gracefully, never crashes.
(The built-in offline question bank is still plain text; converting it to LaTeX is a follow-up.)

## Similar-question practice (from your mistakes)
Open any saved mistake (**Review → Practice similar**) to see the question with your pick,
what it tests (knowledge point, how to solve it, and the likely error, or an honest
"not enough information"), and new multiple-choice questions on the same idea with
different numbers or setups.
- **Checked before shown.** AI output is validated (schema, knowledge point, duplicates),
  and for computable math the answer key is recomputed with a safe expression engine; a
  variant whose key disagrees with the math is rejected and repaired, never shown.
- **Adaptive.** Difficulty follows a 2-up/1-down staircase around the original level;
  "likely mastered" needs several right in a row (a Beta-posterior rule), never one.
- **Wired into the loop.** Results feed Topic Mastery (tagged as similar questions), a miss
  brings the original's SM-2 review forward, and Progress shows practice by type. SM-2
  stays in charge of review timing.
- **Works without a key** for seven AP Calculus skills via a built-in generator; other topics
  need the AI connection and say so.
Details: [docs/VARIANT-PRACTICE.md](docs/VARIANT-PRACTICE.md).

## How it looks and flows (V5 "Orbit Field", Nov 2026)
- **The look**: the review schedule's own rings (1, 6, 15, 38 days) are the picture. The
  15-day ring is a blue disc; display type turns black where it crosses it; hairline rings
  run across the page; your saved mistakes are the dots. Reading and answering happen on
  warm paper sheets. Buttons are capsules; nothing slants.
- **Home** is your orbit at poster size: the next action sits in its core, with the
  reviews that are due round the core's edge and the rest on their rings. It leads with
  your real next task ("4 questions are due" and which ones); first-time visitors see what
  the app does and what the orbit is for.
- **Practice** shows one question at a time; during a set the page header steps aside, so
  the set bar (course, level, where the questions came from, a dot per question) and the
  question take the screen. Keys: A–D or 1–4 choose, Enter checks, N moves on.
- **Review** opens with what is due today (the count in a disc) and a Start review button:
  due mistakes come one at a time (recall, show the answer, rate), each rating says when
  the card comes back, and a missed one can be followed by a similar question first. Below
  it, the Review Orbit shows each saved mistake by course and by days until SM-2 brings it
  back (the rings carry their real dates), with filters, a list view, and keyboard
  selection, above a searchable Mistake Library.
- **Results** draws the set as one arc over your score, one segment per question (solid for
  right, a dashed outline for not yet), with one learning line and the one next step first;
  the full skill evidence, every answer, XP, and sharing follow.
- **Setup** lists your data first and has a Reduce-motion setting. Design rules:
  `docs/DESIGN-SYSTEM.md`; this redo's record (baseline, two directions, decision, before
  and after, verification): `docs/REDESIGN-V5.md`; earlier: `docs/REDESIGN-V4.md`,
  `docs/REDESIGN-PROGRESS.md`.

## Practice & answers
- **Answers are gated (Khan-style):** the suggested answer stays hidden until you
  act — multiple-choice reveals after "Check answer"; short-answer/FRQ reveals
  after you type an answer and click "Submit answer", then you self-grade.
- Short-answer questions include a text box so you write your own response; your
  answer is saved alongside the question in the Mistake Log.

## Progress tracking (SQLite)
- Every graded question (MCQ "Check answer" or short-answer "Mark correct/incorrect")
  is recorded server-side in `studyboost.db` (created automatically on first run).
- The **Progress** panel shows overall accuracy, total answered, per-subject accuracy,
  and a 14-day accuracy/volume trend — drawn with plain HTML/CSS (no chart library).
- **Per-user:** Progress is scoped to an anonymous per-browser id, so each person sees
  only their own results (it starts empty and grows as you practice).
- Resilience: if the server is unreachable, grading still works and results queue in
  `localStorage`, then sync automatically once the server is reachable again.
- The database file is local-only and git-ignored.

### API
- `POST /api/attempt` — body `{ subject, type, correct, ts, userId, source }`; stores one graded result.
  `source` is `generated`, `review`, or `variant` (a similar question built from a mistake).
- `GET /api/stats?userId=<id>` — returns `{ overall, bySubject, bySource, daily }` for that user; omitting `userId` returns empty stats.
- `POST /api/variants` — similar questions for one saved mistake (see
  [docs/VARIANT-PRACTICE.md](docs/VARIANT-PRACTICE.md)). The question text is processed, never stored.

## Testing
- **Backend (Python):** `py -m pip install -r requirements-dev.txt` then `pytest -q`.
  Tests use a temporary database (via the `STUDYBOOST_DB` env var) and never touch your
  real `studyboost.db`.
- **Frontend (JS):** `node --test tests/spaced-repetition.test.js tests/practice-selection.test.js tests/mastery-model.test.js tests/question-bank.test.js tests/home-summary.test.js tests/variant-practice.test.js tests/review-orbit.test.js`
  — unit tests for the SM-2 scheduler, the R1 practice-selection planner (due-review
  selection + explanation passthrough), the topic-mastery model (normalization, EMA
  update math, volume-gated levels, summary ordering), a structural validator for the
  offline question bank (option/answer contract, KaTeX `$` balance, banned patterns),
  the Home logic (level progress, streaks, missions, next step, the Progress top line),
  and the Review Orbit and Mistake Library rules (filters, sort, chart layout, formula-safe
  snippets), using Node's built-in test runner (no dependencies; Node 18+).
- **End to end (browser):** `node --test tests/e2e/variant-flow.e2e.js tests/e2e/redesign-flow.e2e.js`
  — starts `server.py` (no key, and a scripted mock AI provider) and drives Chromium through
  the similar-question loop and the redesigned flows (Home, Practice focus mode and keys,
  results, Review Orbit and library, the review queue, the phone path from a miss to a
  similar question and the due review, Notes, Reduce motion, the Home button with real and
  fallback fonts, upload retries, 320px width). Needs the
  `playwright` package with Chromium.
- All three run in CI on every push (see the badge above).

## AI output reliability
LLM responses are treated as an unreliable input that must be validated:
- **JSON mode**: the proxy forwards `response_format: {"type":"json_object"}` so the model
  returns syntactically valid JSON.
- **Shape validation**: JSON mode guarantees valid JSON but *not the right shape*, so the client
  validates the structure and **retries once** before falling back to the offline bank. The two
  generators validate differently:
  - *Summary*: `validateSummaryShape` checks the object (e.g. the model may return `key_items`
    instead of `keyPoints`); on failure the same request is retried once.
  - *Quiz*: `normalizeAIQuestions` filters out malformed items, then `isQuizQualityAcceptable`
    enforces the requested MCQ/short-answer structure; if the set falls short it regenerates once
    before falling back.
- **Reliability metric**: each generation is recorded as `ok` (valid first try), `repaired`
  (valid after one retry), or `failed`. Open the browser console and run `getAiReliability()`
  to see the running counts — this is how the malformed-output rate is measured.

## Security model & limitations
This is a **local, single-user** tool; the security model is scoped to that, and stated honestly:
- **API keys stay on the server.** They are read from `.env` (gitignored) and never sent to the
  browser. The frontend only talks to the local proxy.
- **Same-origin only.** The page and the API are served from the same Flask app, so CORS is not
  enabled — arbitrary websites cannot call the proxy.
- **Per-IP rate limiting** on the AI (`/api/chat`) and attempt (`/api/attempt`) endpoints, plus
  request size/count caps, to prevent runaway cost and database flooding.
- **Known limitation:** rate limiting is **in-memory** — it resets when the server restarts and is
  per-process, so it is suitable for local single-user use, not multi-instance production. A real
  deployment would move it to a shared store (e.g. Redis) and add a hard usage cap.

## Project structure
- `index.html`: page markup (six views in one document)
- `css/styles.css`: design system and styling (see `docs/DESIGN-SYSTEM.md`)
- `js/app.js`: application logic
- `js/shell.js`: views, page transitions, navigation marker, dialog
- `js/home-summary.js`: Home logic (pure and tested)
- `js/review-orbit.js`: Review Orbit and Mistake Library rules (pure and tested)
- `js/question-bank.js`: built-in question bank (13 AP courses plus Other, 3 tiers; Calc AB skill-tagged), loaded on demand
- `js/variant-practice.js`: similar-question adaptive rules (pure and tested)
- `mathcheck.py`: safe math expressions for verifying answer keys (no `eval`)
- `variant_templates.py`: built-in generator for AP Calculus similar questions
- `variant_engine.py`: similar-question pipeline (prompts, validation, quality gates, fallback)
- `assets/fonts/`: self-hosted fonts with their licenses
- `server.py`: API proxy + SQLite persistence
- `studyboost.db`: local progress database (auto-created, git-ignored)
- `tests/`: pytest suite (run with `pytest -q`; also runs in CI), JS unit tests, `tests/e2e/`
  browser tests, and `tests/visual/` (screenshot, overflow, axe, and timing review tool)
- `DEVLOG.md`: dated development log (decisions, bugs, fixes)
