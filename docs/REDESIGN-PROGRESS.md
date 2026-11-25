# Flagship redesign: progress log

Single running record for the redesign (phases, decisions, evidence, open items).
Screenshots live outside the repo during the work; selected before/after images are
committed under `docs/redesign/` at the end.

## Status

| Phase | State |
|---|---|
| 0 Audit and baseline | done |
| 1 Research | done (search-level; full reads blocked) |
| 2 Art direction (3 prototypes, choose) | done: hybrid on direction A |
| 4 Home, Practice, Review Orbit | implemented; iteration round 1 done |
| 5-6 Other pages, functional fixes | done; iteration round 2 done |
| 7-10 Browser iterations, regression, delivery | done (3 iteration rounds; results below) |

Branch `claude/zen-ramanujan-t57aza` (PR #3 open, CI green, not merged). Redesign
commits stay local until the owner authorizes a push.

## Phase 0: baseline (2026-11-24)

**Method.** `tests/visual/capture.js` starts `server.py` with a throwaway DB, loads the
labelled fixtures in `tests/visual/fixtures.js` (`empty`, `returning`: 14 mistakes / 62
graded answers, `dense`: 160 mistakes, `extremeSet`: long stems, long options, heavy
LaTeX), and records screenshots, console errors, overflow at 7 sizes (1920x1080 to
320x640), axe-core 4.10.2 (WCAG 2.2 AA tags), and lab timings (Chromium, 1440x900, local
server, no network throttling; median of 3, plus one run at 4x CPU slowdown). Lab numbers
are diagnostics, not real-user Core Web Vitals.

**Live site.** Not reachable from this container (egress proxy refuses
studyboostai.pythonanywhere.com). Production serves `main` (a24bee2); local is `main` + the
similar-question feature (PR #3).

**Feature inventory**

| Status | Features |
|---|---|
| Verified (tests + this session's browser runs) | offline practice from the bank; MCQ grading and short-answer self-grading; auto-capture of misses with pick/options/level; SM-2 ratings and schedule; due-review injection into sets; topic mastery; XP/streak/daily missions; completion card; Progress (server stats, practice-type split); similar-question practice (built-in generator, and AI path against a mock provider); KaTeX rendering (with a local KaTeX copy); Home review orbit (dots = mistakes by days until due) |
| Implemented, not re-verified here | backup download/restore (browser-verified per DEVLOG; no automated test); share progress; feedback link; trust pages |
| Depends on an external service | AI summaries, AI practice sets, AI similar questions (no key in this environment); KaTeX CDN (blocked here, degrades to raw text); production deploy |
| Partial / defective | offline Notes summary merges lines (handler collapses whitespace before the line splitter) |
| Not implemented | mistake search/sort; orbit interaction (filter, select, details, list alternative); practice focus mode; student-facing settings separate from developer config; in-app motion preference |

**Measured baseline**

| Check | Result |
|---|---|
| Console errors | 0 (14 states) |
| Horizontal overflow | 0 of 56 checks |
| axe (WCAG 2.x A/AA tags) | 1 serious: KaTeX `\text{}` inside math lacks contrast (extreme set); 0 elsewhere |
| CLS (lab) | Home first visit 0.254, Home returning 0.127 (target <= 0.1). Source: date line filled by JS and web-font swap shift the whole view at ~83 ms |
| LCP (lab) | Home 72-100 ms; deep link to Practice/Review ~1.6 s (main heading hidden by entrance animation until boot ends) |
| Transfer | ~625 KB uncompressed per load (`question-bank.js` 249 KB loaded eagerly, `app.js` 151 KB) |

**Design and UX problems** (priority: P0 blocks the core loop, P1 major, P2 polish)

| # | Where | Evidence | Impact | P | Direction |
|---|---|---|---|---|---|
| 1 | Home, returning student | 1366x768 and 390x844: marketing headline fills the screen; "4 questions are due" starts below the fold | The real next task is hidden every visit | P0 | Command center: next task first for returning students, poster hero for first visits |
| 2 | Practice during a set | 1366x768: setup form fills the first screen, Q1 at y~650; phone: whole screen is the form | Every set starts with scrolling; no focus state | P0 | Collapse setup into a set header once a set exists; focus mode |
| 3 | Review orbit | Dots placed by a hash of the id (angle carries no meaning), hover-only tooltips, no legend, no actions, Home only | Signature graphic is decorative, not usable | P1 | Data-driven sectors by course, rings = SM-2 days, select a node for details and actions, filters, list alternative, empty and dense states |
| 4 | Mistake Log | No search or sort; "Clear Mistake Log" sits beside everyday filters; recommendations show "Chain rule" twice with no way to tell items apart | Hard to find a specific item; risky control placement | P1 | Library toolbar (search, status chips, sort), danger action moved away, show question snippets |
| 5 | All views | Same structure everywhere: giant H2 + paragraph + panels; band word repeats the H2 | Pages feel templated; vertical space wasted | P1 | Page-specific compositions; band becomes the page title; compact headers on work pages |
| 6 | Results | Completion card has score/XP/mastery but no per-question results or links to missed items | Weak "what now" after a set | P1 | Result sequence: per-question strip, missed items with "practice similar", next step |
| 7 | Progress | Long stack; 3-axis radar is a tiny triangle with truncated labels; 14-day chart has no scale | Data hard to read | P1 | Observatory layout: headline numbers, labelled charts, honest small-data states |
| 8 | Setup | `.env`, `OPENAI_API_KEY`, `server.py`, model id shown to students | Confusing for students | P1 | Student settings first (mode, data, motion); developer settings folded |
| 9 | Notes | Offline summary merges lines (bug above) | Wrong key points offline | P1 | Fix the bug; editorial output layout |
| 10 | Performance | CLS 0.254; eager 249 KB bank; content hidden during entrance | Jank and slower first view | P1 | Reserve space, font fallback metrics, lazy-load the bank, never hide content in entrance motion |

**Keep (working brand equity):** poster blue field with black type; Big Shoulders +
Instrument Sans pairing; review rings spaced at real SM-2 intervals (logo, background,
chart); slanted button shapes that keep clean focus outlines; fast page wipe (< 0.6 s);
phone tab bar; status colors always paired with words; data-honesty rules.

## Phase 1: research

**Method and limits.** Searched about 24 references (game UI, product tools, learning
products, experimental web). Every full-page read (20 URLs across 4 batches) failed: this
environment's network policy blocks those hosts. Findings below come from search-result
excerpts of the cited pages, so they are secondhand; outlets sometimes disagree (e.g. one
calls Metaphor's UI "hyper stylish", another "not as stylized"). Not accessed at all:
gameuidatabase.com, interfaceingame.com (blocked), Mobbin (login), Godly, SiteInspire,
Behance, Dribbble, Apple Design Awards, Material 3.

**What the references teach (with sources)**

| Reference | Finding (as reported) | Source |
|---|---|---|
| Persona 5 (CEDEC 2017 talk) | One dominant red; no sub-colors except HP/MP; a white line through the menu to lead the eye | [Siliconera](https://www.siliconera.com/?p=668266), [Famitsu](https://www.famitsu.com/news/201711/13145540.html) |
| Persona 5 (Suto, Hashino) | UI as "graphical entertainment", ransom-note typography; menus "impossible to read at first" until much iteration | [The Star](https://www.thestar.com.my/tech/tech-news/2024/10/20/exuberant-video-game-menus-designed-with-da-vinci-in-mind), [GamesRadar](https://www.gamesradar.com/games/jrpg/persona-director-and-jrpg-veteran-says-the-amazing-menus-in-metaphor-refantazio-were-really-annoying-to-make-just-as-persona-5s-were-impossible-to-read-at-first) |
| Persona 3 Reload | Kept the series blue; water/bubble motif tied to the game's theme; a floating figure in menus | [Automaton](https://automaton-media.com/en/news/20240207-26873/) |
| Metaphor: ReFantazio (Ise, GDC 2025) | Rejected an early pop direction as too generic; UI treated as part of the world; open to a calmer mode for players who find menus overstimulating | [GamesRadar](https://www.gamesradar.com/games/jrpg/the-lead-ui-designer-on-metaphor-refantazio-had-never-designed-for-a-game-before-he-just-rolled-up-and-made-some-of-the-best-ui-ive-ever-seen-in-a-jrpg), [PC Gamer](https://www.pcgamer.com/games/rpg/persona-and-metaphor-refantazios-ui-designer-is-open-to-accessibility-options-for-players-who-find-the-stylish-menus-overstimulating-that-is-something-we-understand-well-need-to-work-on-and-provide-in-the-future/) |
| Hi-Fi RUSH | UI animation built to show its link to the music; on-beat inputs reward rather than penalize | [Unreal Engine interview](https://www.unrealengine.com/en-US/developer-interviews/hi-fi-rush-was-inspired-by-shaun-of-the-dead-and-futurama) |
| Hades | Each menu designed to match the theme of what it presents | [WhatCulture](https://whatculture.com/gaming/hades-14-awesome-details-you-totally-missed?page=5) |
| NieR: Automata (Kijima) | "Systematic and sterile but still beautiful"; analog top/bottom borders; feel of an old picture book | [PlatinumGames blog](https://www.platinumgames.com/official-blog/article/9624) |
| Mirror's Edge | One warm guidance color (red) over a cool, desaturated world shows where to go; can be turned off | [EA](https://www.ea.com/news/runners-vision-in-mirrors-edge-catalyst) |
| NEO: TWEWY | Little UI-specific material found (fashion, Shibuya setting) | [Push Square](https://www.pushsquare.com/news/2021/06/hands_on_neo_the_world_ends_with_you_brings_a_stylish_afterlife_to_ps4) |
| Linear | Themes generated in LCH for consistent contrast; a display cut for headings, regular for text; refresh aimed at scanning and focus | [Linear](https://linear.app/now/how-we-redesigned-the-linear-ui) |
| Raycast | Action bar lists the actions for the current context with their shortcuts, so users learn them | [Raycast](https://www.raycast.com/blog/a-fresh-look-and-feel) |
| Desmos | Design principles start with "What can we simplify?" | [Desmos](https://www.desmos.com/design-principles) |
| Duolingo | Supportive wrong-answer voice ("Not quite"); explanation on demand after an answer | [Duolingo design](https://design.duolingo.com/writing/voice), [blog](https://blog.duolingo.com/explain-my-answer-now-free) |
| Brilliant | Problem solving at the center; feedback while the reasoning is fresh | [Brilliant](https://brilliant.org/resources/choosing-brilliant/how-brilliant-teaches-math/) |
| Anki | "Future due" is an estimate assuming no new or failed cards; retrievability = probability of recall | [Anki manual](https://docs.ankiweb.net/stats.html) |
| Khan Academy | Attempted / Familiar / Proficient / Mastered; course % counts only Proficient+ | [Khan support](https://support.khanacademy.org/hc/en-us/articles/5548760867853) |
| Obsidian / Heptabase | Users want positions that carry meaning and stay put (pinning, predictable directions) | [Obsidian forum](https://forum.obsidian.md/tag/graph-view/1), [K-Plex](https://community.obsidian.md/plugins/k-plex) |
| Radio Garden | Removed everything possible; dots on a globe are the interface; no border labels | [Dutch Design Awards](https://www.dutchdesignawards.nl/en/gallery/radio-garden/) |
| The Pudding | Start with a question; guide through the top line, then let readers explore | [Pudding resources](https://pudding.cool/resources) |
| neal.fun | Ideas explained through play | [Simon Willison](https://simonwillison.net/2017/Oct/15/explorable/) |
| Blooket / Quizlet | Same question set in many game wrappers (teens call it childish); adaptive multiple-choice Learn mode | [Common Sense](https://www.commonsense.org/education/reviews/blooket) |

**Reference-to-implementation matrix**

| Principle | Applies to | StudyBoost decision |
|---|---|---|
| One dominant color, semantic colors only for state (P5) | Global | One field color per surface; correct/incorrect/due colors only with words |
| A line that leads the eye (P5), one guidance color (Mirror's Edge) | Home, Practice, Results | A single "signal" color reserved for the next action on every page |
| Theme motif tied to meaning (P3R water, Hades per-menu themes) | Brand, Orbit | Orbits/return as the motif everywhere; each page composed for its job |
| Avoid generic, but offer a calmer mode (Metaphor) | Global, Settings | Calm mode (less motion and decoration) as a student setting |
| "Systematic, sterile, beautiful", index numbering (NieR) | Notes, Progress | Numbered sections, labelled frames, consistent rules |
| Display cut for headings, regular for text, contrast by construction (Linear) | Type, color | Big Shoulders display only for titles/numbers; contrast-checked token pairs |
| Visible contextual shortcuts (Raycast) | Practice, Review | Keyboard: 1-4 choose, Enter check, N next; hints shown |
| Simplify first (Desmos) | Practice, Settings | Setup collapses once a set exists; developer config folded away |
| Supportive feedback, explanation on demand (Duolingo, Brilliant) | Practice, Results | "Not quite" + the misconception; explanation opens on a miss; no shaming |
| Reward, don't punish (Hi-Fi RUSH) | Results | Result sequence celebrates progress and routes misses to practice |
| Future-due is an estimate; recall probability (Anki) | Orbit, Review | Orbit radius = days until due, labelled as the SM-2 schedule |
| Mastery levels; % counts only Proficient+ (Khan) | Progress | Keep levels; call them estimates; show the rule |
| Positions that carry meaning and stay put (Obsidian, K-Plex) | Orbit | Angle = course sector, radius = days; stable between visits |
| Dots are the interface, minimal chrome (Radio Garden) | Orbit | Select a node to see and act on that mistake |
| Top line first, then explore (Pudding) | Progress | Plain-language findings first, details after |
| Teens reject childish game wrappers (Blooket) | Global | Mature editorial style; no cartoon rewards |

## Phase 2: art direction

**Method.** Three prototypes built as static HTML from one shared data file (the
`returning` fixture: 4 due, 10 scheduled, missions 3/5, 1/5, 42/50, weakest topic Chain
rule 38%, question 2 of 5 "The derivative of ln(5x^2+1)"). Each has Home, Practice and
Review Orbit at 1440x900 plus Home at 390x844, rendered in Chromium (0 console errors).
All three use the same proposed orbit model (angle = course sector sized by count,
radius = days until the SM-2 due date on a log scale with rings at 1/6/15/38 days, due
items in the core on a sunflower spiral), so the comparison is about the visual system,
not the data. Prototype files and screenshots stay in the session scratchpad; selected
images are committed with the final report.

| Direction | Concept |
|---|---|
| A "Signal Blue" (editorial JRPG) | Evolves the current poster system: diagonal blue field vs. black slab, giant real numerals in Big Shoulders, slanted rows and buttons, orbit on the field |
| B "Orrery" (observatory) | Deep-space instrument panel: hairline rings, degree ticks, mono readouts, cyan light and an amber signal, calm reading column |
| C "Print Room" (riso) | Paper stock, pink/blue overprint with misregistration, Fraunces 900 magazine headlines ("4 to review today."), book-page practice |

**Comparison** (my judgment from the renders, 1 = weak, 5 = strong)

| Criterion | A | B | C | Evidence from the renders |
|---|---|---|---|---|
| First-glance impact | 5 | 4 | 4 | A's 300px "4 DUE NOW" on the diagonal field is the strongest single read; B is elegant but quiet; C is charming |
| Aesthetic maturity | 3 | 5 | 4 | A: the white slash cuts through the headline and due list; outlined orbit wedges look like a wireframe pie. B is the most resolved |
| Brand distinctiveness | 5 | 2 | 3 | A grows from StudyBoost's existing field/slab/Big Shoulders equity. B reads as a generic sci-fi dashboard. C abandons the brand for a current zine trend |
| Content readability | 3 | 4 | 5 | A: rotated "DUE NOW" and the slash hurt; question card is fine. B: 11px mono labels are low contrast. C: paper + large sans is the easiest read |
| Operation clarity | 4 | 4 | 4 | All three put the next action first; A's white slab CTA is the most obvious |
| Extends to other pages | 4 | 4 | 3 | C's serif display and paper stock would require re-validating every existing component and contrast pair |
| Phone | 4 | 4 | 2 | C's list grid collapsed to a one-word column at 390px (fixable, but shows fragility) |
| Performance cost | 4 | 3 | 3 | A needs no new fonts. B adds a mono font and backdrop blur. C adds a display font and a blended noise layer |
| Long sessions | 3 | 5 | 4 | A's bright field tires the eye if it fills work pages; B is the calmest |

**Decision: A as the base, with B's instrument layer and C's editorial hierarchy.**
A keeps the equity users already know and gives the boldest first read, which the brief
asks for (controlled maximalism, not a template). Its weaknesses are fixable by rules
rather than by changing direction: nothing decorative crosses text; the bright field is
limited to one region per page (the "what now" region), and work surfaces (questions,
lists, notes) stay on dark ink. Borrowed from B: hairline rings with tick labels and a
leader-line detail card for the orbit, instrument readouts (label + number + thin
meter), a calm centered reading column in Practice. Borrowed from C: the sentence
headline + dek + numbered list hierarchy and the plain ledger for daily missions.
Rejected: B as a whole (closest to generic dark dashboards, too restrained for the brief,
new font), C as a whole (brand pivot, every component and contrast pair to re-prove, a
serif display face fighting the existing system, weakest on phones).

**Brand grammar ("Signal Blue")**

1. Field: the blue poster surface (`--field`) holds one thing per page: the key real
   number and the next action. At most one field region per view.
2. Slab: black (`--black`) frames, rows on the field, detail cards. Ink (`--ink`) is the
   working surface for anything read for more than a few seconds.
3. Signal: the next action is the one bright filled slab in its region: white on the
   field, cyan on ink. No other element uses a bright fill.
4. Numerals: Big Shoulders numerals are always real counts from the student's own data
   (due count, question index, score). Never decorative numbers.
5. Slant: one slant for buttons, rows, chips and meters. Study content (questions,
   options, formulas, notes, explanations) is never slanted, rotated or set in display
   type.
6. Instrument layer: charts use hairline rings and ticks with plain-language labels and
   a legend; a selected item gets a leader line to its detail card.
7. Editorial hierarchy: kicker (small caps) -> headline sentence -> dek -> numbered
   list -> action. Pages differ in composition, not in vocabulary.
8. Motion explains state (wipe between pages, nodes settling to their schedule, result
   cells filling in order), never blocks input or hides content, and stops under reduced
   motion or the in-app Calm setting.

## Step 4: Home, Practice, Review Orbit (implementation)

- **Home command center** (`#nextStep` is now the hero, so existing selectors hold): the real
  next task first for returning students (due reviews: the headline carries the giant count;
  weak topic: recent accuracy; caught up: days to the next review), the due list with
  course, topic and a formula-safe snippet, one white signal button, a quieter second move
  (the weak topic after the reviews). First visit keeps the poster promise and the welcome
  card. The orbit moved onto a black slab (status colours fail contrast on blue). New
  "Coming up" panel: reviews per day for the next 7 days from SM-2 due dates.
- **Practice focus mode**: setup folds into a set bar once a set exists (course, topic, level,
  and the source: AI, built-in bank, or due reviews); one question at a time; the set bar's
  cells navigate; keys A-D / 1-4 choose, Enter checks or moves on, N next (never while
  typing); the band shows "02 / 07", then the score. Completion bookkeeping (XP, streak)
  still happens on the last grade; the result sequence waits for "See results" so the last
  explanation can be read. Result sequence: score, XP, every question in order ("Right" /
  "Not yet"), growth line, and each missed question with "See the answer" and "Practice
  similar".
- **Review Orbit**: new pure module `js/review-orbit.js` (12 tests): angle = course sector,
  radius = days until due (log scale, rings 1/6/15/38), due in the core, deterministic
  positions; one filter (time bucket, course, search) drives chart and library; nodes are
  focusable (arrows, Enter); selected mistake in a field-blue card with "Review it now" and
  "Practice similar"; list alternative; legend; readouts.
- **Mistake Library**: search (question, topic, answers; LaTeX-insensitive), sort (soonest
  due, newest, oldest, course), counts, the "Clear" action moved into a folded "Manage"
  section, single delete now asks for confirmation.
- **Honesty fixes found on the way**: offline bank questions carried "[Medium · AP Calculus
  AB]" and "[From your notes: ...]" prefixes, so bank questions claimed to come from the
  student's notes. Removed; the status line now says built-in questions don't use notes.

### Iteration round 1 (evidence: `tests/visual/capture.js`, fixtures `returning`, `dense`, `empty`)

| Issue (screenshot) | Change | Re-check |
|---|---|---|
| Home: "4 DUE NOW" figure and "4 QUESTIONS ARE DUE" headline said the same thing twice (desk 1440x900) | Headline carries the giant number; the separate figure is only for other steps | Home desk/laptop/phone: one statement |
| Home: due-list snippets wrapped to 3 lines in a narrow third column | Course + topic stacked in one column, snippet gets the rest | Two lines max at 1440 and 1366 |
| Home phone: the CTA fell below the fold behind 4 list rows | Below 960px the action comes before the list | CTA visible at 390x844 |
| Tablet portrait: two-column command squeezed snippets to 5 lines | Command stacks below 960px; orbit slab moves underneath | 768x1024 |
| Practice phone: the sticky set bar took ~250px of the screen | Not sticky on phones; meta hidden; cells 40x44 in one row | 390x844 |
| Results: kicker wrapped to two lines; title "5 of 7 right" repeated the giant 5/7 | Short kicker (course · level); title "Set complete." / "Perfect set."; score has a screen-reader sentence | desk + phone |
| Results: one-line ellipsis cut KaTeX mid-formula on phones | Two-line clamp | phone |
| Review: chart started at y~520 at 1440x900 | Shorter intro, readouts moved beside the chart | desk |
| Review phone: readouts pushed the chart off screen | Readouts hidden on phones (the chips carry the counts) | phone |

Tests after round 1: JS unit 105/105 (93 + 12 new), end-to-end 5/5, 0 console errors and 0
horizontal overflow in all captured states.

## Steps 5-6: the other pages and functional fixes

- **Notes** (editorial archive): the summary says how it was made ("AI summary" or "Offline
  summary · your own lines, cleaned up"), a lede, and numbered key points (01, 02…).
  Bug fixed: the offline summary collapsed newlines before the line splitter, so
  line-structured notes merged into run-on points (6 lines now give 6 points).
- **Mistake page**: options use the same A–D key badges as Practice; "Check answer" is the
  signal; "Back to Review" wording.
- **Progress** (observatory): one plain sentence first ("Last 7 days: 44 questions, 73%
  right. Strongest: … Most room to grow: …", from graded answers only, subjects need 3+
  answers, no comparison on a tie; `HomeSummary.weekTopLine`, 2 tests); the 14-day bars
  carry their counts and the busiest day is named; no chart when there is no activity;
  the radar appears only with 5+ topics (a triangle said less than the bars); two columns
  from 1280px.
- **Setup**: student settings first (Motion: match device / reduce; Your data), the AI
  connection folded into a closed panel "for whoever runs the server". The Reduce-motion
  choice is stored in `studyBoostUIPrefsV1.motion` (so backups include it) and applied by a
  one-line script in `<head>` before the first paint.
- **Results** (signature result sequence): see Step 4; the XP count-up starts when the
  results open, and nothing waits on animation.
- **Performance**: `js/question-bank.js` (~250 KB, 40% of the first load) left the initial
  page; it loads on first need (with a "Loading the built-in questions…" status and the busy
  stripes) and is prefetched when the browser is idle.

### Iteration round 2 (all 14 states re-captured; evidence in the session's `r5` set)

| Issue | Change | Re-check |
|---|---|---|
| Notes: key points merged ("Example … Product rule - (uv)' …" in one bullet) | Offline summarizer gets the raw text | 6 lines → 6 numbered points |
| Progress: a 3-axis radar was a tiny triangle with labels cut to 10 characters | Radar only with 5+ topics; labels to 20 characters; larger canvas | fixture (3 topics): no radar, bars carry it |
| Progress: bars had no numbers or scale | Count on each bar; busiest day named in the hint | desk |
| Setup: `.env`, `OPENAI_API_KEY`, `server.py` shown first to students | Student settings first; developer text folded | desk + phone |
| Practice (injected set without metadata): empty first row in the set bar | `.set-meta:empty` hidden | extreme set |
| Mistake page options looked different from Practice | Shared option renderer with key badges | desk |

Tests after round 2: JS unit 107/107, end-to-end 5/5; 14 states × their sizes: 0 console
errors, 0 horizontal overflow.

### Performance fixes found by measuring (between rounds 2 and 3)

| Measurement (lab, Chromium, local server) | Cause found | Change | Re-measured |
|---|---|---|---|
| First-visit Home CLS 0.29 in some runs (0 in others) | `layout-shift` sources: the JS-filled date line grew the top bar 6px about 90 ms after first paint and pushed the whole view | `#todayDate` seeded with a no-break space so the line has its final height and baseline | 0.0014 in 6 of 6 runs |
| Practice deep link at 4x CPU: LCP ~1.8 s | Entrance keyframes started at `opacity: 0`, so the heading counted as painted only after the animation | All entrance keyframes are transform-only | 144-176 ms |
| Review at 4x CPU: CLS 0.314 | The orbit SVG is drawn after first paint and pushed the library down | `.orbit-canvas:empty` reserves the chart's square (Home's orbit link too) | 0.005 |
| "Kilobytes" rose to 715 | The idle prefetch of the bank lands inside the 2.5 s window | Harness now also reports bytes finished by the load event | 470 KB at load (Home, Review) |

### Iteration round 3 (320, 390, 1024, 1920 checks)

| Issue | Change | Re-check |
|---|---|---|
| 320px: the date line wrapped into four fragments ("Wed, Nov / 25", "Late / night") | Date kept on one line; "Late night" hidden under 400px; top bar may wrap the connection chip | 320x640 |
| Headline orphan: "QUESTIONS ARE / DUE" at 1440-1920 | `text-wrap: balance` on headlines | "QUESTIONS / ARE DUE" at 320 and 1920 |
| 1024x768: Review stacked the selected-mistake card under the chart, out of view | Chart and card stay side by side down to 900px | 1024x768: both visible |
| Phones: the orbit kept 70 units of label margin while the labels were hidden; the chart started below the fold | Under 520px wide the chart is drawn without labels (the legend names courses) and redrawn when Review opens or the width crosses the threshold; course filter and Chart/List share a row; the Review intro gives way on phones | 390x844 and 320x640: the orbit starts on the first screen |

## Open issues and limits (honest list)

- **Research depth.** Every full-page read failed under this environment's network policy;
  the research table is built from search excerpts and is marked secondhand.
- **Production not checked.** studyboostai.pythonanywhere.com is unreachable from here; it
  still serves `main`. Nothing was deployed.
- **Browsers and devices.** Verified in Chromium only (Playwright), at 7 emulated sizes. Not
  run on real phones, Safari/WebKit, or Firefox. Features with recent support floors:
  `:has()` (Firefox 121+, Safari 15.4+), `text-wrap: balance` (degrades to normal wrapping),
  `aspect-ratio`.
- **Assistive tech.** axe-core found 0 violations and the keyboard flows have automated
  end-to-end tests, but no manual screen-reader pass (NVDA, VoiceOver) was done.
- **Performance numbers are lab diagnostics** on a local server (no network throttling, one
  machine), not field Core Web Vitals. INP was not measured (it needs real interactions);
  the "blocking ms" column is long-task time over 50 ms, not INP.
- **Returning Home CLS ~0.055.** The page ships the first-visit text and swaps in the
  returning student's task once their local data is read; under 0.1, not zero.
- **Fonts.** `font-display: optional`: on a very slow first visit the fallback fonts stay for
  that visit.
- **Bank on demand.** The first offline set now needs one more request for the bank; if the
  network drops before the idle prefetch, Practice says the bank did not load instead of
  showing questions.
- **Orbit density.** 160 mistakes stay legible (dots shrink to a 3.2px floor); far larger logs
  would need aggregation, which is not built. Positions are deterministic but shift when the
  mix of courses changes (sector sizes follow counts).
- **Not redesigned in depth:** the Practice setup form and the mistake page keep their
  structure (new kicker, key badges, signal button). The AI-generated path renders through
  the same components but was not exercised against a real provider here.
- **CI** has not run on these commits (they are local until a push is authorized).

## Manual verification steps

1. `python server.py`, open <http://127.0.0.1:8765/> (or `start.bat` on Windows).
2. First visit: Home shows "Turn your notes into adaptive practice." and the welcome card.
3. Practice: AP Calculus AB, "5 multiple choice only", Generate. The setup folds into the
   set bar ("Built-in question bank"), the band shows 01 / 05. Press a letter, Enter (check),
   Enter (next). Miss one on purpose. On the last question: "See results", then "See the
   answer" and "Practice similar" on the missed one.
4. Review: the missed questions sit in the core. Click a dot, or Tab into the chart and use
   the arrows and Enter. Try Due now / Next 7 days / Later, a course, List, a search such as
   `3x+1`, and Delete (Cancel keeps it).
5. Home again: "N questions are due" with the list; "Start review" opens Review filtered to due.
6. Notes: paste several lines, Generate Summary: one numbered point per line, labelled offline.
7. Setup: Reduce motion, reload: no page wipe or entrance motion; the choice is in
   "Download my data".
8. DevTools device mode at 390x844 and 320x640: no sideways scrolling; the orbit is on the
   first Review screen.
