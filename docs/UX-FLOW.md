# StudyBoost — UX Flow (v2)

## The problem v2 solves

v1 fixed the first symptom: after a practice set the user didn't know what to do
next. The **Completion Screen** (shipped — score, +XP, level, today's totals,
streak, and a primary **Review My Mistakes** CTA) closed that gap and is the first
realized segment of a guided flow.

But the deeper issue remains: the app is still a **dashboard of co-equal panels**
(Create / Review / Insights, all visible at once), so it reads as **five separate
tools**, not **one product**. A professor — or a returning student — doesn't ask
"is the progress bar a nice color?"; they ask *"why would someone keep using
this?"* That answer lives in how the screens connect, not in CSS.

## The v2 architecture: a guided spine + a dashboard "home base"

Chosen direction: make the core loop a **guided session spine** that is the
default experience, and demote the current dashboard to a **home base / overview**
a returning user can jump to — instead of five panels competing for attention.

```
   ┌─────────────────────── the spine (default session path) ───────────────────────┐
   │                                                                                 │
   [0 Home]      5s value prop + one Start CTA  ──►  [1 Generate]                     │
   value prop                                         subject · topic · difficulty    │
   "why this over Quizlet/ChatGPT/Anki"                       │ Generate             │
                                                              ▼                       │
                                                       [2 Practice]                   │
                                                       answer the set                 │
                                                              │ set complete          │
                                                              ▼                       │
                                                  [3 Completion]  (shipped)           │
                                                   score · +XP · Level · streak       │
                                                   [PRIMARY Review] [Progress]        │
                                                       │              │               │
                                                       ▼              ▼               │
                                                  [4 Review]     [5 Progress]         │
                                                  due mistakes   mastery + streak      │
   └─────────────────────────────────────────────────────────────────────────────────┘
                                   ▲
                          [ Home base / overview ]  ── reachable any time; the old
                          dashboard: all panels, jump anywhere (for return users)
```

**One thing is primary at a time, and every screen has an obvious next step.** The
dashboard isn't deleted — it becomes the "where am I / jump anywhere" hub, not the
front door.

## Screen by screen

| Spine screen | Shows | Next | Built? |
|---|---|---|---|
| **0 Home** | One-line value prop ("turn your notes into adaptive practice the SM-2 way") + the single differentiator vs Quizlet/ChatGPT/Anki + one **Start** CTA. | → Generate | Partial — a hero exists; needs to become the front door + sharpen the 5-second claim. |
| **1 Generate** | subject · topic · difficulty (with level labels) · format. Optional notes → AI summary. | → Practice | Built (Create panel); needs difficulty level labels + to sit *in* the spine. |
| **2 Practice** | the set, one card flow. | → Completion on finish | Built. |
| **3 Completion** | score · +XP · Level + XP-to-next · today's questions/reviews/XP · streak · **[Review My Mistakes]** (primary) · [View Progress]. | → Review / Progress | **Shipped.** |
| **4 Review** | due SM-2 items, started immediately by the CTA (no second click). | back to spine / Progress | **Shipped** (Review CTA auto-loads due). |
| **5 Progress** | Topic Mastery progress bars + streak + daily/total XP. | back to Home base | **Shipped** (progress bars). |

**Home base** = today's dashboard, reframed: the place to see everything and jump
to any panel. Default landing for a *returning* user who just wants to resume;
first-time / fresh-session users get the spine.

## How v2 absorbs the remaining Tier-1 feedback

- **Value prop unclear (#2)** → it *is* screen [0]. The spine forces a real front
  door with a 5-second claim, instead of dropping users into a five-panel wall.
- **Data feedback weak / "don't feel myself improving" (#3)** → the **mastery +
  progress payoff moves to right after Completion** (the motivation peak), not
  buried in the 5th panel. XP is the reward; **mastery is the growth** — surface it
  where it's felt.

## Already built — how it slots in

Completion screen, primary Review CTA (auto-loads due), XP / Level / Daily summary,
streak counter, Topic Mastery progress bars. v2 is mostly **re-sequencing what
exists into one path**, not building new mechanics.

## Build order for v2 (each ships independently; appearance still deferred)

1. **Home front door** — make [0] the entry: value prop + one Start CTA that routes
   into Generate; dashboard reachable as "home base," not the default wall. (Answers
   value-prop + onboarding complaints; biggest "feels like one product" win.)
   **Shipped.**
2. **Surface the growth payoff post-Completion** — show mastery/progress inline at
   the motivation peak (data-feedback complaint). **Shipped:** the completion screen
   now shows the practiced topic's mastery movement (e.g. *Developing → Proficient*
   on a level-up, else current level + recent accuracy), captured pre-set so the
   change is real.
3. **Difficulty level labels** in Generate (quick win). **Shipped:** each option
   carries a parenthetical (recall & definitions / apply & multi-step / AP exam
   rigor), reusing the diffGuide wording that drives the generator.
4. **First-run onboarding** that walks the spine once. **Shipped:** a dismissible
   first-run welcome card shows the 4-step loop and clarifies "no API key needed";
   shown only to brand-new users, gated on isReturningUser() + a seen flag.
5. **Mobile comfort pass** — tap targets to 44px etc. (audit verdict: Case A,
   usable-but-cramped, not flow-blocking — so it's here, not P0).
6. **Topic Mastery radar** — optional, after progress bars prove out.

Mobile and radar are deliberately *below* the spine work: the audit confirmed
mobile is comfort-level (no overflow, flow completes), and the retention question
is answered by the spine, not by CSS. See [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md).
