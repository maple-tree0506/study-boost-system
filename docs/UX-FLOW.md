# StudyBoost — UX Flow

The single biggest product problem is **not** that the question bank is too small
(14 subjects, 360+ MCQs, all with explanations). It is that **after a practice
round, the user does not know what to do next.** The app is a dashboard where the
core learning loop is split across disconnected panels, so the journey
notes → practice → grade → review → progress has no through-line. Fixing that
matters more than adding another hundred questions.

## Current state (as built)

`index.html` is a single-page dashboard with three clusters of always-visible
panels:

- **Create** — AI Note Summary (`#noteInput` → `#summaryOutput`) + Practice
  Questions (subject/format/difficulty/topic → `#quizOutput`)
- **Review** — Adaptive Mistake Review (SM-2 due list, filters)
- **Insights** — Progress + Topic Mastery
- Collapsed **Setup** — model/connection + export/import ("Your data")

This is fine for a returning power user, but a new user (and anyone right after
generating a set) hits the **experience break**: the quiz renders as a static
list of cards; when they finish there is no closing step, no "here's what you
missed / here's your progress / come back tomorrow." The user has to scroll
between disconnected panels to find the next action.

## The designed journey

```
[0 Value prop / first-run]  5s: "Turn your notes into adaptive practice" + one CTA
        │ Start
[1 Input]   paste notes → AI summary   (skippable)
        │
[2 Set up]  subject + topic + difficulty/format → Generate
        │
[3 Practice]  answer the set
        │  set complete  ← the break is here
[4 ★ Completion screen]   ← the missing connective tissue
     · score + which items were wrong
     · "N added to your Mistake Log · SM-2 scheduled them for review"
     · progress delta: "Glycolysis: new → developing" · streak: "Day 3"
     · [PRIMARY] Review My Mistakes   →  [5]
       [secondary] View Progress      →  [6]
[5 Review]   Mistake Log / due reviews (closes the SM-2 loop)
[6 Progress] Topic Mastery radar + streak
```

### Why Review is the primary CTA on [4]

A student's motivation peaks **right after getting something wrong**. Just having
missed a Glycolysis question, they may not care about the mastery radar or the
stats chart yet — but they very much want to know *what* they got wrong. So the
default path is **Practice → Mistakes → Progress**, not Practice → Progress.
`Review My Mistakes` is the primary button; `View Progress` is secondary.

## The key fix: the Completion Screen [4]

This one screen stitches the four disconnected panels into a loop. After a set:
surface results, route missed items into Review (SM-2), show the mastery delta and
the streak, and offer the two exits. It needs **only front-end logic over data we
already have** (grading results, mistake log, mastery model, attempt counts) — no
new backend, no appearance work.

## First-run / onboarding

First visit: show the value prop and guide the user once through [1] → [4].
Afterwards default to the dashboard. This simultaneously answers three tester
complaints: unclear 5-second value prop, confusing onboarding, and the break.

## Build order (each ships independently)

1. **[4] Completion screen** — connects the break; highest ROI; front-end only.
2. Difficulty labels with parenthetical level explanations (quick win).
3. **[6]** Topic Mastery radar + progress bars + streak counter.
4. **[0]** Value-prop hero.
5. **First-run onboarding** guiding the first loop.

Appearance/visual polish is deliberately deferred until the flow works (see
[PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md)).
