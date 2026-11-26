# V5 visual redo: "Orbit Field"

The second full-site visual redo, after V4 "Cut Poster" (`docs/REDESIGN-V4.md`). Brief: the
art-direction nerve of strong game menus (type that takes part in the whole-screen
composition, graphics that tie regions together, state changes you can read in the
picture), turned into StudyBoost's own language. Home and the result each get one
memorable image; the Review Orbit makes real review data part of the brand; answering,
reading, and settings stay quiet. Only principles were borrowed: no menus, characters,
logos, art, or sounds were copied.

Grading, skill attribution, strict topic sets, SM-2, similar questions, continue, result
restore, upload retries, backups, privacy, data sent or stored, and the API are unchanged.
New learning modes, rules, or services are follow-ups (section 7).

Design rules: `docs/DESIGN-SYSTEM.md`. Images: `docs/redesign-v5/` (index in section 6).

## 1. Baseline

- Working copy: branch `claude/zen-ramanujan-t57aza` at `bf379a2`, the same tree as `main`
  (`d11d944`) and as the deployed site (checked file by file); clean working tree, no user
  changes to keep separate.
- `tests/visual/capture.js`, isolated server and throwaway database, labelled fixtures
  (`tests/visual/fixtures.js`), seeded question draw. 16 states, 45 screenshots; no page
  errors, no horizontal overflow in 72 size checks, no axe violations.
- Viewports: desk 1440×900, laptop 1366×768, laptopS 1100×768, tabletP 768×1024, phone
  390×844, small 320×568, xl 1920×1080.
- Content of the key states:
  - **Home, first visit**: empty fixture (no mistakes, no answers).
  - **Home, returning**: 14 saved mistakes in 7 courses, 4 due now (Physics 1 momentum,
    Biology enzymes, two Calc AB chain rule), level 4, 4-day streak.
  - **Answering**: Calc AB, topic "Derivatives", Medium, "3 multiple choice + 2 short
    answer"; the built-in bank gives 5 new + 2 due reviews; question 1 answered right,
    question 2 (a due review) on screen.
  - **Results**: Calc AB, 5 multiple choice + 2 due reviews, answered alternately right
    and wrong: 5 of 7, questions 4 and 6 missed.
  - **Review**: the returning fixture (14 mistakes: 4 due, 6 in the next 7 days, 4 later);
    dense: 160 mistakes, 51 due.

## 2. Two directions, same content

Light mock-ups with the real fonts and copy, at 1440×900 and 390×844: Home first visit,
Home returning (2 due), and the result's key area (5 of 7, 4 and 6 missed)
(`docs/redesign-v5/proto-*.jpg`).

| | A: type leads | B: orbit leads |
|---|---|---|
| Idea | The giant word crosses a vertical blue block and inverts where it does; the orbit is a small mark | The review orbit organises the screen: the 15-day ring is a blue disc, the 38-day ring runs across the headline, the core holds the action |
| First-screen action | Clear, but pushed into a corner of the blue column; a large void on the phone | The rings converge on the core, and the button is the core: the picture points at the action on desktop and phone |
| Static tension | Strong, but V4 already is a giant word on a blue/black split | A new whole-screen geometry; the headline turns black where it enters the disc |
| Results in the same language | The blue field's width is the share of right answers; the tally row reads like a form | A horizon arc, one segment per question (missed ones dashed and numbered), the score under it: a different composition from Home, made only of the set's data |

**Decision: B.** It answers what the brief says V4 already did (big type, the cut, the
blue/black split) with a different geometry, makes the action the point the picture is
drawn around, and makes the real orbit the brand's anchor. From A, one rule was kept:
display type inverts where it crosses a field.

## 3. What changed, by scene

Pairs are the same state, data, and viewport (`docs/redesign-v5/<state>-<vp>.jpg`, V4 left).

**Home.** V4: a blue plane with PRACTICE, a paper wedge with the button, the orbit small
on the dark. V5: the real review orbit at poster scale. Its 15-day ring is the blue disc,
the 1- and 6-day rings are black hairlines on it, the 38-day ring runs out across the
headline, and the core is black and holds the next action. PRACTICE turns black where it
enters the disc and stops before the core. The description stays on the dark. A
returning student's cards are real dots: due ones round the core's edge (yellow), the rest
on their day rings. The headline carries the real count and the due list sits under it.
Phone: headline, description, then the orbit with the button in its core; the due list
follows the orbit, so the action is in the first screen. First visit: ring labels in
words ("6 days") and one caption explain the orbit.

**Answering.** V4: the masthead carried "02 / 07" at poster size above the question. V5:
the masthead, date, and display heading step aside during a set (the heading stays for
screen readers). The first screen is the set bar (source, place in the set, a row of
question dots) and the question sheet. The sheet has soft corners and a rule along its top
edge: blue while you answer, then green or red with the result's word, the option's
solid or dashed frame, and a short knock on a miss. Long options wrap; long formulas
scroll inside their own box.

**Review.** The due count now sits in a yellow disc (the due colour on the orbit) with a
ring round it, then the words and Start review, then the orbit and the library. The
orbit's rings carry real dates ("6d · Dec 2"), so the chart says when each ring comes
back. Hairline rings and small labels are decoration; the dots with their focus halos
are the only things you can operate. The queue and the mistake page keep their order
(current question, reveal, rating, next; original, your pick, explanation, similar
practice).

**Results.** V4: a blue cell with the score ringed by dots, every skill line beside it.
V5: a paper sheet where the set rises as one arc over the score: one segment per
question, in order, blue for right, a dashed red outline for not yet, each numbered. The
score sits inside the arc. Beside it: one learning line (the skill with the most
questions here, "N more skills below") and the one next step. Then the full skill
evidence, the missed questions, every answer, XP, and sharing. The score and the button
are there from the first frame; the segments arrive once, in order.

**Other pages.** Every page except Home opens on its masthead: a blue disc in the top
corner with two hairline rings running out behind the heading, and the page name set
huge, solid black inside the disc and a blue outline outside it. The date crosses the disc
the same way. Practice setup is a paper sheet with the blue top rule (course, topic,
Start practice; the options in their own column). Notes, Progress, and Settings ("Your
data" first) use the same sheets. The trust pages share the masthead, now load the same
fonts as the app, and keep reading lines under 68 characters.

**Shapes and navigation.** No more slants. Buttons and chips are capsules, keys and set
cells are circles, sheets have soft corners, list bullets are dots. The nav marker is a
white capsule with a small blue dot that follows it (a body on its orbit). The page
change is a blue disc that grows out of the page you leave and closes into the page you
open, under 0.5 s.

## 4. Implementation notes

- **Inverted type** (`[data-invert]`, `Shell.fitInverts`): one copy of the text, painted
  through a radial gradient centred on the disc (`background-clip: text`). `shell.js`
  measures the disc and the text and sets `--ix --iy --ir` on resize, font load, view
  change, size change, and after entrance animations. Without it the text keeps its own
  colour. The masthead word's geometry is fixed, so its gradient is worked out in CSS
  (it also works on the trust pages, which have no script). Windows high contrast mode
  drops the gradient.
- **Home geometry** (`.command`): `--R` (disc radius, the 15-day ring), `--W = 2.7378 R`
  (the orbit drawing's width, so its 15-day ring lands on `--R`), and `--core = .426 R`. The
  headline's size comes from the space before the core: PRACTICE is 3.26 em, or 3.42 em
  in the width-matched fallback.
- **Orbit drawing** (`orbitSvg` in `app.js`): new options `disc` (fill the 15-day ring),
  `core` (core radius), `dueRim`, and `ticks` (`days`, `dates`, `words`).
  `ReviewOrbit.layout` gained `dueRim`, which puts due cards evenly round the core's edge
  so the middle stays free for the action (unit test added). Review's default layout is
  unchanged.
- **Results**: `resultArcSvg()` replaces `resultRingSvg()`. `growthRows()` feeds both the
  lead line (`growthLeadHtml`) and the full list (`masteryGrowthHtml`), so they never
  disagree. The card's DOM order follows the reading order: score, lead, next step, detail,
  missed, sequence, XP, actions, sharing. Recommendation and scoring code are unchanged.
- **Answering compression**: `body:has(#view-practice[data-mode=focus|results])` hides
  the masthead and date and makes the heading screen-reader-only, at every size.
- **First load**: the discs never move. Rings open around them and the copy rises a few
  pixels, so inverted type stays aligned and the action takes a tap from the first frame.

## 5. Verification

Run on 26 Nov 2026 in this container: Linux, Chromium 158 via Playwright 1.63, Node 22,
Python 3.13.

| Check | Result |
|---|---|
| `pytest -q` | 241 passed |
| JS unit tests (explicit list) | 122 passed (121 + 1 new for `dueRim`) |
| End to end, KaTeX CDN blocked | 38 of 38 passed |
| End to end, local KaTeX | 38 of 38 passed |
| Capture harness: 16 states, 45 screenshots | 0 page or console errors |
| Horizontal overflow, 9 sizes from 320×568 to 1920×1080 | 0 in 72 checks |
| axe-core (WCAG 2.x A/AA tags) | 0 violations in 16 states |

**Tests changed in this round**:
- The Home-button test's V4 rule "the headline stays out of the orbit column" became V5's
  rule. On wide screens the headline stops before the core, the part on the disc is
  inverted, and the description stays off the disc. On narrow screens the description
  sits above the disc. The button checks (fully on screen, nothing over its centre, real
  and fallback fonts, 4 sizes) are unchanged.
- One unit test was added for `dueRim`.

**Home button**: fully on screen and clickable at 320×568, 390×844, 1100×768, and
1440×900, with the real fonts and with the font files blocked (end-to-end test).

**Text enlargement**: Chromium has no text-only zoom, and the CSS sizes text in px, so
browser zoom is how text gets larger here. At 200% zoom (1440×900 and 1280×800, i.e.
720×450 and 640×400 CSS px at 2× density):
- no sideways scroll on any page;
- Home's button scrolls into view and takes the click;
- Tab reaches it, and the focused button is clear of the fixed bar;
- a question is answered with the keys 1 and Enter;
- the feedback is visible under the set bar.

400% zoom (320 CSS px) is covered by the 320×568 checks.

**Full flow at 390×844** (`flow-phone.jpg`, isolated server and database): open, start a
strict-topic set, miss a question and read the explanation, the result arc, a similar
question (the built-in generator, an AI-free supported skill), the due review in the
queue, Review after the queue, Progress. 0 page errors.

The unsupported case (a non-calculus mistake offline says similar questions need the AI)
is an end-to-end test. So are strict topic sets, an unfinished set (continue; replace
after confirming; a failed request keeps it), and a finished set restored after a refresh
without re-scoring.

**Empty, loading, and failure states**:
- Empty states (first-visit Home, empty Progress) are captured.
- Loading and error states (`states-phone.jpg`, network answers stubbed in the browser)
  were checked: similar questions building (button busy and disabled), refused (429),
  server unreachable, and Progress offline. 0 page errors.

**Reduced motion**: six key states recaptured with the OS setting.
- Home and Review are pixel-identical to the normal capture.
- The result and answering states differ only in where the page is scrolled (an instant
  jump instead of a smooth scroll).
- Planes, discs, crops, scale, and state colours are the same. The score and the next step
  are just as strong without motion.

The in-app Reduce motion setting is applied before the first paint (end-to-end test).

**Keyboard and focus**:
- The 2px focus ring is light on the dark (Home's button, the nav) and dark on paper (a
  keyboard-focused option frames the whole row).
- On a phone, the focused control is clear of the tab bar (button bottom 624 px, bar top
  784 px).
- The transition layer never takes clicks or focus.

**Not tested here**:
- real phones and tablets (only Chromium emulation);
- Safari/WebKit and Firefox (including `background-clip: text` rendering and text-only
  zoom);
- screen readers (only the accessibility tree and axe);
- Windows high contrast mode (a rule is in place, unverified);
- the AI path with a real provider key.

## 6. Image index (`docs/redesign-v5/`)

| File | What to look at |
|---|---|
| `proto-first-1440.jpg`, `proto-first-390.jpg` | The direction choice, first visit: A (type leads) beside B (orbit leads, chosen) |
| `proto-returning-*.jpg`, `proto-results-*.jpg` | The same comparison for a returning student and for the result's key area |
| `home-first-desk.jpg`, `home-first-phone.jpg` | Home first visit: the orbit poster, PRACTICE inverted inside the disc, the button in the core |
| `home-first-fallback-small.jpg` | 320×568 with the font files blocked: the button still in the core, above the tab bar |
| `home-returning-desk.jpg`, `home-returning-phone.jpg` | Returning: the real count, due cards round the core, scheduled ones on their rings; on the phone the list follows the orbit |
| `practice-active-desk.jpg`, `practice-active-phone.jpg` | Answering: no masthead, the set bar and the question first, the state rule on the sheet |
| `practice-extreme-phone.jpg` | Long stem, long options, and formulas on a phone |
| `practice-setup-desk.jpg`, `practice-setup-phone.jpg` | The setup sheet |
| `practice-complete-desk.jpg`, `practice-complete-phone.jpg` | The result: the horizon arc of real answers, the score, one learning line, one next step |
| `review-desk.jpg`, `review-phone.jpg` | Review: the due-count disc and Start review first, then the orbit with dated rings |
| `review-queue-desk.jpg`, `review-queue-phone.jpg` | The queue: one mistake at a time |
| `mistake-phone.jpg` | The mistake page and its similar question |
| `notes-desk.jpg`, `progress-desk.jpg` | The masthead disc with the page name inverted inside it |
| `flow-phone.jpg` | The full loop at 390×844 |
| `states-phone.jpg` | Loading and error states |

## 7. Follow-ups noted, not done here

- A "try 3 questions" quick start on first visit (a new entry flow).
- Dots on Home's orbit that open their mistake directly (a new action on Home).
- A short status line during a set on phones (the source line can run to four lines; its
  content is a data-honesty rule from an earlier round, so it was not cut).
- Progress "Focus next" topics as direct practice links; a unit-to-skill picker.
- Similar questions that change representation; accounts and sync.
