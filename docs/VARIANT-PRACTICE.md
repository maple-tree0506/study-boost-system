# Similar-Question Practice (Adaptive Error-Based Practice)

When a student misses a question, StudyBoost can build new questions that test the
same idea with different numbers, functions, or setups, check them before they are
shown, and use the results to adjust difficulty, topic mastery, and review timing.

The loop: **miss → analyse → generate variants → practise → update mastery → spaced review.**

## 1. Audit: what existed before this feature

| Area | Existed | Notes |
|---|---|---|
| Mistake capture | Yes, `addErrorRecord` in `js/app.js` | Saved question, answer, explanation, subject, topic. **Did not save the student's multiple-choice pick, the options, or the difficulty.** |
| Mistake storage | Yes, `localStorage` (`studyBoostMistakesV2`) | Local-first by design; the privacy page promises question text and answers are not stored on the server. |
| SM-2 | Yes, `js/spaced-repetition.js` | Pure, pluggable scheduler per mistake. |
| Topic mastery | Yes, `js/mastery-model.js` | EMA (α = 0.4) per subject + topic, volume-gated levels. No record of where an outcome came from. |
| Review injection | Yes, `js/practice-selection.js` | Due mistakes are resurfaced in new sets (cap 3). |
| Review orbit / Home | Yes, `js/home-summary.js` | Next step: due reviews, then weakest topic, then a new set. |
| AI generation | Yes, client-side prompt + `/api/chat` proxy (Groq, OpenAI-compatible, JSON mode) | Shape checks only; no answer verification. |
| Mistake detail page | **No** | The Review view was a list of cards. |
| Error analysis, variants, verification, difficulty adaptation | **No** | Built here. |
| Server database | `attempts` only (subject, type, correct, time, anonymous id, source ∈ {generated, review}) | |

## 2. Architecture

```
Browser (local-first)                                   Server (stateless processing)
-------------------------------------------------------------------------------------------
Mistake Log  ── "Practice similar" ──► #mistake/<id>    POST /api/variants
  record.analysis                         page           ├─ variant_engine.normalize_*      (bounds every field)
  record.variantPractice                    │            ├─ AI path: one call, JSON mode
    .pending  (generated, unanswered)       │            │    schema + quality gates
    .history  (outcomes)                    │            │    mathcheck verification
                                            │            │    one targeted repair call
js/variant-practice.js (pure, tested)       │            ├─ template path: variant_templates
  nextTarget  2-up/1-down staircase  ◄──────┤            │    (no key, AI failed, or nothing usable)
  evidence    Beta posterior                │            └─ ai_generation_log row (counts only)
  nudgeSchedule  SM-2 coupling              │
  rankForPractice weakest topic first       └──► POST /api/attempt  source = "variant"
```

| File | Role |
|---|---|
| `mathcheck.py` | Safe ASCII-math parser (no `eval`), numeric evaluator, LaTeX printer, and checks for derivatives, antiderivatives, definite integrals, limits, and plain values. Input is bounded (length, node count, depth). |
| `variant_templates.py` | Built-in generator for seven AP Calculus skills (power, chain, product, quotient rules; reverse power rule; definite integrals; trig limits), three levels each. Every distractor encodes one named misconception. Also classifies which skill a mistake practises. |
| `variant_engine.py` | Input normalization, prompts, schema validation, quality gates, diagnosis, repair, and fallback. Takes the LLM as an injected callable, so tests need no network. |
| `server.py` | `/api/variants`, the provider client with typed errors, rate limits and daily quota, the `ai_generation_log` table, `variant` attempts, `bySource` stats. |
| `js/variant-practice.js` | The adaptive rules, pure and unit-tested. |
| `js/app.js`, `js/shell.js`, `index.html`, `css/styles.css` | The mistake page, the Review entry point and recommendations, Progress split, Home next step, routing. |

## 3. Generation and quality gates

A response that parses is not assumed to be correct. Each AI variant must pass:

1. **Schema:** exactly 4 distinct options, one valid correct index, explanation of 40+
   characters that does not just restate the answer, no option-letter references (the
   server shuffles options), `$` delimiters balanced, no "all/none of the above".
2. **Knowledge point:** the variant's `concept_key` matches the analysis; the question
   or explanation uses the concept's terms; for calculus rules the checked expression
   must actually require the rule (a chain-rule variant must contain a composition, a
   product-rule variant a product of two varying factors).
3. **Math, when computable:** the model supplies a verification spec in plain ASCII
   math. `mathcheck` recomputes the answer, requires exactly one option to match,
   requires every other option to be clearly different (from the answer and from each
   other), and rejects the variant if the model's answer key disagrees. The options
   shown are re-typeset from the checked expressions, and the function in the stem is
   either typeset from the checked expression (`{{expr}}`) or must visibly appear in it.
   Word problems keep their units, and each displayed number is cross-checked.
4. **Duplicates:** near-copies of the original, of earlier variants (`avoid` list), or of
   each other are rejected. Changing numbers, functions, or the scenario is allowed:
   that is the point of a variant.

Rejected variants get **one** repair call that lists the exact problems and asks only
for replacements. Every accepted variant reports `verification.status`:
`verified`, `unverified` (quantitative but no checkable spec), or `not_applicable`.

**Diagnosis is never invented.** With no recorded answer the result is "insufficient
information". An AI diagnosis must quote the student's answer; if the quote is not in
the answer, confidence drops to low and the page says it is unconfirmed. Offline, a
diagnosis is given only when the student's pick is a distractor that the stored
explanation names as a trap.

**Failures** map to codes the UI explains: `rate_limited` (with `Retry-After`; waits of
2.5 s or less are retried once), `timeout`, `auth_error`, `bad_request`,
`upstream_error`, `bad_response`, `invalid_output`, `too_many_requests`,
`daily_limit`, `no_generator`. For calculus skills a failed AI call falls back to the
built-in generator with a notice; otherwise the error is shown and nothing unverified
is substituted.

**Token and call control:** one call per batch of 2 variants, at most one repair call,
`max_tokens` scaled to the batch, analysis reused after the first round (variants-only
prompt), unanswered variants kept and served before any new call, inputs truncated,
6 AI requests per minute per IP, 40 AI requests per user per UTC day (all configurable).

## 4. Adaptive rules (`js/variant-practice.js`)

- **Difficulty:** a 2-up/1-down staircase (two right in a row step up a level, a miss
  steps down), kept within one level of the original question.
- **Mastery evidence:** successes and failures feed a Beta(1 + s, 1 + f) posterior.
  "Likely mastered" needs P(success rate > 0.6) ≥ 0.8, the last answer right, and at
  least two different variants right at the original level or above. Easier variants
  count half; a miss counts fully. One correct answer is never enough: with no misses
  it takes 3 right in a row at the original level, and after one miss, 5.
- **Topic mastery:** each variant outcome feeds the existing EMA model for the
  mistake's own topic, tagged `source: "variant"`; the existing volume gates still apply.
- **SM-2 stays in charge.** A missed variant can only bring the original's next review
  forward to tomorrow (reps, ease factor, and interval untouched); a correct variant
  never pushes a review back. Due reviews still outrank similar-question practice on Home.
- **Records stay separate:** server attempts carry `source = variant` (not `review`), so
  the Review Recovery Rate is unchanged; mastery keeps per-source counts; the mistake's
  `variantPractice.history` is separate from its SM-2 state.
- **Prioritization:** mistakes in the weakest topics are recommended first (Review page
  and Home next step); mistakes that already show transfer are left to SM-2.

## 5. Data and privacy

- Mistake text, analysis, pending variants, and history stay in the browser (and in
  "Download my data" backups, since they live on the mistake record).
- The server processes the one mistake sent with a request and does not store it. The
  `ai_generation_log` table holds only counts, codes, token usage, latency, model,
  time, and the anonymous ID. A test dumps the whole database after a request and
  checks that no question text is in it.
- Database changes are additive and idempotent (`CREATE TABLE IF NOT EXISTS`); old
  databases migrate on start-up without losing rows (tested on a 4-column legacy DB).
- The privacy page describes this data flow.

## 6. API

`POST /api/variants`

```json
{ "mistake": { "id": "err-1", "subject": "AP Calculus AB", "topic": "Chain rule",
               "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
               "answer": "A. ...", "userAnswer": "B. ...", "explanation": "...",
               "difficulty": "medium" },
  "level": "medium", "count": 2, "avoid": ["stems already seen"],
  "analysis": null, "model": "llama-3.3-70b-versatile", "userId": "u-..." }
```

200: `{ analysis, variants: [{ id, question, options, answer, explanation, optionNotes,
concept, conceptKey, difficulty, relation, changes, verification, generator }],
generator, notice, level, relation }`. Errors: `{ error, code, retryAfter?, analysis? }`
with the status codes in `server.py` (`_VARIANT_STATUS`).

Environment: `VARIANT_RATE_LIMIT_PER_MIN` (6), `VARIANT_BUILTIN_RATE_LIMIT_PER_MIN` (30),
`VARIANT_DAILY_LIMIT` (40), `VARIANT_BUDGET_SECONDS` (40), `LLM_READ_TIMEOUT` (25),
`VARIANT_MODEL` (llama-3.3-70b-versatile).

## 7. Tests

- `tests/test_mathcheck.py`: parsing, safety limits, domains, LaTeX, every check type.
- `tests/test_variant_templates.py`: every skill × level over 40 draws verifies and
  renders; skill classification on real bank items.
- `tests/test_variant_engine.py`: each quality gate, repair, diagnosis rules, fallbacks,
  failure codes (scripted fake LLM).
- `tests/test_variants_api.py`: the endpoint with a mocked provider (success, repair,
  429 with and without a short wait, timeout, 401/404/500, bad JSON), quotas, rate
  limits, legacy-DB migration, stats by source, and that no question text is stored.
- `tests/variant-practice.test.js`, plus additions to the mastery and Home tests.
- `tests/e2e/variant-flow.e2e.js`: the whole loop in Chromium against real servers
  (offline and a mock AI provider), including the honest no-generator path and phone width.

## 8. Known limits

- Without an AI key, only the seven calculus skills get similar questions; other topics
  say so and offer a general set for the course instead.
- Conceptual questions (most non-math subjects) cannot be machine-checked; they pass the
  schema, concept, and duplicate gates and are labelled accordingly.
- Topic identity is still the student's free-text topic, so a mistake with no topic
  feeds the course's general bucket.
- Rate limits are in memory per process (as for `/api/chat`); the daily quota is in SQLite.
