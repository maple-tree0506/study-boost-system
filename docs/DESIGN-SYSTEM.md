# StudyBoost — Design System ("Signal Blue")

The visual direction borrows the graphic grammar of modern Japanese RPG menus (flat
poster blue, huge type, diagonal cuts, fast slanted wipes) and the instrument look of
observatory charts. Nothing is copied: no characters, logos, screenshots, or game
assets. How the direction was chosen (three prototypes, compared on impact, maturity,
brand distinctiveness, readability, phone fit, cost, and long-session comfort) is in
`docs/REDESIGN-PROGRESS.md`.

## The one idea

**The review rings.** Concentric rings are spaced at real SM-2 intervals (1, 6, 15, and
38 days). On Home and Review they are a live chart, the **Review Orbit**: each saved
mistake is a dot; its angle is its course (one sector per course, sized by how many
mistakes it holds); its distance from the core is the number of days until SM-2 brings
it back; everything due now sits in the core. Positions are deterministic, so the same
data always draws the same picture. The same rings appear in the logo and the page
background, so the brand mark and the spaced-repetition idea are one thing.

## Grammar

1. **Field.** The poster blue (`--field`) holds one thing per page: the key real number
   and the next action. At most one field region per view (Home: the command center;
   Review: the selected mistake; Practice: the band's question number, then the results;
   the mistake page: the knowledge point).
2. **Slab and ink.** Black (`--black`) frames, list rows on the field, and the orbit's
   backdrop. Ink (`--ink`, `--navy`, `--panel`) is the working surface for anything read
   for more than a few seconds: questions, notes, lists.
3. **Signal.** The next action is the one bright filled slab in its region: white on the
   field (`--signal-on-field`), cyan on ink (`--signal-on-ink`). Secondary actions are
   outlines or text links. Never two bright slabs side by side.
4. **Numerals.** Big Shoulders numerals are always real counts from the student's own
   data (due count, question index, score, days). No decorative numbers.
5. **Slant.** One slant (`--slant`) for buttons, rows, chips, and meters. Study content
   (questions, options, formulas, notes, explanations) is never slanted, rotated, or set
   in display type: the shape surrounds the content.
6. **Instrument layer.** Charts use hairline rings and ticks, plain-language labels, a
   legend, and a written rule ("angle = course, distance = days until review").
7. **Editorial hierarchy.** Kicker (small caps) → headline → dek → numbered list →
   action. Pages differ in composition, not in vocabulary.
8. **Motion explains state** (page wipe, dots settling, result rows arriving in order),
   never blocks input or hides content, and stops under reduced motion.

## Color

Tokens live at the top of `css/styles.css`.

| Token | Hex | Use |
|---|---|---|
| `--black` | `#02050B` | Rail, slabs, text on blue |
| `--ink` | `#050A14` | Page background, inputs |
| `--navy` | `#071426` | Sunken areas inside a sheet, readouts |
| `--panel` | `#0C1E38` | Sheets and cards |
| `--raise` | `#122A4C` | Selected rows, key badges at rest |
| `--line` | `#2B4D78` | Control borders, empty bar tracks, rules |
| `--royal` | `#0B36B2` | Subject tags, page wipe |
| `--field` | `#0C97E6` | Poster blue: band, command center, selected mistake, results |
| `--cyan` | `#00D9FF` | Signal on ink, links, selection, chart data |
| `--white` | `#F5F8FF` | Main text; signal on the field |
| `--mute` | `#A9BAD2` | Secondary text |
| `--good` / `--warn` / `--bad` | `#3CF2C0` / `#E6F24A` / `#FF5C7A` | Status only |

Rules:

- Text on `--field` is **always black** (6.4:1). White on it is only 3:1.
- Status colors mean state, never decoration, and always sit beside a word or number.
  `--warn` is "due now" everywhere (nav badge, orbit core, Due tags, Coming up "now").
- The orbit lives on black, not blue: yellow and mint dots fail 3:1 on `--field`.

## Type

| Face | Role |
|---|---|
| Big Shoulders Bold | Display only: page names, headings, big numbers, key-point numbers |
| Instrument Sans | Everything you read: questions, answers, forms, buttons, kickers |

Both are SIL OFL, subset to Latin, and self-hosted in `assets/fonts/` with their licenses.
`font-display: optional` plus preloads for the three faces used above the fold: the fonts
are normally ready for the first paint, and a slow first visit keeps the fallback rather
than re-flowing the page (a late swap shifted the whole Home view, CLS 0.25).

## Space and shape

- Spacing scale `--s1`..`--s8` (4, 8, 12, 16, 24, 32, 48, 64 px).
- Sheets have one chamfered corner (`clip-path`). Rows and buttons lean by `--slant`.
- Buttons draw their slanted shape on `::before` and `::after`. The button element stays
  a plain rectangle, so its focus outline is never clipped, and `app.js` can keep reading
  `ev.target`. **Do not add child elements to buttons rendered by `app.js`.**
- Option key badges (A–D): the radio input sits invisibly over the badge, so clicks,
  keyboard focus, and tests still use the real input.

## Components

| Component | Where | Notes |
|---|---|---|
| Command center (`.command`, `#nextStep`) | Home | Field + black orbit slab; headline carries the real count; one white signal; a quiet second move |
| Review Orbit (`orbitSvg` in `app.js`, rules in `js/review-orbit.js`) | Home (passive), Review (interactive) | Sectors, rings, core, state-coloured dots, labels, legend; nodes focusable (arrows, Enter) |
| Selected-mistake card (`.od-card`) | Review | Field blue; "Review it now" (signal) + "Practice similar" |
| Set bar (`.score-banner`) | Practice | Set meta (course, topic, level, source), numbered cells that navigate, score, Change set |
| Question card (`.qa-card`) | Practice, mistake page | One at a time; key badges; feedback, answer, explanation; Previous / Next |
| Result sequence (`.completion-card`) | Practice | Score, XP, every question in order (Right / Not yet), missed items with actions |
| Readouts (`.readout`) | Review | Number + label + status-coloured top rule |
| Chips (`button.chip`) | Review | `aria-pressed`; counts in the label |
| Ledger (`.mission`) | Home | Label, count, thin slanted meter |
| Coming up (`.week-bars`) | Home | Reviews per day for the next 7 days (SM-2 days from now) |
| Key points (`.key-points`) | Notes | Numbered 01, 02… in display numerals |
| Top line (`.top-line`) | Progress | One plain sentence about the last 7 days, from graded answers only |
| Folded panel (`.dev-panel`) | Setup | Developer configuration, closed by default |

## Layout

```
desktop  >= 1100px    rail | rotated band | content
tablet   720-1099px   icon rail | horizontal band on top (command stacks below 960px)
phone    < 720px      horizontal band on top, tab bar at the bottom
```

The giant band word repeats the page name and is `aria-hidden`; every view also has a
real heading, now compact (the band already shows the name). During a practice set the
band shows the real question number ("02 / 07"), then the score (`Shell.setBand`).
Checked sizes: 1920x1080, 1440x900, 1366x768, 1024x768, 768x1024, 390x844, 320x640.

## Motion

CSS plus the Web Animations API. No animation library (no build step).

| Moment | Where |
|---|---|
| First load: band and command cut in from the left, rings turn in | `.boot` in CSS |
| Page change: three slanted panels, under 0.6s | `transitionTo` in `js/shell.js` |
| Nav marker: white slip with a slower cyan slip behind it | `.nav-ind` in CSS |
| Orbit dots scale in; bars fill; result rows slide in one after another | keyframes in CSS |
| Busy: slanted stripes in the button, placeholder bars for the set | `[aria-busy]` in CSS |

Entrance motion uses transforms, so content is never invisible while it plays. Only the
ambient rings and busy states run without a person acting. `prefers-reduced-motion`, or
the student's own **Setup → Motion → Reduce motion** (stored in `studyBoostUIPrefsV1`,
applied by a one-line script in `<head>` before the first paint), turns off the wipe and
all movement; state changes stay.

## Accessibility states

- Focus: 2px outline, white on ink, black on the field; never clipped (buttons are plain
  rectangles under their slanted pseudo-elements).
- Selected: `aria-pressed` on chips, orbit nodes, and list items; `aria-current="step"` on
  the current question cell; `aria-current="page"` on the nav link.
- Live regions: every status line (`.status`), the selected-mistake card, the library
  count.
- Keyboard: Practice A–D / 1–4 choose, Enter checks or moves on, N next (never while
  typing in a field); Review Orbit arrows/Home/End move, Enter/Space select.
- Touch targets: 44px tall on phones (set cells 40x44).

## Data honesty

Every number on screen comes from the student's own activity. Empty states say what to
do, and no accuracy shows until something has been graded (`–`, not `0%`). Mission
targets are fixed goals in `js/home-summary.js`. They award no XP and no achievements.

- Where questions came from is always said: the set bar names the source (AI-generated,
  built-in question bank, or due reviews), and built-in questions never claim to come
  from the student's notes.
- The offline Notes summary is labelled as "your own lines, cleaned up", not as AI.
- The radar on Progress only appears with 5+ topics; fewer would draw a shape that says
  less than the bars.
- On the mistake page, an **Answer checked** tag appears only when a program recomputed
  the answer key; a quantitative question without that check says **Not machine-checked**;
  a likely error shows its confidence and basis, or says "Not enough information to say".
