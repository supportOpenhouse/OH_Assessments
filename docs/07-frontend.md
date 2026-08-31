# 07 — Frontend Design

**Method:** [Hallmark](https://github.com/nutlope/hallmark) — the anti-AI-slop design skill.
**Structural reference:** [Wayfare](https://www.usehallmark.com/examples/wayfare/) — its craft level and data-instrument DNA, not its dark palette.
**Palette:** [openhouse.in](https://openhouse.in), exact brand values.

> Supersedes the earlier `Direct_Inventory/frontend` port. That repo remains the
> reference for **auth architecture only** ([02-architecture.md §5](02-architecture.md)) —
> Google ID token exchanged for our own JWT. None of its visual language carries over.

---

## 1. The position

Hallmark's first axis is **Philosophy**: what is this page's argument? Ours —

> **This is an instrument, not a dashboard.** It measures a performance and issues
> a verdict a human will act on. It should read like a record of an assessment:
> ruled, numbered, tabular, signed. Not like a SaaS analytics page.

Wayfare's departure board is the right DNA precisely because a board is an
*operational* surface — statuses, timings, monospaced figures, hairline rules,
nothing decorative. Our admin list is literally a board of candidates and
statuses. The metaphor isn't applied, it's already there.

Three consequences that decide most arguments downstream:

- **Every number is monospaced and tabular.** Stars, wpm, durations, timestamps,
  rubric hashes. Figures that shift column as they change look like marketing.
- **Rules separate, whitespace does not.** Hairlines between rows and sections
  (gate 9 fails a page separated only by equal padding).
- **The verdict is set in serif.** The model's reasoning is an argument, and it
  reads as one. This is the single sharpest line in the design: interface is
  sans, machine output is serif.

## 2. Palette

Every brand value below is lifted verbatim from openhouse.in's own `:root`.

```css
/* openhouse.in ground truth — do not re-pick these */
--oh-orange: #fa541c;   /* primary  = oklch(66.8% 0.211 36.9) */
--oh-purple: #d946ef;   /* secondary — see §2.3 */
--oh-dark:   #2a2a2a;
--oh-light:  #f7f7f7;
--oh-gray:   #767676;
--oh-green:  #00a699;
--oh-blue:   #007a87;
/* their shadcn layer: --primary 21 95% 54% · --foreground 0 0% 15%
   --muted 0 0% 94% · --muted-foreground 0 0% 45% · --border 0 0% 89%
   --destructive 0 84.2% 60.2% · --radius .75rem */
```

### 2.1 One deliberate divergence: tinted neutrals

OpenHouse's entire neutral ramp is **zero chroma** — `#f7f7f7`, `#e3e3e3`,
`#767676`, `#262626` all measure `oklch(… 0.000 …)`. Hallmark gate 22 fails
zero-chroma neutrals: flat greys read dead next to a saturated accent.

**Resolution: keep their exact lightness, add 0.006–0.012 chroma at their own
orange hue (37°).** The ramp stays pixel-identical in value and tone to
openhouse.in; it just stops reading as dead grey beside `#fa541c`. Nobody will
call it "orange" — but the page will look made rather than defaulted.

Pure `#ffffff` survives as the **card** surface, not the base — which is what
openhouse.in does (`--card: 0 0% 100%` over `--oh-light` paper), and what gate 7
permits when white is a lifted surface rather than the ground.

### 2.2 Tokens

```css
/* Hallmark · genre: modern-minimal · macrostructure: The Record
 * paper: warm off-white · accent: openhouse orange 37° · anchor hue 37
 */
:root {
  /* Paper — openhouse lightness, warm-tinted. Base is never pure white. */
  --paper:      oklch(97.6% 0.006 37);   /* = --oh-light #f7f7f7, tinted */
  --paper-2:    oklch(100%  0     0 );   /* card surface — openhouse --card */
  --paper-3:    oklch(95.5% 0.008 37);   /* = --muted #f0f0f0, tinted */
  --paper-4:    oklch(91.6% 0.010 37);   /* inset fills */

  /* Ink */
  --ink:        oklch(26.9% 0.010 37);   /* = --foreground #262626 */
  --ink-2:      oklch(38.0% 0.010 37);
  --ink-mute:   oklch(55.6% 0.012 37);   /* = --oh-gray #767676 */
  --rule:       oklch(85.0% 0.012 37);   /* section rules */
  --hairline:   oklch(91.6% 0.008 37);   /* = --border #e3e3e3 */

  /* Accent — openhouse orange, exact. Under 5% of any viewport (gate 23). */
  --accent:      oklch(66.8% 0.211 37);  /* #fa541c */
  --accent-press:oklch(58.0% 0.200 34);  /* :active only */
  --accent-mute: oklch(85.0% 0.070 37);
  --accent-wash: oklch(96.5% 0.028 37);  /* callout grounds */

  /* Verdict bands — openhouse's own semantics where they exist */
  --band-go:    oklch(65.2% 0.115 185);  /* = --oh-green #00a699  → 4-5 ★ */
  --band-hold:  oklch(70.0% 0.150  70);  /* amber                 → 2 ★   */
  --band-stop:  oklch(63.7% 0.208  25);  /* = --destructive       → 0-1 ★ */
  --band-mid:   var(--ink-mute);         /*                       → 3 ★   */
  --info:       oklch(53.0% 0.091 208);  /* = --oh-blue #007a87 */

  /* Focus — instant, never animated, ≥3:1 on paper (gate 15) */
  --focus:      oklch(53.0% 0.091 208);

  /* Type */
  --font-display: "Bricolage Grotesque", "Archivo", system-ui, sans-serif;
  --font-ui:      "DM Sans", system-ui, -apple-system, sans-serif;
  --font-read:    "Newsreader", "Source Serif 4", Georgia, serif;
  --font-mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* Scale — fluid at the top, fixed below */
  --text-xs: .75rem;  --text-sm: .8125rem; --text-base: .9375rem;
  --text-lg: 1.0625rem; --text-xl: 1.375rem; --text-2xl: 1.75rem;
  --text-3xl: clamp(2rem, 4vw, 2.75rem);
  --text-mark: clamp(2.75rem, 7vw, 5rem);   /* login display, star numeral */

  /* 4pt spacing — nothing off this scale (gate 24) */
  --space-2xs:.25rem; --space-xs:.5rem;  --space-sm:.75rem; --space-md:1rem;
  --space-lg:1.5rem;  --space-xl:2.5rem; --space-2xl:4rem;  --space-3xl:6.5rem;

  /* Rules */
  --rule-hair:  1px solid var(--hairline);
  --rule-thick: 2px solid var(--ink);

  /* Radius — openhouse's --radius: .75rem on cards. The board has none. */
  --r-xs: 2px; --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-pill: 999px;

  /* Motion — wayfare's durations */
  --dur-fast: 140ms; --dur-base: 240ms; --dur-slow: 480ms;
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### 2.3 Purple is deliberately unused

`--oh-purple` (`#d946ef`) is in openhouse's palette and is **not used in this
app**. One accent, under 5% footprint (gate 23). A second saturated hue on a
page whose job is to communicate a five-band verdict would compete with the
bands themselves. Recorded here so its absence reads as a decision, not an
oversight.

### 2.4 Dark

openhouse.in ships **no dark mode**; wayfare is dark. Light is the committed
design — it's the brand. Dark is fully specified because admins read long
transcripts, and it's one block:

```css
[data-theme='dark'] {
  --paper:   oklch(15.0% 0.010 37);  --paper-2: oklch(19.5% 0.012 37);
  --paper-3: oklch(24.0% 0.013 37);  --paper-4: oklch(29.0% 0.014 37);
  --ink:     oklch(95.0% 0.010 60);  --ink-2:   oklch(80.0% 0.012 60);
  --ink-mute:oklch(62.0% 0.014 50);
  --rule:    oklch(38.0% 0.014 37);  --hairline:oklch(27.0% 0.012 37);
  --accent:  oklch(72.0% 0.190 40);  /* lifted — #fa541c is too dense on dark */
  --accent-press: oklch(64.0% 0.195 37);
  --accent-mute:  oklch(42.0% 0.110 37);
  --accent-wash:  oklch(24.0% 0.045 37);
  --band-go:  oklch(72.0% 0.130 175); --band-hold:oklch(78.0% 0.150 75);
  --band-stop:oklch(70.0% 0.180  25); --focus:    oklch(78.0% 0.120 208);
}
```

Neither theme uses pure `#000`. Warm-tinted near-black only (gate 7).

## 3. Typography — four faces, one job each

| Face | Job | Where |
|---|---|---|
| **Bricolage Grotesque** | Display | Login mark, page titles, star numerals |
| **DM Sans** | Interface | openhouse.in's own face. Nav, labels, buttons, forms |
| **Newsreader** | The verdict | Score reasoning and the summary. **Only there** |
| **JetBrains Mono** | Data | Every figure, ID, timestamp, status, board column |

A face that doesn't have a job here doesn't get loaded. Weight budget: Bricolage
`700`, DM Sans `400/500/700`, Newsreader `400` + `400 italic`, JetBrains Mono
`400/500`. One Google Fonts request, `display=swap`, real fallback stacks.

```css
body { font-family: var(--font-ui); font-size: var(--text-base); line-height: 1.55;
       background: var(--paper); color: var(--ink);
       font-feature-settings: "kern", "liga"; -webkit-font-smoothing: antialiased; }
h1, h2, h3 { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; }
.mono, .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.verdict { font-family: var(--font-read); font-size: var(--text-lg); line-height: 1.6;
           max-width: 68ch; }   /* 45-75ch measure (gate 25) */
```

`tabular-nums` is not optional. A star count or a wpm figure that shifts column
between rows is the difference between an instrument and a template.

> **Stricter brand fidelity?** Drop Bricolage and set display in DM Sans 700 at
> `-0.03em`. Three faces, less character. The knob is here if you want it.

## 4. Macrostructure — "The Record"

Stamped at the top of `styles.css` so a later Hallmark run can read it (gate 20):

```css
/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5
 * Hallmark · genre: modern-minimal · macrostructure: The Record
 * theme: openhouse-light · anchor hue: orange 37° · nav: edge-aligned minimal
 * enrichment: pure-CSS ruled board + stamp · palette: openhouse.in verbatim
 */
```

Not hero → 3 cards → CTA → footer. Five surfaces, each with a distinct rhythm:

| Route | Surface | Structure |
|---|---|---|
| `/` | **Landing** | **Off-axis.** `Openhouse Careers` anchored bottom-left of a full-height panel, one accent rule beneath it, a short block flush right. Sign-in is a **Google popup opened in place** — no route change, no redirect, no `/login` page. Nothing on a shared centre line (gate 6) |
| `/assessments` | **Choose** | Numbered ruled rows, one per assessment. An available one is a whole-row link; a used one is inert with its state on the right. **Not** a card grid — with one assessment that would be a single lonely tile, and with four it would be the icon-tile pattern this design exists to avoid |
| `/assessments/:slug` | **Take it** | Numbered `01–04` instruction steps, numerals in the **left margin** in mono — then the dropzone below, full measure |
| `/history` | **Previous** | One ruled row per attempt. In-flight ones carry the staged progress inline; finished ones a **stamp** — rotated 1.5°, mono `RECEIVED`. Diegetic, not a toast |
| `/profile` | **Account** | A ruled metrics strip of facts, the assessment list, then preferences. Same page both roles |
| `/admin` | **The board** | **The departure board.** Ruled rows, mono columns, status treatment. Search + status + score filters above it. No cards, no zebra, no shadows |
| `/admin/candidates` | **Candidates** | Same board language: attempts, which assessments (as chips), sign-ins, first/last seen |
| `/admin/activity` | **Activity** | The audit trail, chip-filtered by action verb |
| `/admin/:id` | **The record** | Verdict → ruled metrics strip → axes `01–05` as ruled blocks → transcript |

**Where the candidate lands.** `/` is public. On sign-in: an admin goes to
`/admin`; a candidate who has attempted anything goes to **`/history`** — their
record, not a list of things to start — and one who hasn't goes to
`/assessments`. One redirect on sign-in, none afterwards.

**Nav is role-aware.** Three links for a candidate, four for an admin, in an
edge-aligned row with an accent underline on the current page. No sidebar: a
sidebar for four links is furniture.

**Zero icon libraries.** Every glyph is hand-written SVG or a mono character.
Emoji as a UI icon is an auto-fail (gate 30).

## 5. The board (admin list)

The load-bearing component. Wayfare's departure board, carrying our data.

```css
/* ───────── The board ───────── */
.board { width: 100%; border-collapse: collapse; }
.board thead th {
  font-family: var(--font-mono); font-size: var(--text-xs); font-weight: 500;
  text-transform: uppercase; letter-spacing: .08em; color: var(--ink-mute);
  text-align: left; padding: var(--space-xs) var(--space-sm);
  border-bottom: var(--rule-thick);
}
.board td {
  padding: var(--space-sm); border-bottom: var(--rule-hair);
  vertical-align: baseline;
}
.board tbody tr { cursor: pointer; transition: background var(--dur-fast) var(--ease-out); }
.board tbody tr:hover { background: var(--paper-3); }
.board tbody tr:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.board .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums;
              color: var(--ink-2); }
.board .cand { font-weight: 500; }
.board .cand small { display: block; color: var(--ink-mute); font-size: var(--text-xs); }

/* Status — a mono word and a dot. Not a pill, not a badge. */
.status { font-family: var(--font-mono); font-size: var(--text-xs);
          text-transform: uppercase; letter-spacing: .06em; }
.status::before { content: "●"; margin-right: 6px; }
.status-scored::before     { color: var(--band-go); }
.status-processing::before { color: var(--band-hold); }
.status-failed::before     { color: var(--band-stop); }
.status-voided::before     { color: var(--ink-mute); }
```

Hover changes **one** property (gate 13). No `transition: all` (gate 10). No
uniform hover-scale (gate 11). No shadow — the rules do the separating.

## 6. Stars and bands

```css
/* ───────── Verdict ───────── */
.stars { display: inline-flex; align-items: baseline; gap: var(--space-xs); }
.stars-mark { font-family: var(--font-display); font-size: var(--text-mark);
              line-height: 1; color: var(--band); font-variant-numeric: tabular-nums; }
.stars-of   { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-mute); }
.stars-band { font-family: var(--font-mono); font-size: var(--text-xs);
              text-transform: uppercase; letter-spacing: .08em; color: var(--ink-2); }
```

**The score is a numeral, not five glyphs.** Five drawn stars force the reader to
count, and an unfilled row of five reads as *not yet scored* — fatal when 0 is a
real and meaningful band. So: a large display numeral, `/5` in mono beside it,
and the band name spelled out.

```
   3  /5   AVERAGE · CAN HIRE
```

Band colour rides one `--band` variable per card: `0–1 --band-stop`,
`2 --band-hold`, `3 --band-mid`, `4–5 --band-go`. It tints the numeral and a
2px **top** rule on the block. Never a thick left side-stripe (gate 5), never a
card inside a card (gate 4).

Each axis block: `01`–`05` in mono on the left margin, axis name in display, the
numeral, then the reasoning in Newsreader at a 68ch measure. Hairline between
blocks. Overall is separated by a `--rule-thick`, not by extra padding.

## 7. Motion

```css
:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px;
                 border-radius: var(--r-xs); }   /* instant — never transitions */
```

- Named properties only. `transition: background var(--dur-fast) var(--ease-out)`.
  **Never `transition: all`.**
- One effect per hover. Never translate + scale + shadow together.
- No overshoot easings on UI state. No `hover:scale-105` anywhere.
- Never animate `width`, `height`, `top`, `left`, `margin`, `padding` — transform
  and opacity only.
- **Eight-state rule:** every interactive element ships `:hover`, `:focus-visible`,
  `:active`, `:disabled`. Four in code, minimum.
- **Every `@keyframes` has a `prefers-reduced-motion` alternative.** No exceptions.

The one piece of real motion: the scoring wait on `/dashboard`. The upload
returns `202` in a couple of seconds; the page then polls
`GET /api/submissions/{id}/status` every 2s. Staged mono copy —
`QUEUED` → `TRANSCRIBING` → `MEASURING DELIVERY` → `SCORING` — driven by the real
status where the API reports one, and by a timer within `processing` where it
doesn't. A hairline rule *fills to an honest ceiling and stops*.

**No percentage.** Neither Scribe nor Claude reports progress, and a bar stalled
at 80% is worse than an honest one that stops moving.

**The candidate never sees `failed`.** Both `scored` and `failed` resolve to the
same `RECEIVED` stamp. Only an admin learns a run errored.

The `Direct_Inventory` welcome curtain is **cut**. A 1.7s full-screen animation on
every sign-in fails the Restraint axis for a tool most people use exactly once.

## 8. Rules

- **All CSS in `frontend/src/styles.css`**, sectioned with `/* ───────── name ───────── */`
  banners, Hallmark stamp at the top.
- **Every colour is a token.** Both themes, or it doesn't ship.
- **Every spacing value is on the 4pt scale.** A `padding: 17px` is a tell (gate 24).
- **`overflow-x: clip` on both `html` and `body`** — hard requirement, and `clip`
  not `hidden`, so `position: sticky` survives (gate 34). No horizontal scroll
  between 320px and 1920px.
- **Prose measure 45–75ch.** Reasoning sits at 68ch.
- **Every decorative SVG gets `aria-hidden="true"`; every meaningful one an
  `aria-label`** (gate 33).
- **No fabricated content.** No "Jane Doe", no invented metrics, no placeholder
  stats. Real fixtures or an em-dash (gate 19).
- **Candidate surfaces must be structurally incapable of rendering a score** — the
  API sends no such field and the component tree has no path to one.

## 9. Pre-ship gate sweep

Every answer must be **no**:

- [ ] Display font is Inter / Roboto / Open Sans / Poppins / Lato / system default?
- [ ] Any purple→blue gradient, or a `background-clip: text` gradient headline?
- [ ] A 3-equal-column icon-above-heading card grid?
- [ ] A card nested in a card, or a thick coloured side-stripe?
- [ ] Hero is `100vh` with everything on one centred axis?
- [ ] Pure `#000` or a pure-`#fff` **base** anywhere?
- [ ] Sections separated only by equal whitespace — no rule, no shift?
- [ ] `transition: all` present?
- [ ] A uniform hover-scale across unrelated elements?
- [ ] More than one hover effect on a single element?
- [ ] Animating `width` / `height` / `top` / `left` / `margin` / `padding`?
- [ ] Focus ring fades in?
- [ ] A success toast for an effect the user can already see?
- [ ] Any neutral at zero chroma? (§2.1 — all are tinted at 37°)
- [ ] Accent over ~5% of any viewport?
- [ ] Any spacing off the 4pt scale?
- [ ] Any prose measure outside 45–75ch?
- [ ] Any interactive element missing `:focus-visible` / `:active` / `:disabled`?
- [ ] Any keyframe without a `prefers-reduced-motion` fallback?
- [ ] Two icon libraries, or an emoji used as a UI icon?
- [ ] Horizontal scroll at any width 320–1920px?
- [ ] Hallmark macrostructure stamp missing from the top of `styles.css`?

## 10. Unchanged from the previous revision

Design is the only thing this document replaces. Still true:

- Four runtime deps: `react`, `react-dom`, `react-router-dom`, `@react-oauth/google`
  (plus `@vercel/blob` for the upload handshake). No Tailwind, no UI kit.
- Plain CSS in one file. No CSS-in-JS.
- `VITE_USE_MOCKS=true` mock layer so the whole UI is buildable before the backend.
- Google ID token → our own JWT ([02-architecture.md §5](02-architecture.md)).
- Routes: `/` (public) · `/assessments` · `/assessments/:slug` · `/history` ·
  `/profile` · `/admin` · `/admin/candidates` · `/admin/activity` · `/admin/:id`.
  The two literal `/admin/*` segments must be declared **before** `/admin/:id`.
- Backend is on Render; Vercel rewrites `/api/*` across, so the client sees one
  origin ([02-architecture.md §4](02-architecture.md)).
