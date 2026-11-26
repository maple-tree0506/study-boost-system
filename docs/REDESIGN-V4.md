# V4 visual redo: "Cut Poster"

A full visual redo of the running site, after the V3 "Signal Blue" redesign
(`docs/REDESIGN-PROGRESS.md`). Goal: a change visible at a glance, with the tension of
strong game-menu art direction (whole-screen composition, type built into the image,
asymmetric division, big contrasts of scale, a rhythm to state changes), producing a
recognisable StudyBoost. Only principles were borrowed: no menus, characters, logos,
illustrations, music, or signature transitions were copied. Grading, question rules, skill
counting, review scheduling, similar-question generation, what is sent or stored,
persistence, and the API are unchanged.

Design rules: `docs/DESIGN-SYSTEM.md`. Before/after images: `docs/redesign-v4/`.

## 1. Baseline

- Branch `claude/zen-ramanujan-t57aza` restarted from `main` at `b64f1f1` (PR #7 merged);
  clean working tree.
- `tests/visual/capture.js` captures labelled states with isolated browser contexts, a
  throwaway database, and fixture data. Two additions made before the baseline so before
  and after are comparable:
  - a fixed random seed (`Math.random` replaced in each page), so the built-in bank draws
    the same questions in the same order on every run;
  - two new states: `home-first-fallback` (the font files never arrive, at 320×568,
    390×844, 1100×768, 1440×900) and `review-queue` (the queue on its first card).
- Baseline: 16 states, 45 screenshots; no page errors, no horizontal overflow, no axe
  violations (WCAG 2.x A/AA tags).

## 2. Two Home compositions, same content and viewports

Light renderable mock-ups with the real fonts and copy, at 390×844 and 1440×900, each
also extended to the returning Home and the result screen
(`docs/redesign-v4/proto-*.jpg`).

| | A: "Cut Poster" (big type, asymmetric planes) | B: "Orbit Architecture" (rings as structure, layered space) |
|---|---|---|
| First visit, desktop | One giant word cropped on a blue plane, the rest of the line on a black slab, the action on a paper wedge | Headline left, a giant blue ring band right, "your misses land here" in the core |
| First visit, phone | Clear: word, slab, then the paper with the dek and button | Clear headline and button; the rings shrink to decoration below |
| Returning | Giant real count; in the mock-up the diagonal crossed the copy (fixable) | Count in the headline; dots in the core |
| Results | A giant cropped score on blue against paper | The score in the core, each question a dot on the ring: strong and data-bearing |
| Change from V3 | Large: V3 already put title left and orbit right; A reorders the whole screen | Smaller: same left/right relationship, scaled up |

**Decision: A**, with B's best idea carried into the results poster (the set's questions
as numbered dots on a ring). A changes the spatial relationship between headline,
content, and orbit that the brief asked to change, reads most clearly on a phone first
visit, and its grammar (planes, crops, paper) extends to every page. B's ring of real
results is the more expressive result screen, so the result poster uses it inside A's
planes.

## 3. What changed, by scene

Pairs below are the same state, same data, same viewport (`docs/redesign-v4/<state>-<vp>.jpg`).

**Home.** V3: the blue command centre on the left, the orbit on a black slab on the right,
navigation in a black rail with a vertical blue page band. V4: no rail and no band; a top
bar, and Home is a full-width poster. First visit: the giant word PRACTICE on the blue
plane, the line finished on a black slab, the paper plane crossing the whole bottom on the
cut, the button on the paper, the empty rings on the dark desk behind it. Returning: the
real count (or the set's progress, an accuracy, days to the next review) at poster size
on the blue, the due list under it, the orbit with its real dots on the dark desk, and the
button alone on the paper. Phone: blue headline block, the paper block (dek, list, button)
always under it.

**Practice, setup and answering.** V3: three selects in a row, the topic below, a dark
sheet. V4: a paper form with course and topic first, "Start practice" directly under the
choice, and the set's options (format, difficulty, notes) in their own column; on a phone
the start button stays above the tab bar. During a set the masthead plane carries the real
question number at poster size, the set bar sits under the top bar, and the question is a
paper sheet with a blue off-register print; after a check the print turns to the state's
colour (a wrong answer also jolts once). Right and wrong options differ by word, colour,
and line shape.

**Review.** V3: the Today card as a dark panel above the chart. V4: the masthead plane
with REVIEW cropped huge; the Today card as a black poster strip with the giant due count
in the due colour and Start review; the orbit, chips, and library as the map below. The
queue and mistake page put the question on paper with the queue bar above it.

**Results.** V3: a blue card with the score and XP side by side and the list below. V4: a
paper poster; the real score lands like a stamp on a blue cell cut on the diagonal, ringed
by the set's questions as numbered dots (mint = right, dashed paper = not yet); to its
right the kicker, title, each skill's evidence, and the one next step; then missed
questions, the full list, XP, actions, and sharing.

**Other pages.** Every page except Home opens on its masthead (the page name cropped on the
blue plane, the real heading beside it on the dark side). Notes' output and the confirm
dialog are paper; Progress shows the learning evidence before level and streak; Settings
lists "Your data" before "Motion"; the trust pages share the masthead.

## 4. Implementation notes

- **Paper scope**: one rule flips the text, line, surface, control-edge, accent, and
  status-ink tokens for paper surfaces, plus button and tag adjustments, so the existing
  components (feedback, answer boxes, tags, inputs, focus outlines) work on paper without
  copies.
- **Status inks**: `--good/--warn/--bad` stay fills; `--good-ink/--warn-ink/--bad-ink` are
  for status written as text or drawn as lines (dark variants on paper, all ≥ 5.7:1).
- **Plane boxes**: the planes' elements are sized to their own regions, with polygons in
  the box's coordinates. With full-size clipped planes, axe measured the text beside a
  plane against the plane (clip-path is ignored by the check), which flagged the heading,
  kicker, and connection chip on every page; with real-sized boxes those findings are gone
  and the backgrounds measured are the ones on screen.
- **Nav marker**: in a horizontal bar a badge that appears after the first paint widens one
  link and moves the next ones; the marker now follows size changes of the row
  (`ResizeObserver`).
- **Result ring**: `resultRingSvg()` in `app.js`, decorative (`aria-hidden`); the list and
  the score's screen-reader text say the same.
- **Markup**: Home's headline is two spans (`.h1-big`, `.h1-tag`) inside the same `h1`; the
  Practice setup fields were reordered (course, topic, start, then options) with all ids
  kept; Progress moved the level strip after the evidence; Settings swapped its two panels.
- **Motion**: the page transition slashes three planes (blue, paper, black) on a steeper cut
  in under 0.6s; new keyframes `jolt` (wrong answer) and `stamp` (result numerals). All
  movement stops under reduced motion.
- **First load**: V3 revealed the whole Home poster with a clip-path from zero width, so for
  up to about 0.9 s the button could not be seen or tapped (found when the Home-button test
  gained a hit test, see below). Now only the planes move (`planeFromLeft`,
  `planeFromBelow`, transforms), the copy rises 22px, and on narrow screens the paper block
  rises within its own padding; the button takes a tap from the first frame.

## 5. Verification (26 Nov 2026, this container: Linux, Chromium 158 via Playwright 1.63, Node 22, Python 3.13)

**Test suites** (AGENTS.md section 2):

| Suite | Result |
|---|---|
| `pytest -q` | 241 passed |
| JS unit (explicit list) | 121 passed |
| End to end, KaTeX CDN blocked (math as raw text) | 38 of 38 passed |
| End to end, `KATEX_DIST` set (math rendered) | 38 of 38 passed |
| Four repeated full end-to-end runs (to catch a flaky test) | run 1, before the test fix, failed that test; runs 2-4, after it, passed |

The one failing test, "a new set asks before replacing an unfinished one", also failed once
in the previous round. The cause was in the test, not the app: the test checked the
**first** option of question 1. When the seeded draw began with a chain-rule question and
that option was wrong, a due chain-rule mistake was saved, and the test's next strict
"Chain rule" request correctly built a review set ("this set is your 1 due review on it")
instead of the "unchanged" message the test waited for. The test now answers question 1
correctly, asserts that no mistake was saved, and its waits name what they wait for. No
expectation was loosened.

Tests changed in this round, and why:
- The Home-button test measures the headline's two spans (the giant word and the slab)
  instead of the `h1` box, because the `h1` box now spans the poster while its text does not.
  It also gained a check: nothing lies over the button's centre (`elementFromPoint`). That
  check failed at once, during the first-load entrance (see "First load" above); it passes
  after the fix.
- The replace-set fixture fix described above.

**Responsive and fallback checks** (`tests/visual/capture.js --sizes --axe`, 16 states,
45 screenshots):
- No horizontal overflow in 72 checks (8 pages × 9 sizes from 320×568 to 1920×1080).
- No page errors or console errors in any state.
- axe-core (WCAG 2.x A/AA tags): 0 violations in all 16 states.
- Home's button is fully on screen and nothing covers its centre (`elementFromPoint`) at
  320×568, 390×844, 1100×768, and 1440×900 with the real fonts and with the font files
  blocked (end-to-end test, checked as soon as the page is ready, i.e. during the entrance).
  A separate probe sampled the button's centre and four points near its edges at the first
  frame and after 1.8 s at the same four sizes: the button was hit every time.
  Screenshots `home-first-fallback-*`.
- Long stems, long options, and long formulas (`practice-extreme`): options wrap inside
  the sheet; a long display formula scrolls inside its own box; the page never scrolls
  sideways.
- Empty states: first-visit Home and empty Progress. Loading and error states
  (`states-phone.jpg`, network answers stubbed in the browser): a similar-question request
  in flight ("Building similar questions at Medium level...", button `aria-busy` and
  disabled), refused with 429 ("The AI is busy right now. Try again in about 30
  seconds."), server unreachable, and Progress with the stats request failing ("Offline:
  showing answers saved on this device."). No page errors.

**Full flow at phone size** (`flow-phone.jpg`, isolated server and database): open → start
practice → miss a question → explanation → result poster → similar question → due review
in the queue → Review after the queue → Progress. 0 page errors. Strict topic sets, an
unfinished set (continue, replace after confirming, a failed request keeps the set), a
finished set restored after a refresh without re-scoring, and Reduce motion applied before
the first paint are each covered by an end-to-end test above.

**Reduced motion**: six key states recaptured with the OS reduce setting and compared pixel
by pixel with the normal capture. Home, Review, the queue, and the result poster differ in
fewer than 0.1% of pixels (anti-aliasing of the orbit). Practice differs only in where the
page is scrolled, since the jump to the current question is instant instead of smooth.
Planes, crops, scale, and state colours are the same, so the static composition keeps its
tension without motion.

**Keyboard and focus**:
- A 2px focus ring is visible on the dark desk (light ring), on the blue plane, and on
  paper (dark ring). Paper options reached with the keyboard show the ring on the whole
  option row.
- A focused control on a phone is never under the tab bar (the button's bottom is at
  624px, the bar's top at 784px at 390×844).
- The page-transition layer has `pointer-events: none` and never holds focus.

**Not tested here**: real phones and tablets (all phone checks are Chromium emulation at
phone sizes), Safari/WebKit and Firefox, screen readers (only the accessibility tree and
axe), Windows high-contrast mode, and the AI path against the real provider (tests use a
mocked provider; no key is used in this environment).

## 6. Image index (`docs/redesign-v4/`)

Before/after pairs: left V3 "Signal Blue", right V4 "Cut Poster"; same fixture data, same
seeded question draw, same viewport (desk 1440×900, phone 390×844, small 320×568).

| File | What to look at |
|---|---|
| `proto-first-1440.jpg`, `proto-first-390.jpg` | The composition choice, first visit: A (planes, giant cropped word) beside B (rings as the structure) |
| `proto-returning-1440.jpg`, `proto-returning-390.jpg` | The same choice for a returning student (2 due in both mock-ups; static mock-ups, so the bottom row is placeholder navigation) |
| `proto-results-1440.jpg`, `proto-results-390.jpg` | The same choice extended to the result screen; B's ring of results was kept |
| `home-first-desk.jpg`, `home-first-phone.jpg` | First visit: value (giant word + slab), the short description, then the button on the paper; empty rings stay small on the dark desk (hidden on a phone) |
| `home-first-fallback-small.jpg` | 320×568 with the font files blocked: same line breaks, button above the tab bar |
| `home-returning-desk.jpg`, `home-returning-phone.jpg` | Returning: the real due count at poster size, the due list, the orbit with real dots, Start review alone on the paper |
| `practice-setup-desk.jpg`, `practice-setup-phone.jpg` | Setup sheet: course and topic first, the bank count and strict-topic choice under the topic, Start practice under them, set options in their own column |
| `practice-active-desk.jpg`, `practice-active-phone.jpg` | The workbench: question number on the masthead, set bar, the question on a paper sheet with its print; a graded card shows result, then explanation, then next step |
| `practice-complete-desk.jpg`, `practice-complete-phone.jpg` | The result poster: the score is the largest thing, ringed by the set's questions as dots; then skill evidence and the one next step; XP and sharing further down |
| `review-desk.jpg`, `review-phone.jpg` | Review: the due count and Start review before the chart; filters, orbit, legend, list switch below |
| `review-queue-desk.jpg`, `review-queue-phone.jpg` | The queue: one mistake at a time on paper, the queue bar above it |
| `notes-desk.jpg`, `progress-desk.jpg` | The masthead on other pages; Progress shows accuracy with its counts before level and streak |
| `flow-phone.jpg` | The full loop at 390×844 after the redo: open → start → miss + explanation → result → similar question → due review → Review → Progress |
| `states-phone.jpg` | Loading and error states: similar question building, refused (429), no server; Progress offline |

## 7. Follow-ups noted, not done here

These would change learning behaviour, recommendations, the API, the database, or
accounts, so they were left for later rounds:

- A "try 3 questions" quick start for first visits.
- Making the Progress "Focus next" topics into direct practice links.
- A browsable unit → skill picker with counts.
- Similar questions that change representation (graph, table, word problem) and a
  next-day retest.
- Accounts or cross-device sync.
