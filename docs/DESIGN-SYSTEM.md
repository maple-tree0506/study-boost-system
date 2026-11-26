# StudyBoost — Design System ("Cut Poster", V4)

The art direction borrows the principles of strong game-menu art direction: whole-screen
composition, type and image built as one thing, asymmetric division of the screen, huge
contrasts of scale, and a rhythm to every change of state. It takes the principles only:
no menus, characters, logos, illustrations, music, or signature transitions are copied.
How the direction was chosen (two Home compositions compared on the same content and
viewports) is in `docs/REDESIGN-V4.md`. The previous system ("Signal Blue") is recorded in
`docs/REDESIGN-PROGRESS.md`.

## The one idea

**The cut.** Every page is a composition of flat planes divided by one steep diagonal: a
blue plane that carries the page's name or its headline, the dark desk, and a warm white
paper sheet where reading and answering happen. Big type is cropped by the planes. The
**review rings** (SM-2 intervals at 1, 6, 15, and 38 days) stay the brand's other mark and
the Review page's real map: the same rings sit on Home's dark desk and, on the result
poster, carry the set's questions as numbered dots.

## Three kinds of page

| Density | Pages | What it does |
|---|---|---|
| Poster | Home, Results | Strong composition: a giant real number or one giant word, planes, the one action on the paper |
| Map | Review | The day's task first (due count, Start review), then the orbit and the library as places to look and filter |
| Workbench | Practice, the mistake page, Notes | Quiet: the question or text on a paper sheet with room to read; the masthead and set bar carry the context |

## Grammar

1. **Planes.** Blue (`--field`) carries a headline or page name in black. Paper
   (`--paper`) carries the action on posters and all study content on workbenches. The
   dark desk (`--ink`, `--black`) carries navigation, meta, and data charts. An
   off-register royal edge (`--royal`) runs beside a cut, like a second printing.
2. **One cut.** Plane edges are steep diagonals. Buttons, rows, chips, and meters keep the
   small slant (`--slant`). Study content (questions, options, formulas, notes,
   explanations) is never slanted, rotated, or set in display type.
3. **Scale.** One giant element per screen: a real number (due count, question number,
   score, set progress, accuracy) or the page's name in the masthead. Everything else is
   set at reading size. Big Shoulders numerals are always real data; product facts are
   written in words.
4. **Crop.** Big type may be cropped by its plane's edge or the page edge. It never crosses
   from its plane onto another one in the same colour (black on the dark desk disappears),
   so its size is tied to the plane's width (Home's word: 16.4% of the poster's width;
   the masthead word: `clamp(120px, 13vw, 210px)`, so PROGRESS ends before the heading).
5. **Signal.** The next action is the one solid slab in its region: black on paper and on
   blue, cyan on the dark desk. Secondary actions are outlines or text links. Never two
   solid slabs side by side.
6. **Print.** A paper sheet sits on a solid offset "print" (blue behind a question, black
   behind the result poster). After a check the print turns to the state's colour.
7. **Instrument layer.** Charts keep hairline rings, plain labels, a legend, and a written
   rule ("angle = course, distance = days until review").

## Surfaces and tokens

Tokens live at the top of `css/styles.css`.

| Token | Hex | Use |
|---|---|---|
| `--black` | `#02050B` | Top bar, slabs, set bar, text on blue and paper |
| `--ink` | `#050A14` | The dark desk (page background) |
| `--navy` / `--panel` / `--raise` | `#071426` / `#0C1E38` / `#122A4C` | Dark sheets and sunken areas |
| `--line` | `#2B4D78` | Decorative rules and tracks (1.94:1 on panels) |
| `--control-edge` | `#527AAD` | Edges that identify a control (3.77:1 on panels) |
| `--royal` | `#0B36B2` | Off-register edge, subject tags; the accent on paper |
| `--field` | `#0C97E6` | The blue plane (black text 6.4:1) |
| `--cyan` | `#00D9FF` | Signal and links on the dark desk |
| `--paper` / `--paper-sunk` | `#F2F0EA` / `#E6E2D8` | The reading and answering sheet (black text 17.9:1) |
| `--white` / `--mute` | `#F5F8FF` / `#A9BAD2` | Text on dark (flipped on paper) |
| `--on-dark` | `#F5F8FF` | Text on a dark fill inside paper; never flipped |
| `--good` / `--warn` / `--bad` | `#3CF2C0` / `#E6F24A` / `#FF5C7A` | Status fills (black text on them) |
| `--good-ink` / `--warn-ink` / `--bad-ink` | bright on dark; `#0B6B4F` / `#6B5E00` / `#B0163A` on paper | Status written as text or drawn as a thin line |

**Paper is a scope, not a set of copies.** `.paper`, the practice question sheet, the
mistake's original question, the similar-question card, the Notes output, and dialogs
redefine the text, line, surface, control-edge, and status-ink tokens, so every component
inside them (feedback, answers, tags, inputs, focus outlines, buttons) adapts without a
paper-only rule. Every text colour on paper is at least 4.5:1; control edges are 4.9:1.

Rules:

- Text on `--field` is always black. White on blue is only 3:1, so it is not used.
- Status colours mean state, never decoration, and always sit beside a word or number.
  Right and wrong also differ in shape: solid versus dashed lines, mint versus paper dots.
- Plane elements are sized to their own region (the polygon is in the box's coordinates),
  so text beside a plane is never on it and contrast checks see the real background.

## Type

| Face | Role |
|---|---|
| Big Shoulders Bold | Display only: page names, headlines, big real numbers, navigation |
| Instrument Sans | Everything read: questions, answers, forms, buttons, kickers, labels |

Both SIL OFL, subset to Latin, self-hosted. `font-display: optional` with preloads; the
display fallback is width-matched (`Big Shoulders Fallback*` faces with `size-adjust` over
Arial/Liberation/Helvetica, Roboto, and DejaVu), so a slow first visit keeps the same line
breaks and the Home button stays in the first screen (checked at 320×568, 390×844,
1100×768, and 1440×900 with the font files blocked).

## Layout

```
desktop  >= 1100px   top bar (brand, nav, level) | masthead: blue plane + giant page name, heading on the dark side
tablet   720-1099px  top bar (no level) | masthead plane above the heading
phone    < 720px     slim masthead strip on top, tab bar at the bottom
```

- **Masthead** (`.band`): a blue plane cut on the diagonal, the page's name set huge and
  cropped by it (`aria-hidden`). On desktop the page's real heading sits on the dark side
  of the cut; on smaller screens below it. During a set the plane carries the real
  question number ("02 / 07") and then the score (`Shell.setBand`). Home has no masthead:
  it is its own poster.
- **Home poster**: blue plane with the headline (first visit: the giant word PRACTICE and
  a black slab "that brings back what you miss."; returning: the real count or figure,
  the words, and what is due), the orbit on the dark desk, and a paper plane that holds
  the one action. Under 960px the planes become the blocks' own backgrounds, so the paper
  always starts under the headline.
- **Practice**: the setup is a paper form (course and topic first, the start button under
  them, the set's options beside them; on a phone the start button stays above the tab
  bar). During a set the page tightens: the set bar under the top bar, the question on a
  paper sheet, the page heading and date hidden on a phone (the heading stays for screen
  readers).
- **Results**: a paper poster; the score is the centre of gravity on a blue cell with the
  set's questions as numbered dots on a ring; then each skill's evidence and the next step;
  then missed questions, the full list, XP, and sharing.
- **Review**: the Today card (giant due count, Start review) first, then filters, the
  orbit (or list), the selected mistake, and the library. The review queue and the mistake
  page put the question on paper and the queue bar above it.

Checked sizes: 1920×1080, 1440×900, 1366×768, 1100×768, 1024×768, 768×1024, 390×844,
320×640, 320×568. No horizontal scroll at any of them.

## Motion

CSS plus the Web Animations API; no library.

| Moment | Where |
|---|---|
| First load: the masthead plane and Home's planes cut in; the copy rises a few pixels | `.boot` in CSS |
| Page change: blue, paper, and black planes slash across on the cut, under 0.6s | `transitionTo` in `js/shell.js` |
| Nav marker: a white slip with a blue slip trailing, off-register | `.nav-ind` |
| Wrong answer: the sheet takes one short knock sideways and its print turns red | `jolt` |
| Result: the score lands like a stamp; the ring's dots pop in order | `stamp`, `dotIn` |
| Orbit dots, bars, result rows | keyframes in CSS |

Entrance motion uses transforms, so content is never invisible while it plays; only
decoration (the aria-hidden masthead, Home's empty planes) is ever clipped, and Home's button
is on screen and takes a tap from the first frame (end-to-end test). Frequent
actions (choosing an option, checking, moving between questions) respond at once. The
transition layer never takes clicks and never holds focus. `prefers-reduced-motion` or the
student's **Setup → Motion → Reduce motion** turns all movement off; the static
compositions keep their tension (planes, crops, scale) without it.

## Accessibility states

- Focus: 2px outline; white on dark, black on blue and paper (paper flips the token).
- Selected: `aria-pressed` on chips and orbit nodes; `aria-current="step"` on the current
  question cell; `aria-current="page"` on the nav link. A chosen option gets a black 2px
  frame and a black key.
- Live regions: every status line, the selected-mistake card, the queue bar, the library
  count.
- Keyboard: Practice A–D / 1–4, Enter, N (never while typing); orbit arrows/Home/End,
  Enter/Space.
- Touch targets: 44px on phones (tab bar 60px, set cells 40×44, formula buttons 44×44);
  orbit dots get up to 44px of invisible target without overlapping neighbours.

## Data honesty

Unchanged from earlier rounds: every number on screen is the student's own (`–`, not
`0%`, before data), the source of questions is always named, skill levels come only from
tagged questions with their evidence, and the offline Notes output is called an excerpt.
The result ring and the Home figures draw only real results and counts.
