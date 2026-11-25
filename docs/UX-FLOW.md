# StudyBoost — UX Flow

## v3: the flagship redesign (November 2026)

The spine below (v2) still holds. v3 changes what each screen puts first, so a returning
student never has to look for their next task. Evidence and decisions:
`docs/REDESIGN-PROGRESS.md`. Visual rules: `docs/DESIGN-SYSTEM.md`.

| Screen | First thing on screen | The one action (signal) | Also there |
|---|---|---|---|
| **Home, first visit** | "Turn your notes into adaptive practice." | Start studying | Welcome card (the 4-step loop), empty orbit with a caption |
| **Home, returning** | The real next task: "4 questions are due" with the due list, or a weak topic's recent accuracy, or days to the next review | Start review / Practice similar questions / Practice this / Start a new set | A quieter second move (the weak topic after the reviews), the passive orbit (links to Review), missions ledger, Coming up (reviews per day, 7 days) |
| **Practice, setup** | Course, format, difficulty, topic, notes toggle | Generate Practice Questions | Status line says where questions come from (AI, built-in bank, due reviews) and whether notes were used |
| **Practice, focus** | One question; the band shows "02 / 07" | Check answer, then Next question | Set bar (meta, numbered cells that navigate, score, Change set); keys A–D / 1–4, Enter, N |
| **Results** | "Set complete." with the score | Review My Mistakes (or Start a new set when perfect) | Every question in order (Right / Not yet), XP and level, topic growth, missed questions with See the answer / Practice similar. The last answer's explanation is read first; results open on "See results" |
| **Review** | The orbit: every saved mistake by course and days until review; the soonest-due one selected | Review it now (on the selected mistake) | Filters (All / Due now / Next 7 days / Later, course), chart or list, readouts, legend |
| **Mistake Library** (on Review) | Cards for the filtered mistakes, soonest due first | Forgot / Hard / Got it (with the interval each sets) | Search, sort, Practice similar, Delete (confirmed), Clear log (folded away) |
| **Mistake page** | The original question with the student's pick, what it tests | Generate / Check a similar question | Unchanged flow (see VARIANT-PRACTICE.md); options now use the same key badges as Practice |
| **Notes** | The student's notes (the manuscript) | Generate Summary, then Practice these notes | Summary page says how it was made (AI or offline lines) and numbers the key points |
| **Progress** | One plain sentence about the last 7 days | (none: a reading page) | Readouts, by subject, by practice type, 14-day bars with counts, topic mastery (radar only with 5+ topics) |
| **Setup** | Motion setting and Your data | Download my data | AI connection folded away for whoever runs the server |

---

## v2 (kept for history)

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

**Branch from Review: similar-question practice.** Each saved mistake has its own page
(`#mistake/<id>`, "Practice similar" on the card, recommended weakest-topic-first above the
log, and offered as Home's next step when no review is due). It shows the original with the
student's pick, what it tests, and a practice strip: similar questions whose difficulty
follows a 2-up/1-down staircase, immediate feedback naming the misconception behind the pick,
the topic-mastery change, and what happens next (the original's spaced review stays on
schedule, moved up after a miss). See [VARIANT-PRACTICE.md](VARIANT-PRACTICE.md).

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
   usable-but-cramped, not flow-blocking — so it's here, not P0). **Shipped:** one
   <=640px block bumps buttons/inputs/selects/toggles/CTAs to 44px and form text to
   16px (no iOS focus-zoom); verified at 360px (no overflow) and desktop unchanged.
   Real-device pass on actual MIUI hardware still pending beta feedback.
6. **Topic Mastery radar** — optional, after progress bars prove out. **Shipped:**
   a hand-rolled SVG radar (no charting lib) sits above the bars, plotting each
   topic's recent accuracy so the knowledge "shape" reads at a glance; renders with
   >=3 topics, caps at 8, bars remain the accessible detail (role="img" + aria-label).

Mobile and radar are deliberately *below* the spine work: the audit confirmed
mobile is comfort-level (no overflow, flow completes), and the retention question
is answered by the spine, not by CSS. See [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md).
