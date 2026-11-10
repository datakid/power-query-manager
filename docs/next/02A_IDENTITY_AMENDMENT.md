# 02A — Identity amendment: the Glaze palette

**Status: binding. This file overrides parts of `02_IDENTITY.md`.** It is itself refined by `02B_VISUAL_REFINEMENT.md`: **every colour value here stands**, but `02B` replaces §4's radii and row heights, §6.8 (pane headers) and §6.10 (density default), and adds three ground tokens (`--hover`, `--press`, `--track`).

| In `02_IDENTITY.md` | What happens to it |
|---|---|
| §0 The name | Unchanged. Keep *quoin*. |
| §1 The mark: geometry, files, I-13, I-14, I-15 | Geometry unchanged. **Colour of the block changes** from sodium yellow to celadon (§3 below). New SVGs are in `assets-v2/`. |
| §2 The palette, I-1, I-2 | **Replaced** by §2 of this file. Sodium, cobalt, minium and patina are not used anywhere. |
| §2 Type and space | Kept, with the small changes in §4. |
| §3 Components I-3 … I-12 | Kept, but every colour reference is translated with the map in §5, and the details in §6 are added. |
| §4 Verification, I-16 | Kept. The baseline is taken with this palette. Workbench states are added by `06_WORKBENCH.md` WB-20. |

**When to run this.** If Phase 2 has not started, do Phase 2 with this file instead of `02` §2. If Phase 2 was already done with the sodium palette, this becomes item **I-R** and is the first item of Phase 6 (see `06_WORKBENCH.md` §3). It is a token swap, not a redesign: the component structure from `02` stays.

---

## 1. Why the palette changes

The owner's brief: *sleek, a delight to look at, light chroma, very uncommon yet fitting.*

Sodium yellow on grey-green is loud. It works for a warning sign; it tires the eye in a tool people will sit in for hours with 300 queries open. The new direction keeps everything that was right in `02` — cool mineral grounds, no cream, no serif, no brown, no indigo SaaS gradient, a dark readout band that makes it look like an instrument — and lowers the chroma of every accent until the data and the code are the most colourful things on screen.

**Name: Glaze.** A quoin is dressed stone; the accents are the colours of glazed stoneware and the minerals that make them. They are named for what they are, as in `02`:

| Name | What it is | Hue (OKLCH) | Role |
|---|---|---|---|
| **porcelain** | the white of a celadon-glazed body: grey with a breath of green | h ≈ 160, C ≤ 0.008 | grounds |
| **celadon** | the pale jade-grey glaze | h ≈ 168, C ≈ 0.06 | the primary action, the mark's block, "ok" |
| **slate** | a cool blue-grey stone | h ≈ 250, C ≈ 0.07 | focus, selection, links, the M language tag |
| **ochre** | earth pigment, dusted | h ≈ 78, C ≈ 0.08 | edited, stale, warnings |
| **madder** | the faded red dye | h ≈ 28, C ≈ 0.09 | errors, destructive confirmation |
| **thistle** | a grey mauve, barely there | h ≈ 330, C ≈ 0.04 | the VBA language tag, M types in the editor |

Why this is uncommon: nobody ships celadon + slate + thistle. Generic tools pick one saturated brand hue (blue, violet, green) and a grey. Glaze has five accents, all quiet, all at similar lightness, so the screen reads as one calm surface with information picked out in it.

Why it fits: it is still stone (the name), still cool (the instrument), and the low chroma means the syntax colours, the step status beads and the result chips can each have their own hue without the screen turning into a fairground. That matters far more in a workbench with many panes than it did in a single-editor app.

**What is not allowed** (so it does not drift back): no pure white ground, no pure black ground, no saturated accent (OKLCH C > 0.12 anywhere), no gradients, no warm cream, no brown, no violet primary, and nothing that looks like the old `--paper/--heather/--lichen/--flax/--clay` set (that palette was warm; this one is cool).

---

## 2. Tokens — replaces `02` I-1

Plain six-digit hex, as B-21 requires. `:root` is light; `[data-theme="dark"]` and the `prefers-color-scheme: dark` block are dark.

**Light**

```
--ground: #E9ECEA;  --surface: #F3F5F3;  --raised: #FBFCFB;  --sunk: #E1E5E2;
--line: #D3D9D5;    --line-strong: #7D8782;
--ink: #1A201E;     --ink-2: #3E4743;    --ink-3: #5A6460;
--celadon: #A9CFC0; --celadon-hover: #98C4B3; --on-celadon: #14231E; --celadon-edge: #5E9483;
--celadon-ink: #2F6B59; --celadon-soft: #DCEDE6; --celadon-mark: #4F8C79;
--slate: #4A6491;   --slate-ink: #3F5682; --slate-soft: #DDE4F0; --on-slate: #FFFFFF;
--ochre: #A88140;   --ochre-ink: #7A5A1C; --ochre-soft: #F3E9D6;
--madder: #B5574A;  --madder-ink: #94402F; --madder-soft: #F4E1DC;
--thistle: #8C7289; --thistle-ink: #6B5168; --thistle-soft: #EDE5EC;
--readout: #1E2422; --on-readout: #DDE3E0; --on-readout-2: #A3ADA8;
--syn-kw: #3F5682;  --syn-fn: #7A5A1C;   --syn-str: #2F6B59; --syn-num: #94402F;
--syn-com: #646E69; --syn-op: #3E4743;   --syn-qid: #1A201E; --syn-type: #6B5168;
--scrim: #1A201E;
```

**Dark**

```
--ground: #121615;  --surface: #181D1B;  --raised: #1F2522;  --sunk: #0E1110;
--line: #2A312E;    --line-strong: #6A756F;
--ink: #E3E8E5;     --ink-2: #B8C1BC;    --ink-3: #8D9792;
--celadon: #9CC9B8; --celadon-hover: #B2D7C9; --on-celadon: #10201A; --celadon-edge: #9CC9B8;
--celadon-ink: #8CC4AF; --celadon-soft: #1B2D27; --celadon-mark: #9CC9B8;
--slate: #9DB3DB;   --slate-ink: #9DB3DB; --slate-soft: #222C3D; --on-slate: #10151F;
--ochre: #D9B776;   --ochre-ink: #DDBB7C; --ochre-soft: #2E2716;
--madder: #E39484;  --madder-ink: #E8998A; --madder-soft: #351E1A;
--thistle: #C4A9C0; --thistle-ink: #C4A9C0; --thistle-soft: #2A2229;
--readout: #0A0D0C; --on-readout: #DDE3E0; --on-readout-2: #8D9792;
--syn-kw: #9DB3DB;  --syn-fn: #DDBB7C;   --syn-str: #8CC4AF; --syn-num: #E8998A;
--syn-com: #848E89; --syn-op: #B8C1BC;   --syn-qid: #E3E8E5; --syn-type: #C4A9C0;
--scrim: #000000;
```

`--scrim` is used with opacity in the component (`opacity: .32` light, `.6` dark is done with a `color-mix` or a separate `--scrim-opacity` number token; keep colours hex-only).

The ratios for every pair in §7 were computed for these values and are listed in `assets-v2/glaze-preview.html`, which recomputes them live. As in `02`: **verify, do not trust.** If a pair is below target, move the *ink* side in steps of 4 % lightness, never the ground, and record the final value here.

**Roles**

| Token | Used for |
|---|---|
| `--ground` | the page behind everything |
| `--surface` | top bar, navigator, panels, editor |
| `--raised` | dialogs, menus, popovers, the command palette, the selected navigator row, the active tab |
| `--sunk` | gutters, table headers, pane headers, the empty-state well |
| `--line` / `--line-strong` | hairlines / section rules and control borders |
| `--ink`, `--ink-2`, `--ink-3` | primary, secondary, meta text |
| `--celadon` (fill) | **one** filled primary action per screen state (Run, or Save in the save dialog) |
| `--celadon-ink` / `--celadon-soft` | "ok", "matches Excel", "saved", a step that ran cleanly |
| `--celadon-mark` | the block in the mark, nothing else |
| `--slate` | focus ring, text selection, links, the step cursor, the current navigator item's 3 px bar |
| `--ochre` | edited, stale (inputs changed since the last run), warnings, pinned |
| `--madder` | errors and destructive confirmation |
| `--thistle` | the VBA tag, M type names in the editor |
| `--readout` | the status strip: the one inverted band, both themes |

**Discipline, carried over from `02` and made stricter:** one celadon fill per screen. Every other button is secondary or quiet. Colour never carries meaning alone: every coloured state also has a glyph or a word (✓ is fine as a glyph in SVG; it is not text, so the emoji rule in T-LINT-9 does not apply to an icon — but do not put it in `strings.js`).

---

## 3. The mark in Glaze

Same geometry as `02` §1. The ring is `--ink` (light) / `--ink` (dark). The block is `--celadon-mark`: `#4F8C79` on light grounds (about 3.3 : 1 against `--ground`, so it survives as a non-text shape), `#9CC9B8` on dark grounds.

Files in `plan/assets-v2/`, which replace the sodium versions in `plan/assets/`. **Dark-scheme ring:** the ring must be `--ink` dark `#E3E8E5` in the favicon's dark block and `--on-readout` `#DDE3E0` in the maskable icon. Earlier renders drew it near `#2E3232` on black (about 1.5 : 1), and only the block was visible. See `02B` §7.2 and T-I-09.

- `mark.svg` — 64 grid. Ring stroke uses `currentColor` with an explicit fallback; block uses the light celadon-mark value.
- `favicon.svg` — 32 grid, heavier construction, one `prefers-color-scheme` block (the only `<style>` in the project, as `02` already records).
- `icon-maskable.svg` — 128 grid, full-bleed `--readout` ground, the mark at 120 % of its 64-unit grid centred, so the silhouette's corners stay inside the 40 % safe-zone radius.

During a run the block may do one thing: its opacity steps between 1 and 0.7 on a 1.2 s cycle (`I-18`, below). Nothing else in the mark ever moves.

---

## 4. Type, space, shape — small changes to `02`

```
--font-ui: "Atkinson Hyperlegible Next", system-ui, sans-serif      (unchanged)
--font-code: "Commit Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace
--t-2xs: 10.5px/1.4   new: tab badges, bead counts, pane-header labels
--t-xs: 11px/1.45  --t-sm: 12px/1.5  --t-md: 13.5px/1.5  --t-lg: 16px/1.35  --t-xl: 21px/1.25
--t-code: 13px/1.6
--r-*, --h-*: see 02B §2 (replaces the 4/7/12 radii and the 24/30 row heights that were here)
--ease: cubic-bezier(.2,.7,.2,1)   --dur-1: 90ms   --dur-2: 140ms   --dur-3: 220ms
```

`Commit Mono` is already in `public/fonts/` per the README; if H-1 removed it, use the system stack and record it.

The UI is slightly smaller than in `02` (13.5 px body) because a workbench is dense; `02B` gives it the air back with spacing, not with type size. Pane-header labels are sentence case, `--t-sm` 600 `--ink-2` (`02B` §4.4). No upper-case letter-spaced labels anywhere. All numbers everywhere use `font-variant-numeric: tabular-nums`.

Shadow, still only one: `--shadow-overlay: 0 1px 0 rgb(0 0 0 / .04), 0 12px 32px rgb(16 24 20 / .14)` light, `0 1px 0 rgb(0 0 0 / .4), 0 12px 32px rgb(0 0 0 / .55)` dark. Because this is not hex it is exempt from B-21; list it as exempt in `pairs.json` with the reason.

---

## 5. Token migration — replaces `02` I-2

From the old app tokens **and** from the `02` sodium tokens (whichever exist when this runs):

| Old (app) | Old (`02`) | New |
|---|---|---|
| `--paper` | `--ground` | `--ground` |
| `--heather`, `--heather-hover` | `--cobalt`, `--cobalt-ink` | `--slate`, `--slate-ink` |
| `--heather-soft` | `--cobalt-soft` | `--slate-soft` |
| `--on-heather` | `--on-cobalt` | `--on-slate` |
| `--flax` (primary) | `--sodium`, `--sodium-hover`, `--on-sodium` | `--celadon`, `--celadon-hover`, `--on-celadon` |
| `--flax` (edited dot) | `--sodium` in rail dot (I-4) | `--ochre` |
| `--flax-soft` (drag zone) | `--sodium-soft` | `--celadon-soft` |
| — | `--sodium-ink` | `--ochre-ink` for edited/stale text, `--celadon-ink` for primary-coloured text |
| `--lichen*` | `--patina*` | `--celadon-ink`, `--celadon-soft` |
| `--clay*` | `--minium*` | `--madder*` |
| — | `--syn-*` | `--syn-*` (new values) plus new `--syn-type` |

Same procedure as `02` I-2: delete every old token in the same commit, `npm run test:lint`, grep for unresolved `var(--` names, rewrite `tests/a11y/pairs.json`.

The `02` I-4 rail rule "selected row: a 3 px sodium bar" becomes **3 px slate bar**. The `02` I-10 drop zone "while dragging: sodium border, sodium-soft ground" becomes **celadon-edge border, celadon-soft ground**.

---

## 6. Delight — the details that make it sleek

Each is a small commit under **I-18**. They are what separates "tokens applied" from "a pleasure to use". All are disabled or reduced under `prefers-reduced-motion: reduce` (T-I-06 still applies).

1. **Tonal depth, no borders where tone will do.** Panes are separated by tone (`--surface` against `--ground`) plus one hairline on the inside edge only. Never a border on both sides of a gap.
2. **The focus ring floats.** `outline: 2px solid var(--slate); outline-offset: 2px;` everywhere, plus inside dense lists (navigator, steps, tabs) an inset variant `outline-offset: -2px` so it is not clipped by `overflow`. Never removed.
3. **Hover is a tone, press is a nudge.** Hover: background to the next ground up. Press: `transform: translateY(.5px)` for `--dur-1`. No scale effects, no glows.
4. **Status beads.** The single most repeated element in the workbench (`06` WB-8, WB-10): a 8 px circle. Ok = `--celadon-ink` filled; error = `--madder` filled with a 2 px gap ring; stale = `--ochre` hollow ring; running = `--slate` ring with a 270° arc rotating once per 900 ms; queued = `--line-strong` hollow; skipped = `--ink-3` with a horizontal bar. Each bead has an accessible name; colour is never the only signal (shape differs for every state).
5. **Numbers that settle.** Row counts and durations in the readout change by cross-fading the old and new value over `--dur-2`; they do not count up. Durations show `48 ms`, `1.2 s`, `1 m 04 s`.
6. **Result arrival.** When a run finishes, the grid header gets a 1 px `--celadon-edge` underline that fades out over `--dur-3`. That is all. No toast for a successful run; the status strip says it.
7. **The mark breathes while running.** Block opacity 1 → 0.7 → 1 over 1.2 s, only while the run queue is non-empty. Off under reduced motion.
8. **Pane headers.** Replaced by `02B` §4.4: 36 px, part of the pane surface, sentence-case title, up to three icon buttons and `⋯`, a hairline only while scrolled.
9. **Icons.** One in-house set: 16 px grid, 1.5 px stroke, round caps, `currentColor`, drawn as `<symbol>`s in one `public/icons.svg` sprite and used with `<use href>`. No icon font, no dependency. Required set (28): run, run-to-here, run-all, stop, step, reorder-grip, pin, unpin, filter, search, sort, graph, list, tab-close, split, chevron-r, chevron-d, plus, duplicate, rename, delete, bypass, revert, diff, print, save, palette, more. T-I-07 covers the sprite (parses, no script, no external refs, no comments).
10. **Density.** Two densities, *comfortable* (32 px rows) and *compact* (28 px), per `02B` §3.4. **Comfortable is the default everywhere.** Switched in Settings, the View menu and the palette. In memory only unless the owner approves D-1 in `06`.
11. **Scrollbars.** `scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin;` on panes. Nothing more custom than that.
12. **Selection.** `::selection { background: var(--slate-soft); color: var(--ink); }` in the editor and the grid.

**I-19 — Skeletons, not spinners.** Loading states for the navigator, the steps list and the grid are 3–6 rows of `--sunk` bars at the real row height, with the real column headers if known. A spinner appears only inside the status bead.

---

## 7. `pairs.json` — replaces the list in `05` §2 (Phase 2)

Minimum 4.5 unless stated. Both themes.

- `--ink`, `--ink-2`, `--ink-3` × `--ground`, `--surface`, `--raised`, `--sunk` (12)
- `--on-celadon` × `--celadon`, `--celadon-hover`
- `--celadon-edge` × `--surface`, `--ground` (3.0, button boundary)
- `--celadon-mark` × `--ground`, `--surface` (3.0, non-text)
- `--celadon-ink` × `--surface`, `--raised`, `--celadon-soft`
- `--slate` × `--ground`, `--surface`, `--raised` (3.0 as focus ring; 4.5 as link text — test both); `--slate-ink` × `--slate-soft`; `--on-slate` × `--slate`
- `--ochre-ink` × `--surface`, `--raised`, `--ochre-soft`; `--ochre` × `--surface` (3.0, bead)
- `--madder-ink` × `--surface`, `--raised`, `--madder-soft`; `--madder` × `--surface` (3.0, bead)
- `--madder-ink` × `--readout` is **not** required; errors in the readout use `--on-readout` text with a madder bead (the dark readout and a muted red do not reach 4.5 in light theme; do not try).
- `--thistle-ink` × `--surface`, `--thistle-soft`
- `--on-readout`, `--on-readout-2` × `--readout`
- every `--syn-*` × `--surface`
- `--line-strong` × `--surface`, `--ground` (3.0)
- from `02B` §2: `--ink-2` × `--hover`, `--ink-3` × `--track`, `--ink` × `--press`, `--ink-2` × `--raised` (4.5); `--slate` × `--hover` (3.0, focus ring on a hovered row)

Exempt, with reasons in the file: `--line`, `--scrim`, `--shadow-overlay`, `--celadon` (a fill, carried by `--on-celadon` text and `--celadon-edge`), `--hover`, `--press`, `--track` (grounds only, ink pairs listed above), `--ochre-soft`, `--madder-soft`, `--celadon-soft`, `--slate-soft`, `--thistle-soft` as grounds only.

---

## 8. Acceptance for this amendment

- No hex outside `tokens.css` (T-LINT-6); no token from the old sets resolves anywhere.
- Contrast test green; the self-coverage assertion from B-21 lists zero uncovered tokens.
- The 40 baseline screenshots from `02` I-16 retaken, **looked at**, and the owner shown four of them (empty state light, query selected dark, result grid light, VBA module dark) before the baseline is committed.
- No OKLCH chroma above 0.12 in any token: add `T-I-08`, a unit test that converts every token to OKLCH and asserts `C ≤ 0.12` (the conversion is 30 lines of pure maths in the test file; no dependency).
