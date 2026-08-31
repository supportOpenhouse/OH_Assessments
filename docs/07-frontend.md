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

> **Revised: the palette and type now track openhouse.in directly.** Values below
> were read as *computed styles off the live site*, not from its CSS bundle — the
> site is client-rendered, so its served HTML contains no buttons at all. Two
> corrections came out of that: the brand face is **Public Sans**, not DM Sans
> (which survives only on one legacy button), and their neutral ramp is **cool**,
> which reverses the warm-tint decision in §2.1 below. Dark mode is unaffected.
>
> | | openhouse.in | here |
> |---|---|---|
> | Body | `Public Sans` 16/24, `#1c252e` on `#fff` | same |
> | h1 / h2 / h3 | 700 @ −1.5px / 700 36-40 / 600 20-27.5 | same |
> | Button | `#fa541c`, r10, 8×16, 14/500, 40px, no shadow | `.btn` |
> | Large CTA | pill, 12×32, 16/600, 48px | `.btn-lg` |
> | Radius | `--radius: .75rem`, buttons 8–10 | `--r-md: 10px`, `--r-lg: 12px` |
>
> `Newsreader` is kept for the verdict prose alone — openhouse.in has no
> equivalent surface, because it never renders a machine judgement.

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
  --font-display: "Public Sans", system-ui, -apple-system, sans-serif;
  --font-ui:      "Public Sans", system-ui, -apple-system, sans-serif;
  --font-brand:   "Poppins", "Public Sans", system-ui, sans-serif;
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
transcripts, and it's one block.

**Dark surfaces are three specified neutral blacks** — `#0b0b0b` ground,
`#141414` surfaces, `#1f1f1f` sidebar, plus a derived fourth for inset fills.
Unlike the light ramp they carry **no warm tint**: §2.1's argument is about
openhouse.in's flat greys sitting next to a saturated accent in *light*, and at
15–24% lightness the tint was imperceptible anyway. Ink stays warm — it is not
one of the three blacks, and warm off-white on a neutral ground is what makes it
read as ink rather than glare.

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

## 3. Typography — one face

| Face | Job |
|---|---|
| **Public Sans** | Everything |
| **Poppins 600** | `CAREERS` in the logo lockup, and nothing else |

openhouse.in uses Public Sans and nothing else, so this app does too. The
JetBrains Mono "instrument voice" and the Newsreader verdict prose were **my
additions and have been removed** — they were a design position the brand does
not take.

**Figures keep their alignment without a monospace.** `.mono` / `.num` still
apply `font-variant-numeric: tabular-nums`, which is a *feature* of Public Sans
rather than a reason to load a second family. A column of numbers stays a column
when the numbers change; that was the only functional thing the mono was doing.

Poppins survives for one word because the supplied wordmark is a geometric sans
— perfect-circle `O`, circular `p` bowl — and a grotesque sub-word underneath it
reads as a different typeface bolted on. See §4a.

Weight budget: Public Sans `400/500/600/700`, Poppins `600`. One Google Fonts
request, `display=swap`, real fallback stacks.

```css
body      { font-family: var(--font-ui); font-size: 1rem; line-height: 1.5; }
h1, h2    { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.025em; }
.mono,
.num      { font-variant-numeric: tabular-nums; }   /* no family switch */
```

`tabular-nums` is not optional. A star count or a wpm figure that shifts column
between rows is the difference between an instrument and a template.

> These values were read as computed styles off the live openhouse.in, not from
> its CSS bundle — see the note at the top of §2.

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
| `/` | **Landing** | **Off-axis.** The wave field fills the left 65%; the lockup sits on it bottom-left. The sign-in is a **full-height card occupying the right 35%**, flush to the viewport edge — so it takes a border rather than a radius and a shadow. Terms & Privacy sit under the button in `--legal`. Sign-in is a **Google popup opened in place** — no route change, no redirect, no `/login` page. Nothing on a shared centre line (gate 6) |
| `/assessments` | **Choose** | Numbered ruled rows, one per assessment. An available one is a whole-row link; a used one is inert with its state on the right. **Not** a card grid — with one assessment that would be a single lonely tile, and with four it would be the icon-tile pattern this design exists to avoid |
| `/assessments/:slug` | **Take it** | Numbered `01–04` instruction steps, numerals in the **left margin** in mono — then the dropzone below, full measure |
| `/history` | **Previous** | One ruled row per attempt. In-flight ones carry the staged progress inline; finished ones a **stamp** — rotated 1.5°, mono `RECEIVED`. Diegetic, not a toast |
| `/profile` | **Account** | Openhouse's public-site **footer** at the bottom — copy, the four links, socials and illustration taken verbatim from openhouse.in. The name as a heading with a pencil beside it — read-only until asked, since it is touched once — then a **vertical `<dl>`** of label/value pairs, one per ruled row, and the assessment list. Not the metrics strip: these are pairs, not stats, and an email squeezed into a fifth of the width breaks mid-word. Same page both roles. No preferences section: the theme toggle and sign-out are in the sidebar |
| `/admin` | **The board** | **The departure board.** Ruled rows, mono columns, status treatment. Search + status + score filters above it. No cards, no zebra, no shadows |
| `/admin/candidates` | **Candidates** | Same board language: attempts, which assessments (as chips), sign-ins, first/last seen |
| `/admin/activity` | **Activity** | The audit trail, behind a submitted filter bar — search · action · category · actor · date range · Apply |
| `/admin/:id` | **The record** | Verdict → ruled metrics strip → axes `01–05` as ruled blocks → transcript |

**Where the candidate lands.** `/` is public. On sign-in: an admin goes to
`/admin`; a candidate who has attempted anything goes to **`/history`** — their
record, not a list of things to start — and one who hasn't goes to
`/assessments`. One redirect on sign-in, none afterwards.

## 4a. The brand lockup

```
 ◉  Openhouse        ← supplied artwork, one PNG (mark + wordmark)
    CAREERS          ← Poppins 600, uppercase, --accent
```

`<Brand size="sm|lg" />` — one component, used by the sidebar, the landing hero
and the footer, so the lockup has a single definition.

**Two image files, not one filtered file.** The artwork ships in a dark cut
(`OH_logo_font.png`) and a white one (`OH_logo_font_white.png`), swapped on
`data-theme`. A CSS `filter` would be second-guessing an inversion the designer
already made.

**The sub-word is Poppins, and that is the point.** The wordmark is a geometric
sans; setting `CAREERS` in the grotesque UI face made it read as a different
typeface bolted underneath. See §3.

**Indent is `margin-left: 23.9%`, measured off the artwork** — the mark occupies
columns 0–128 of 640 and the wordmark begins at 153. It must be a *percentage*:
`em` on that element resolves against its own `.4em` font-size, which lands the
word under the circular mark instead of under "Openhouse". A percentage resolves
against the lockup's width, so it tracks every size variant for free.

**Accessibility:** the whole lockup is one `<span role="img">` with a single
`aria-label`, and the artwork is `aria-hidden`. A screen reader hears
"Openhouse Careers", not three fragments.

## 4b. Navigation

**Navigation is a left sidebar**, role-aware — three links for a candidate, four
for an admin. The rail sits on `--paper-3` with a hairline right border, never a
shadow: nothing else in this design floats, and a shadow here would be the only
thing that does.

The active item is marked by a **2px accent rule on its left edge**, and it takes
the *content's* paper colour while its right hairline is covered — so it reads as
continuous with the page it opened, rather than as a highlighted list item. An
underline is the horizontal-nav idiom; a vertical nav marks the leading edge.

Below 860px a fixed rail would eat the viewport, so it becomes a horizontal strip
at the top: same links, same order, the active marker turned on its side. The
session email is dropped at that width — the sign-out icon still identifies it.

**One icon set, matched to the brand.** Lucide via `react-icons/lu` — the same
family openhouse.in itself ships (`lucide lucide-search`, `lucide-menu`, all at
stroke-width 2) — with the four social marks from `/fa6`, since Lucide dropped
brand icons. Nav items carry an icon and the current one takes the accent.

Everything is re-exported through `components/icons.jsx` under our own names, so
swapping sets is one file. Adding ~20 icons cost **+1.5 kB gzipped** — import
named icons from the subpath, never the barrel.

Emoji as a UI icon remains an auto-fail (gate 30).

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

## 7a. The landing field

A dense grid of vertical lines, noise-displaced, that diverge into flowing bands.
`<Waves />` behind the landing's mark panel.

**The 8px grid is the effect.** Widen it and the lines move in near-lockstep,
which reads as a flat ripple rather than a field. Two numbers, both measured
against the live reference rather than judged by eye:

| | reference | here |
|---|---|---|
| Grid | 159 × 80 = 12,720 pts | 122 × 117 = 14,274 pts |
| Frame (median) | 16.6 ms | 16.7 ms |
| Line-to-line divergence (p95) | 5.92 px | 6.2 px |

That last row is what makes the bands: how far neighbouring lines drift from even
spacing. Getting it right required a **noise x-scale of 0.0072, not the source's
0.003** — the source uses simplex, which carries more high-frequency content per
lattice unit than the gradient noise we ship, so the source's constant produced a
divergence of 1.7px instead of 5.9.

**Every line is `--accent`** at .5 alpha. The field reads as one material, and
the bands come from the geometry alone rather than from two colours interleaving.
The colour lives in CSS, so the component never has to know a token name.

**The cursor dot is removed.** The pointer still deforms the field — that is the
interaction; the dot was only a marker for it.

`simplex-noise` is not installed: the noise is ~30 lines inline, used once. The
field stops on `visibilitychange`, draws one static frame under
`prefers-reduced-motion`, and its `touchmove` is passive — the source called
`preventDefault`, which would kill scrolling on a phone.

## 7b. The loader

Six bars tracing a **house** — roof, walls, floor — in the accent, then erasing
it. `<Loader />`, used for the auth splash and every page-level loading state.

**Ported off styled-components on purpose.** That would have been a fifth runtime
dependency for one component, and every other style in this app lives in
`styles.css`. Classes are namespaced `ldr-*`; the source used bare `.h1`–`.h6`,
which is a collision waiting to happen in a stylesheet full of headings. Also
dropped: `z-index: 999999` (it would sit above modals) and the `.h5` / `.rot` /
`.rot2` rules, which no element referenced.

> **This is the one place that animates `height` / `top` / `bottom`**, against the
> rule in §7. Every bar is absolutely positioned inside a fixed 90×103 box, so
> nothing outside it can reflow — the rule exists to protect page content, and
> there is none inside a loader. Not licence to do it elsewhere.

Under `prefers-reduced-motion` the house is held **complete and static** rather
than blanked: six bars pulsing for three seconds is exactly what that setting is
for, but an empty box is not a loading indicator.

## 7c. Motion

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

## 7d. Guarding the stylesheet

```bash
cd frontend && npm run check:css
```

Asserts that every class used in a `.jsx` file has a rule in `styles.css`. It is
not a linter — it answers one question: *is anything referenced but undefined?*

It exists because block-replacing a region of `styles.css` has twice deleted
rules that components still used, and both times the result shipped visibly
broken and was caught only by looking at it. Run it before calling a frontend
change done.

## 8. Rules

- **All CSS in `frontend/src/styles.css`**, sectioned with `/* ───────── name ───────── */`
  banners, Hallmark stamp at the top. Never replace a *region between two section
  markers* — an unrelated block can be sitting inside it. Replace exact rules.
- **`npm run check:css` must pass** (§7d).
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
- [ ] More than one icon set, or an emoji used as a UI icon?
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
