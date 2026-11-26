# StudyBoost — Design System ("Orbit Field", V5)

The art direction borrows three abilities from strong game-menu art direction: type that
takes part in the whole-screen composition, graphics that tie different regions together,
and state changes that you can read in the picture. Only the principles were taken: no
menus, characters, logos, art, or sounds were copied. How the direction was chosen (two
directions compared on the same content and viewports) is in `docs/REDESIGN-V5.md`.
Earlier systems: V4 "Cut Poster" (`docs/REDESIGN-V4.md`) and V3 "Signal Blue"
(`docs/REDESIGN-PROGRESS.md`).

## The one idea

**The orbit.** StudyBoost's review schedule is a set of rings: SM-2 brings a mistake back
after 1, 6, 15, and 38 days. Those real rings are the structure of the screens:
- the 15-day ring is the brand's **blue disc**;
- the **core** holds the next action or a real number;
- the outer rings run out across the page as hairlines and tie the headline to the action;
- the student's own cards sit on the rings as **dots**.

Display type that crosses the disc **turns black inside it**.

## Three kinds of page

| Density | Pages | What it does |
|---|---|---|
| Poster | Home, Results | One memorable image built from real data: Home's orbit with the action in its core; the result's horizon arc, one segment per answer |
| Map | Review | Today's task first (the due count in a disc, Start review), then the orbit with dated rings and the library |
| Workbench | Practice, the queue, the mistake page, Notes, Progress, Settings | Quiet: paper sheets with room to read; the masthead disc and the set bar carry the context |

## Grammar

1. **Disc.** The blue disc (`--field`) is the 15-day ring. On Home it is the poster's
   centre; on every other page a disc sits in the masthead's corner. Its core is black
   (`--black`) and holds one thing: the next action or a real number.
2. **Rings.** Hairline rings (`--line`, `--control-edge`) are the other intervals. They
   run past the disc and behind headings, so the page's regions read as one picture.
   Rings are decoration; only dots are data.
3. **Inverted type.** Display type that crosses a disc is solid black inside it and keeps
   its own colour (white, or the masthead's blue outline) outside. Reading text never
   crosses a disc.
4. **Scale.** One giant element per screen: a real number (due count, score, accuracy,
   set progress) or the page's name in the masthead. Everything else is reading size. Big
   Shoulders numerals are always real data.
5. **Signal.** The next action is the one solid capsule in its region: cyan on the dark,
   black on paper. Secondary actions are outlines or text links.
6. **Paper.** Reading and answering happen on paper sheets (`--paper`) with soft corners
   and a 7px rule along the top edge. The rule is blue while the sheet waits for you, and
   the result's colour after a check.
7. **Shapes.** Controls are capsules (`--r-cap`), keys and set cells are circles, sheets
   have soft corners (`--r-card`, `--r-row`), and bullets are dots. Nothing slants. Study
   content (questions, options, formulas, notes, explanations) is never rotated, curved,
   or set in display type.

## Surfaces and tokens

Tokens live at the top of `css/styles.css`.

| Token | Value | Use |
|---|---|---|
| `--black` | `#02050B` | Top bar, the core, text on blue and paper |
| `--ink` | `#050A14` | The dark desk (page background) |
| `--navy` / `--panel` / `--raise` | `#071426` / `#0C1E38` / `#122A4C` | Dark sheets and sunken areas |
| `--line` | `#2B4D78` | Hairline rings and rules |
| `--control-edge` | `#527AAD` | Edges that identify a control; the 38-day ring on Home |
| `--royal` | `#0B36B2` | Subject tags; the accent on paper |
| `--field` | `#0C97E6` | The blue disc (black text 6.4:1) |
| `--cyan` | `#00D9FF` | Signal and links on the dark desk |
| `--paper` / `--paper-sunk` | `#F2F0EA` / `#E6E2D8` | Reading and answering sheets |
| `--white` / `--mute` | `#F5F8FF` / `#A9BAD2` | Text on dark (flipped on paper) |
| `--on-dark` | `#F5F8FF` | Text on a dark fill inside paper; never flipped |
| `--good` / `--warn` / `--bad` | `#3CF2C0` / `#E6F24A` / `#FF5C7A` | Status fills; `--warn` is also "due" (dots, the Review count disc) |
| `--good-ink` / `--warn-ink` / `--bad-ink` | bright on dark; `#0B6B4F` / `#6B5E00` / `#B0163A` on paper | Status written as text or drawn as a line |
| `--r-cap` / `--r-card` / `--r-row` | `999px` / `20px` / `16px` | Capsules / sheets / rows |

**Paper is a scope, not a set of copies.** `.paper` and the question sheet, the mistake's
original, the similar-question card, the Notes output, and dialogs all redefine the text,
line, surface, control-edge, and status-ink tokens. So every component inside them adapts
without a paper-only rule. Every text colour on paper is at least 4.5:1.

Rules:

- Text on `--field` is always black. White on blue is only 3:1.
- Status colours mean state and always sit beside a word or a number. Right and wrong also
  differ in shape: a solid versus a dashed frame or segment, and a filled versus an
  outlined number dot.

## Type

| Face | Role |
|---|---|
| Big Shoulders Bold | Display only: page names, headlines, big real numbers, navigation |
| Instrument Sans | Everything read: questions, answers, forms, buttons, kickers, labels |

Both SIL OFL, subset to Latin, self-hosted, preloaded on every page (the trust pages
too). `font-display: optional`; the display fallback is width-matched (`Big Shoulders
Fallback*`), and Home's headline is sized for both (PRACTICE: 3.26 em real, 3.42 em
fallback).

## Layout

```
desktop  >= 1100px   top bar (brand, nav, level) | masthead: disc in the corner, page name, heading on the dark
tablet   720-1099px  top bar (no level) | masthead above the heading
phone    < 720px     slim masthead on top, tab bar at the bottom
```

- **Masthead** (`.band`, aria-hidden): a blue disc in the top corner (`--disc`), two
  hairline rings around it, and the page name set huge. The name is solid black inside
  the disc and a blue outline outside it; the inversion is computed in CSS. The date
  crosses the disc the same way (`data-invert`). During a set and on the result the
  masthead, the date, and the display heading step aside (the heading stays for screen
  readers).
- **Home poster** (`.command`): the review orbit at poster scale, centred at (`--cx`,
  `--cy`). `--R` is the disc's radius, `--W = 2.7378 R` the orbit drawing's width, and
  `--core = .426 R`. The headline may cross the disc but stops before the core. The
  description and the due list stay on the dark. The action sits in the core. Under 960px
  the copy stacks above the orbit, the button is centred on the core, and the due list
  follows the orbit, so the action stays in the first screen.
- **Practice**: the setup is a paper sheet (course, topic, Start practice; the options
  in their own column). During a set the set bar (source, a row of question dots, score)
  and the question sheet take the first screen.
- **Results**: a paper sheet. The horizon arc and the score are on the left; one
  learning line and the one next step on the right; then the full evidence, missed
  questions, every answer, XP, and sharing. On a phone the arc and score come first, then
  the line and the button, before any list.
- **Review**: the Today card (the due count in a yellow disc, Start review), the filters,
  the orbit (rings labelled with their real dates) or the list, the selected mistake,
  and the library.

Checked sizes: 1920×1080, 1440×900, 1366×768, 1100×768, 1024×768, 768×1024, 390×844,
320×640, 320×568, and 200% zoom (720×450, 640×400 CSS px). No horizontal scroll at any
of them.

## Motion

CSS plus the Web Animations API; no library.

| Moment | Where |
|---|---|
| First load: rings open around the masthead disc and Home's orbit; the copy rises a few pixels. Discs never move | `.boot` in CSS |
| Page change: a blue disc (with a black edge ring) grows out of the page you leave and closes into the page you open, under 0.5 s | `transitionTo` in `js/shell.js` |
| Nav marker: a white capsule, and a blue dot that follows it a little later | `.nav-ind` |
| Wrong answer: the sheet's top rule turns red and the sheet takes one short knock | `jolt` |
| Result: the arc's segments arrive once, in order; the score lands like a stamp (both are visible from the first frame) | `segIn`, `stamp` |
| Orbit dots, bars, result rows | keyframes in CSS |

Entrance motion uses transforms (and opacity only on decorative segments), so content
and actions are on screen and usable from the first frame. Frequent actions (choosing,
checking, moving between questions) respond at once. The transition layer never takes
clicks or focus. `prefers-reduced-motion` or the student's **Setup → Motion → Reduce
motion** turns all movement off, and the static pictures stay the same.

## Accessibility states

- Focus: a 2px outline, light on dark and dark on paper (paper flips the token). Home's
  orbit link shows a ring on the disc.
- Selected: `aria-pressed` on chips and orbit nodes; `aria-current="step"` on the current
  question dot; `aria-current="page"` on the nav link. A chosen option gets a black 2px
  frame and a black key.
- Live regions: every status line, the selected-mistake card, the queue bar, and the
  library count.
- Keyboard: Practice A–D / 1–4, Enter, N (never while typing); orbit arrows/Home/End,
  Enter/Space.
- Touch targets: 44px on phones (tab bar 60px, set cells 40×44, formula buttons 44×44).
  Orbit dots get up to 44px of invisible target without overlapping their neighbours.
- Inverted type is one real text node; Windows high contrast mode drops the gradient.

## Data honesty

Unchanged from earlier rounds:
- every number and dot on screen is the student's own (`–`, not `0%`, before data);
- the source of the questions is always named;
- skill levels come only from tagged questions, with their evidence;
- the offline Notes output is called an excerpt.

Home's orbit, the result's arc, and the Review count draw only real records and answers.
The rings' dates are today plus the SM-2 intervals.
