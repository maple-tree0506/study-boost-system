# StudyBoost — Question Bank Standard

The standard every subject in `js/question-bank.js` was brought up to ("Stage C").
All 14 bank subjects (13 AP courses plus Other / General) now meet it. Use this when adding or revising questions.

## Shape

`OFFLINE_BANK.<subject>.<basic|medium|challenge>.{mcq, sa}`

- **26 MCQs per subject**, split **8 / 9 / 10** is the target spread but the live
  split is **8 / 9 / 9** (basic / medium / challenge).
- Each MCQ: `{ q, o: ["A. ...","B. ...","C. ...","D. ..."], a, e, k? }`
  - `a` must exactly match one option string.
  - `e` is the explanation (required on every MCQ).
  - `k` (optional, on MCQs and SA templates): skill ids from the course's catalog in
    `js/practice-selection.js` (`SKILLS`), main skill first, e.g. `["chain-rule",
    "basic-derivatives"]`. A course with a catalog must tag every item; the validator
    rejects unknown ids. Tags decide which items a topic request gets and which skill a
    result counts toward. AP Calculus AB is fully tagged (23 skills, Units 1–8); other
    courses have no catalog yet and are matched by the words of the question and answer.
- SA arrays are templates that may contain a `{focus}` placeholder; MCQs must not.

## Content rules

1. **Authentic, not copied.** AP-style, never reproduced College Board items.
2. **Applied, not definitional.** Lead with a stimulus/scenario/data/code, then ask
   for the *function/effect/result* — not "what is X?".
3. **Every item has an `e`** that **names the specific misconception / trap** in the
   tempting distractor, not just why the answer is right.
4. **Plausible-but-wrong distractors.** No option a student can eliminate in 5
   seconds without engaging the material. Anachronisms and absurd options are out.
5. **Distribute the correct answer** across A–D (avoid an all-A tell). The lang
   subject has a test enforcing this; apply it everywhere as a quality bar.
6. **Public domain only.** No fabricated quotes attributed to real people; quote
   verbatim only verifiable canonical lines, otherwise paraphrase accurately.

## Per-subject signature

Each subject leans into how its real exam actually tests:

| Subject family | Signature question type |
|---|---|
| Bio/Chem/Physics/Calc/Stats | quantitative reasoning, computation, data interpretation |
| AP US / World History | primary-source / data-table stimulus → analysis (comparison, causation, CCOT) |
| Psychology | scenario application ("a person does X → which concept?") + research methods |
| Computer Science A | code tracing / output prediction / bug spotting (Java) |
| English Language | passage-based rhetorical analysis (function/effect, not term ID) |
| Other (academic skills) | critical thinking; `e` uses "Correct because / Trap / Misconception" |

## Adding skill tags to another course

1. Add the course's catalog to `SKILLS` in `js/practice-selection.js`: `{ id, name, unit,
   aliases }`, ids in kebab case, names as a student would type them, units as in the
   Course and Exam Description.
2. Tag every item of that course with `k` (main skill first). The validator then
   requires full coverage for the course.
3. If the built-in similar-question generator covers a skill, use the same id it
   reports in `/api/health` (`variants.builtInSkills`), so availability can be decided
   in the browser.

## Technical guardrails

- **No bare `$`** anywhere (KaTeX runs after render via `typesetMath`).
- **No `{focus}`** in MCQ stems (SA only).
- `e` length ≥ 20 chars.
- Options prefixed `A. ` / `B. ` / `C. ` / `D. `; `a` matches an option.
- Escape `"` as `\"` in source; `<`, `>` are safe (escaped at render by `escapeHtml`).

## Verification (every change)

`node --test tests/question-bank.test.js` (structural validator) + the full JS
suite + `pytest`. Report only machine-verifiable facts (counts, test results, git
hash); for quality, sample ~5 random questions for human review rather than
self-grading subjective tallies.
