# StudyBoost — Design System

The visual direction is inspired by the graphic language of modern Japanese RPG
interfaces: flat blue fields, huge rotated type, diagonal cuts, and fast slanted
wipes. Nothing is copied. There are no characters, logos, screenshots, or game
assets here, and the signature element is our own.

## The one idea

**The review rings.** Concentric rings are spaced at real SM-2 intervals (1, 6, 15,
and 38 days). On Home they are a live chart: each saved mistake is a dot, and its
distance from the center is the number of days until it comes back. Due questions
sit in the black core. The same rings appear in the logo and the page background,
so the brand mark and the spaced-repetition idea are one thing.

## Color

Tokens live at the top of `css/styles.css`.

| Token | Hex | Use |
|---|---|---|
| `--black` | `#02050B` | Navigation rail, text on blue |
| `--ink` | `#050A14` | Page background, inputs |
| `--navy` | `#071426` | Sunken areas inside a sheet |
| `--panel` | `#0C1E38` | Sheets and cards |
| `--raise` | `#122A4C` | Selected rows, inline code |
| `--line` | `#2B4D78` | Control borders, empty bar tracks |
| `--royal` | `#0B36B2` | Subject tags, page wipe |
| `--field` | `#0C97E6` | Flat poster blue: band, hero, results |
| `--cyan` | `#00D9FF` | Primary action, links, chart data |
| `--white` | `#F5F8FF` | Main text |
| `--mute` | `#A9BAD2` | Secondary text |
| `--good` / `--warn` / `--bad` | `#3CF2C0` / `#E6F24A` / `#FF5C7A` | Status only |

Rules:

- Text on `--field` is **always black** (6.4:1). White on it is only 3:1.
- Status colors mean state, never decoration, and always sit beside a word or number.
- `--field` was sampled from the reference video; `--ink` and `--navy` keep long
  reading sessions calm.

## Type

| Face | Role |
|---|---|
| Big Shoulders Bold | Display only: page names, headings, big numbers |
| Instrument Sans | Everything you read: questions, answers, forms, buttons |

Both are SIL OFL, subset to Latin, and self-hosted in `assets/fonts/` with their
licenses. Self-hosting adds no third party, so the Privacy page stays accurate.

**Study content is never slanted, skewed, or set in display type.** Questions,
answers, and explanations stay upright on solid surfaces. Style lives around the
content, not on it.

## Shape

- The slant is the shared gesture: the band edge, hero cut, nav marker, buttons, tags,
  and bars all lean the same way.
- Sheets have one chamfered corner, made with `clip-path`.
- Buttons draw their slanted shape on `::before` and `::after`. The button element
  stays a plain rectangle, so its focus outline is never clipped, and `app.js` can
  keep reading `ev.target`. **Do not add child elements to buttons rendered by
  `app.js`**: its click handlers check the target directly.

## Layout

```
desktop  >= 1100px    rail | rotated band | content
tablet   720-1099px   icon rail | horizontal band on top
phone    < 720px      horizontal band on top, tab bar at the bottom
```

The giant band word repeats the page name. It is `aria-hidden`, because every view
also has a real heading. Step numbers (1 to 4) appear only on Notes, Practice,
Review, and Progress, since only those four form a sequence.

## Motion

CSS plus the Web Animations API. No animation library, because the app has no
build step.

| Moment | Where |
|---|---|
| First load: band and hero cut in from the left, rings turn in | `.boot` in CSS |
| Page change: three slanted panels, under 0.6s | `transitionTo` in `js/shell.js` |
| Nav marker: white slip, with a slower cyan slip behind it | `.nav-ind` in CSS |
| View entrance, stagger, bars filling, dots appearing | keyframes in CSS |
| Busy: slanted stripes in the button, placeholder bars for the set | `[aria-busy]` in CSS |

Only the ambient rings and the busy states run without a person acting.
`prefers-reduced-motion` turns off the wipe and all movement; state changes stay.

## Data honesty

Every number on screen comes from the student's own activity. Empty states say what
to do, and no accuracy shows until something has been graded (`–`, not `0%`). Mission
targets are fixed goals in `js/home-summary.js`. They award no XP and no achievements.
