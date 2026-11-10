# 02 — Identity

## 0. The name

Keep **quoin**. Do not rename. Reasons, so the decision is not re-opened later:

- One syllable, pronounced *coin*. Familiar sound, unfamiliar spelling — that combination is exactly what makes a name ownable (Lyft, Flickr, Shopify). A name nobody can spell from hearing it is a cost; a name everybody can *say* and nobody else *owns* is an asset.
- It means something true about the product: a quoin is the dressed cornerstone at the edge of a building — the visible, load-bearing block. The app shows the working parts at the corner of a workbook. The tagline already lands this: *"The working parts of a workbook."*
- It is short enough to be a wordmark set in one weight, and it gives a mark for free (below).
- Four letters, no hyphen, no misspelled vowel, no `-ly`, no `.ai`.

If the owner ever does rename, the only coupling is: `S.appName`, `<title>`, `manifest.webmanifest`, the `quoin.theme` storage key (**never** change this one without a migration — and G-3 forbids a migration, so changing it silently discards the user's theme), and the three icon files. Everything else refers to `S.appName`.

**I-17 (optional, only on the owner's word):** rename behind `S.appName` and leave `quoin.theme` alone. Do not start this unprompted.

---

## 1. The mark

### Why neither of the two drafts works

- **The "E|" draft** (dark square, three grey bars, a yellow slab): three bars plus a slab is four elements. At 16 px the bars merge into a smear, and the silhouette is a plain rounded square — the same silhouette as a thousand app icons. It also says "list", not "workbook".
- **The purple octagon "Q"** (octagon outline with a diagonal handle): it reads as a magnifying glass over a stop sign, the handle collides with the outline at small sizes, and an outlined octagon has eight corners fighting a round counter. Nothing about it is memorable, and purple/olive is the exact palette of every 2016 developer-tool rebrand.

### The concept: the cornerstone

**One shape. One accent. One idea.**

A square ring — the frame of the workbook — with the bottom-right corner replaced by a solid block. Every other corner is rounded; the block's outer corner is **square**. That single sharp corner is the quoin: the dressed stone that squares the wall.

It happens to read as a **Q**. That is the whole design: the counter is the ring, the tail is the block. Nothing is drawn that does not do two jobs.

Why this is the right kind of mark:

| Requirement | How the shape meets it |
|---|---|
| **Scalable** | Two primitives. At 16 px the ring is a 2 px stroke and the block is a 5 px square — both land on whole pixels at 16, 24, 32, 48, 64. |
| **Adaptive** | The ring takes the foreground colour (ink in light, bone in dark); the block is always sodium yellow. Works on any ground, in one colour, engraved, embroidered, at 1 bit. |
| **Memorable** | A rounded square with exactly one sharp corner is an anomaly. Anomalies are what people remember. |
| **Iconic** | No gradient, no shadow, no bevel, no letterform outline, no inner detail. It survives being a 1-colour sticker. |
| **Not generic** | It is not a chevron, a hexagon, a swoosh, an abstract bird or a rounded-square-with-a-glyph. |

### Geometry (fixed — do not redraw by eye)

64-unit grid. Ring: `rect x=10 y=10 w=44 h=44 rx=14`, `stroke-width 8`, no fill, so the outer silhouette spans 6 → 58. Block: the square 38 → 58 on both axes, corner radius 4 on three corners and **0** on the bottom-right. The block covers the ring's bottom-right arc completely, so the two shapes share edges and there is never a hairline seam at any scale.

The 32-unit favicon is the same construction with heavier proportions: ring `x=5 y=5 w=22 h=22 rx=7`, `stroke-width 5`; block 19 → 29.5 with radius 2 on three corners.

Clear space around the mark: one quarter of its width on every side. Minimum size: 16 px on screen, 6 mm in print.

### Files (in `assets/`, copy to `public/`)

- `favicon.svg` — 32 grid, adapts to the OS colour scheme through one `prefers-color-scheme` block inside the SVG. (An SVG used as a favicon is an independent document, so the page CSP does not apply to it; this is the only place in the project with a `<style>` element, and `docs/decisions.md` must record that.)
- `mark.svg` — 64 grid, transparent ground, inherits colour from `currentColor` where embedded in the page via `svgImg`/inline use, with an explicit fallback fill for standalone use.
- `icon-maskable.svg` — 128 grid, full-bleed ink ground, content scaled to 60 % and centred so it survives Android's circular mask.

### I-13 — Replace the mark
Replace `public/favicon.svg` and `public/mark.svg` with the files from `assets/`. Check the empty state, the top bar and the browser tab in both themes at 100 % and 200 % zoom.

### I-14 — Regenerate the raster icons
Rewrite `scripts/make-icons.mjs` per B-22 and produce `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (opaque). Update `manifest.webmanifest` to list `any` and `maskable` purposes separately.

### I-15 — Wordmark
No custom lettering. The wordmark is the product name set in Atkinson Hyperlegible Next **600**, all lower case, letter-spacing `-0.01em`, with the mark at cap height to its left and a gap of `var(--s-2)`. That is the whole wordmark. Do not draw a logotype.

---

## 2. The palette

Named after what the colours actually are, not after moods: **sodium** (street-lamp yellow), **cobalt**, **minium** (red lead), **patina**. The grounds are a cool mineral grey-green, not white and not warm cream. The result does not look like a SaaS dashboard (no indigo/violet, no gradient) and does not look like a cosy editorial site (no cream, no serif, no brown).

### I-1 — Rewrite `styles/tokens.css`

Both blocks are plain six-digit hex (B-21 depends on this). `:root` holds light; `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` hold dark. Keep the existing `@font-face` rules and the unicode-range split.

**Light**

```
--ground: #DCE0DA;  --surface: #EBEEE8;  --raised: #F7F8F5;  --sunk: #D0D5CE;
--line: #BCC3BA;    --line-strong: #768076;
--ink: #111413;     --ink-2: #343B37;    --ink-3: #4F5852;
--sodium: #FFC21F;  --sodium-hover: #F2B200; --on-sodium: #111413;
--sodium-ink: #6E4E00; --sodium-soft: #FCEDBF;
--cobalt: #2341C8;  --cobalt-ink: #2341C8; --cobalt-soft: #DCE2FA;
--minium: #C9400F;  --minium-ink: #A3330B; --minium-soft: #F8E0D5;
--patina: #1B7F63;  --patina-ink: #13644E; --patina-soft: #D3ECE3;
--readout: #111413; --on-readout: #DCE0DA; --on-readout-2: #A7B0A9;
--syn-kw: #2341C8;  --syn-fn: #7A4F00;   --syn-str: #13644E; --syn-num: #A3330B;
--syn-com: #56605A; --syn-op: #343B37;   --syn-qid: #111413;
```

**Dark**

```
--ground: #0D100F;  --surface: #131716;  --raised: #191E1C;  --sunk: #090B0A;
--line: #252C29;    --line-strong: #4A544E;
--ink: #E6EAE4;     --ink-2: #B9C0B8;    --ink-3: #8F978F;
--sodium: #FFC21F;  --sodium-hover: #FFD04D; --on-sodium: #111413;
--sodium-ink: #FFC21F; --sodium-soft: #3A2E05;
--cobalt: #8FA6FF;  --cobalt-ink: #8FA6FF; --cobalt-soft: #1A2246;
--minium: #FF8559;  --minium-ink: #FF8559; --minium-soft: #3A1B10;
--patina: #4FC3A1;  --patina-ink: #4FC3A1; --patina-soft: #0E3327;
--readout: #090B0A; --on-readout: #DCE0DA; --on-readout-2: #8F978F;
--syn-kw: #8FA6FF;  --syn-fn: #FFC21F;   --syn-str: #4FC3A1; --syn-num: #FF8559;
--syn-com: #8A938C; --syn-op: #B9C0B8;   --syn-qid: #E6EAE4;
```

These values are a **starting point that must be verified, not trusted**: run the rewritten contrast test (B-21) first. If a pair falls below its target, adjust the *ink* side, never the ground side, in steps of 4 % lightness, and record the final value here.

**Roles, so nobody guesses:**

| Token | Used for |
|---|---|
| `--ground` | the page behind everything |
| `--surface` | top bar, rail, panels |
| `--raised` | dialogs, menus, popovers, the cell detail card |
| `--sunk` | gutters, table headers, the empty state well |
| `--line` / `--line-strong` | hairlines / header and section rules |
| `--ink`, `--ink-2`, `--ink-3` | primary text, secondary text, meta text |
| `--sodium` | exactly one thing per screen: the primary action, and the mark's block |
| `--cobalt` | links, focus ring, selection |
| `--minium` | errors and destructive confirmation |
| `--patina` | success, "saved", "matches Excel" |
| `--readout` / `--on-readout` | the status strip at the bottom: an inverted band in both themes |

**Discipline:** sodium is the loudest colour in the set and is reserved. One sodium element per screen state. If two things want it, one of them is not the primary action.

### Type and space (keep the existing token names)

```
--font-ui: "Atkinson Hyperlegible Next", system-ui, sans-serif
--font-code: ui-monospace, "SF Mono", Menlo, Consolas, monospace
--t-xs: 11px/1.45  --t-sm: 12px/1.5  --t-md: 14px/1.5  --t-lg: 17px/1.35  --t-xl: 22px/1.25
--t-code: 13px/1.6
--s-1: 4px  --s-2: 8px  --s-3: 12px  --s-4: 16px  --s-5: 24px  --s-6: 32px  --s-7: 48px
--r-1: 3px  --r-2: 6px  --r-3: 10px
--z-rail: 10  --z-sticky: 20  --z-overlay: 30  --z-dialog: 40
```

No shadows anywhere except one: `--shadow-overlay: 0 8px 24px rgb(0 0 0 / .18)` in light, `0 8px 24px rgb(0 0 0 / .5)` in dark, used only by dialogs, menus and popovers. Depth is expressed with the four ground tokens and hairlines, not with blur.

### I-2 — Token migration

Mechanical pass over `styles/app.css`, `styles/editor.css`, `styles/grid.css`:

| Old | New |
|---|---|
| `--paper` | `--ground` |
| `--heather` | `--cobalt` |
| `--heather-soft` | `--cobalt-soft` |
| `--heather-hover` | `--cobalt` (focus rings do not hover) |
| `--on-heather` | `#FFFFFF` via `--on-cobalt` (add it) |
| `--lichen*` | `--patina*` |
| `--flax*` | `--sodium*` |
| `--clay*` | `--minium*` |

Delete every old token from `tokens.css` in the same commit, run `npm run test:lint`, and grep for `var(--` names that no longer resolve. Rewrite `tests/a11y/pairs.json` for the new names (see 05 §2).

---

## 3. Components

Each item is one commit. Each must be checked in both themes at 1280×800 and 390×844.

### I-3 — Top bar
56 px, `--surface`, bottom hairline `--line`. Left: mark + wordmark. Centre: the file name with its size and format as `--ink-3` meta text, truncating from the middle (`text-overflow` cannot do this — implement with two spans and `direction: rtl` on the tail, or truncate in JS at a measured width; prefer the two-span trick, no JS). Right: Run, Download, Print, overflow menu. Below 700 px wide, labels collapse to icons with `aria-label`s and the file meta moves to the status strip.

### I-4 — Rail
240 px, `--surface`, right hairline. Two groups with sticky `--sunk` headers: Queries, Macros. Each row: name in `--ink`, load target in `--ink-2` at `--t-xs`, and a right-aligned state marker. Selected row: `--raised` background, a 3 px `--sodium` bar on the left edge, and `aria-selected="true"`. Edited row: a filled 6 px sodium dot plus the word `edited` for anyone who cannot see the dot. Function queries keep the `ƒ` badge. At 390 px the rail becomes a full-width sheet opened from a top-bar button; the current item's name stays in the top bar.

### I-5 — Buttons
Three kinds only. **Primary**: `--sodium` ground, `--on-sodium` text, `--r-2`, 32 px tall, no border. **Secondary**: transparent ground, `--line-strong` border, `--ink` text. **Quiet**: no border, `--ink-2` text, `--surface` on hover. Disabled: 55 % opacity plus `aria-disabled`, never `display:none`. Focus ring everywhere: `2px solid var(--cobalt)` with `2px` offset — never remove it, never replace it with a colour change.

### I-6 — The status strip
32 px, `--readout` ground, `--on-readout` text, `--font-code` at `--t-xs`. It is the one inverted band in the design and it is what makes the app look like an instrument rather than a form. Left: the polite status region. Right: row count, run duration, and the Excel-comparison verdict as a chip (`--patina-soft`/`--minium-soft`). Errors appear in the separate alert region in `--minium-ink` on `--readout`; check that pair in the contrast test.

### I-7 — Editor
`--surface` ground, gutter `--sunk` with `--ink-3` numbers, current line `--raised`, the error line marked with a `--minium` 2 px left bar and the number in `--minium-ink`. Syntax colours from the `--syn-*` tokens only. Selection `--cobalt-soft`. Matching bracket: 1 px `--line-strong` box, not a colour change. Find bar docks at the top-right of the editor on `--raised` with a shadow.

### I-8 — Grid
Header `--sunk`, 44 px, two lines: name in `--ink`, type label in `--ink-3` at `--t-xs`. Body rows 28 px, hairline `--line`, no zebra striping (it fights the print bands in 04). Hover row: `--surface`. Focused cell: 2 px `--cobalt` inset outline. `null` is `--ink-3` italic. Numbers are right-aligned with `font-variant-numeric: tabular-nums`. Errors in a cell: `--minium-ink` on `--minium-soft`. The index column is `--sunk`, sticky, `--ink-3`.

### I-9 — Dialogs, menus, popovers
`--raised`, `--r-3`, 1 px `--line`, `--shadow-overlay`, backdrop `rgb(0 0 0 / .32)` light and `rgb(0 0 0 / .6)` dark (add as `--scrim`). Title `--t-lg` 600. Actions bottom-right, primary last. Max width 480 px; full-width sheet below 480 px viewport.

### I-10 — Empty state
Centred column, max 420 px: the mark at 64 px, the tagline at `--t-xl`, the drop zone, and the privacy line at `--t-sm` `--ink-3`. Drop zone: 2 px dashed `--line-strong`, `--r-3`, `--sunk` ground; while dragging, `--sodium` border and `--sodium-soft` ground. The existing e2e assertions on `.empty img.mark`, `.empty h2` and `.footnote` must keep passing — do not rename those classes (W-2).

### I-11 — Motion
Transitions only on `background-color`, `border-color`, `color`, `opacity` and `transform`, 120 ms `ease-out`. Nothing animates layout. Everything above is disabled under `@media (prefers-reduced-motion: reduce)`.

### I-12 — Forced colours
Add `@media (forced-colors: active)`: use `ButtonText`, `Canvas`, `CanvasText`, `Highlight`; set `forced-color-adjust: none` only on the mark; make sure the sodium primary button still reads as a button (it will fall back to system colours — confirm the border survives).

---

## 4. Verification

### I-16 — Visual baseline
Ten states, each captured at 1280×800 and 390×844, in light and dark (40 screenshots). **Look at every one.**

1. Empty state. 2. Empty state mid-drag. 3. A query selected, not yet run. 4. A query running. 5. A result grid with 10 000 rows. 6. A result that differs from the Excel snapshot. 7. A query with a parse error (gutter marker + status). 8. A VBA module open. 9. Settings dialog open. 10. The print preview (after Phase 4).

Store them as Playwright snapshots with a 0.2 % pixel tolerance, fonts preloaded and `prefers-reduced-motion: reduce` forced, so they are stable.

### Acceptance for Phase 2
- Contrast test green with the rewritten `pairs.json`, and the new self-coverage assertions from B-21 active.
- axe reports zero violations on states 1, 3, 5, 8, 9.
- No raw colour outside `tokens.css` (T-LINT-6 already enforces this).
- The favicon is legible at 16 px in a real browser tab in both OS schemes — check it, do not assume it.
