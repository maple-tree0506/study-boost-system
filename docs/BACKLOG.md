# StudyBoost — Backlog

Work that is worth doing but deliberately deferred. This is **not** a changelog
(git history is that) and **not** durable user memory (those are long-lived goals
and preferences). Items here are project-specific and may change or be dropped as
Beta usage data and tester feedback come in.

## Question bank

### APUSH — prioritize Cold War on any future refinement

If AP US History is refined again, prioritize **Cold War** coverage (Vietnam,
détente, Reagan) rather than adding more founding-era content.

**Reason:** APUSH balance was improved in commit `8b60b02` (added WWI / 1920s /
WWII, trimmed founding-era redundancy). Further founding-era expansion now has low
marginal value; Cold War is the thinnest remaining period (currently Truman
Doctrine + Brown only).

**Revisit / drop if:** Beta data shows APUSH is barely used (e.g. Bio/Psych
dominate), or the question bank is frozen to focus on productization — in either
case this item is moot.

### AP World History — strengthen distractors on a future pass

World History (commit `082f600`) is accepted but the weakest Stage C subject. The
question *stems* are genuinely AP World (comparison, causation, CCOT, evidence),
but the wrong-answer options are often too easy (anachronisms, obviously false),
making items easier than the real exam. A future pass should swap weak distractors
for plausible-but-wrong AP-style options and convert the most identification-
leaning basics (e.g. the Indian Ocean / monsoon item) into comparison/causation
questions.

**Priority:** low (80 -> 90 polish). Productization (mobile, onboarding,
retention, data viz) is 40 -> 80 and matters far more for real usage and
admissions — do that first.

## Analytics / instrumentation

### Completion funnel analytics (Completion → Review)

Add server-side events for the P0 retention funnel:

```
Completion Screen Shown -> Review CTA Clicked -> Review Session Started -> Review Session Completed
```

so the Completion -> Review click-through, review start rate, and review
completion rate can be measured (and used to tune button copy / placement /
default behavior). Today these are client-only (localStorage) and invisible to
the server.

**Priority: very low. Deferred until >= 20 active beta users.** With only 5-10
testers the click-through rate has no statistical meaning (3 of 8 saw it, 2
clicked = "66.7%" is noise) — just *ask* those users directly ("did you see the
completion screen? did you click Review? why not?"). Wire the funnel only once
the cohort is large enough for the numbers to mean something.
