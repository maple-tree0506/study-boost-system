# StudyBoost — Question Bank Standard

The standard every subject in `js/question-bank.js` was brought up to ("Stage C").
All 14 subjects now meet it. Use this when adding or revising questions.

## Shape

`OFFLINE_BANK.<subject>.<basic|medium|challenge>.{mcq, sa}`

- **26 MCQs per subject**, split **8 / 9 / 10** is the target spread but the live
  split is **8 / 9 / 9** (basic / medium / challenge).
- Each MCQ: `{ q, o: ["A. ...","B. ...","C. ...","D. ..."], a, e }`
  - `a` must exactly match one option string.
  - `e` is the explanation (required on every MCQ).
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
