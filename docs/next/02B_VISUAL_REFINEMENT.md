# 02B — Visual refinement: calm, rounded, nothing lost

**Status: binding. Read straight after `02A_IDENTITY_AMENDMENT.md`.**
`02` gives the name, the mark geometry and the component list. `02A` gives the Glaze colours. **This file gives the shape, spacing, hierarchy and disclosure rules** that make the app calm to look at. It also sets the contract that no control, option or feature is removed to get there.

| In `02` / `02A` / `06` | What happens to it |
|---|---|
| `02A` §2 colour tokens | **Kept exactly.** No colour value changes. Three tokens are added in §2 below. |
| `02A` §4 radii `--r-1 … --r-3`, row heights `--row-*` | **Replaced** by §2 of this file. |
| `02` §2 spacing `--s-1 … --s-7` | **Kept.** Values unchanged. `--s-0: 2px` is added. |
| `02` I-3 top bar 56 px, `06` §1 top bar 48 px | **Replaced:** 52 px, on the ground, not a panel (§4.1). |
| `02` I-4 rail, `06` WB-11 row look | Behaviour kept. Look replaced by §4.3. |
| `02` I-5 buttons | Three kinds kept. Sizes and radii from §2; an *icon* size is added (§4.2). |
| `02` I-6 readout 32 px, `06` §1 readout 28 px | **Replaced:** a 32 px floating bar with rounded ends (§4.8). Still the one inverted band. |
| `02` I-7 editor gutter on `--sunk` | **Replaced:** the gutter takes the editor's tone (§4.5). |
| `02` I-8 grid header 44 px on `--sunk`, rows 28 px | **Replaced** by §4.6. |
| `02` I-9 dialogs `--r-3` | **Replaced:** `--r-4`, padding `--s-5` (§4.9). |
| `02A` §6.8 pane headers 28 px, upper case, letter-spaced | **Replaced:** 36 px, sentence case (§4.4). Upper-case labels are not used anywhere. |
| `02A` §6.10 density default "compact above 900 px height" | **Replaced:** *comfortable* is the default everywhere; *compact* is a setting and a palette command (§3.4). |
| `02A` §2 "one celadon fill per screen" | Made precise: one per **layer** (§3.2). |
| Everything in `03`, `04`, `06` that is a control, option, command, shortcut or state | **Unchanged and mandatory.** §5 is the inventory; §6 tests it. |

**When to run it.** Phase 2 runs `02` → `02A` → `02B` as one phase: tokens (I-1 with `02A` colours and `02B` shape tokens), migration (I-2), then components I-3 … I-12 built to §4 of this file, then I-18 (`02A` §6) and I-19. If Phase 2 is already done, this becomes item **I-V**, the second item of Phase 6 after I-R. Like I-R it is a token-and-component pass. Behaviour does not change.

---

## 1. The idea, in one paragraph

The owner wants it **rounded, minimal and calm, a pleasure to look at, with no loss of power.** The earlier drafts reached *correct*, but not *calm*. Every pane was a flat slab touching its neighbours. Labels were upper case and letter-spaced. Rows were 24 px. Toolbars showed every action at once with the same weight. The fix is not fewer features. It is **better hierarchy and more air**. Panes float as rounded surfaces on a quiet ground. Each region has exactly one thing that is loud. Secondary actions are quiet until the object they act on is focused. Every action is still reachable in at least two ways, and that is tested (§6).

Picture a well-made instrument: one bright dial and many recessed controls. The controls are not hidden, just quieter.

---

## 2. Tokens: shape, size and the three additions

Add these to `styles/tokens.css` next to the `02A` colours. All are lengths, so B-21's hex rule does not apply. List them in the lint allow-list for T-LINT-17 (§6).

```
--s-0: 2px                      new, only for hairline offsets and bead gaps
--s-1: 4px  --s-2: 8px  --s-3: 12px  --s-4: 16px  --s-5: 24px  --s-6: 32px  --s-7: 48px   (unchanged)

--r-1: 6px     chips inside rows, kbd, count pills' inner shapes, tooltips
--r-2: 10px    buttons, inputs, selectable rows, tabs, menu items, segmented-control thumbs
--r-3: 14px    panes, menus, popovers, cards, the readout bar, the drop zone
--r-4: 20px    dialogs, the command palette, the print settings panel, mobile sheets
--r-pill: 999px  beads' rings, filter chips, the mobile region switcher

--h-bar: 52px          top bar
--h-pane-head: 36px    pane headers
--h-ctl: 32px          buttons, inputs, segmented controls (comfortable)
--h-ctl-sm: 28px       the same in compact, and every control inside a pane header
--h-row: 32px          navigator, steps, outline, problems, queue rows (comfortable)
--h-row-sm: 28px       the same in compact
--h-grid-row: 30px     result grid body rows (comfortable)
--h-grid-row-sm: 26px  compact
--gutter: 8px          the channel of ground between floating panes (desktop only)

--shadow-pane: 0 1px 2px rgb(16 24 20 / .05), 0 0 0 1px rgb(16 24 20 / .03)    light
--shadow-pane: 0 0 0 1px rgb(0 0 0 / .35)                                      dark
--shadow-overlay: (unchanged from 02A)
```

Colour additions to `02A` §2. Both themes, hex, covered by `pairs.json`:

```
light:  --hover: #EBEEEC   --press: #E3E7E4   --track: #E4E8E5
dark:   --hover: #232A27   --press: #1A201D   --track: #151A18
```

`--hover` is the row and quiet-button hover tone on `--surface`. `--press` is the pressed tone. `--track` is the sunken track behind segmented controls and the search field. They exist so that hover is a tone (`02A` §6.3) without reusing `--raised`, which means *selected*. Add them to the exempt list in `pairs.json` with the reason *grounds only, ink pairs covered by --surface*. Then add the three real pairs: `--ink-2 × --hover`, `--ink-3 × --track`, `--ink × --press` (4.5).

**Nested radius rule.** An element inside a rounded container uses `outer radius − padding`, floored at `--r-1`. In practice a row with `--r-2` sits inside a pane with `--r-3` and `--s-1` of inset, and a button with `--r-2` sits inside a dialog with `--r-4`. Never put a square-cornered child flush against a rounded parent's corner. The pane's first and last child either inset or clip (`overflow: clip` on the pane).

**Why the row heights grew.** `02A` set 24 px compact and 30 px comfortable. At 24 px a bead, a name, a glyph, a count and an edited mark cannot have air between them, and 24 px is also the WCAG 2.5.8 minimum target, so there is no margin. Comfortable 32 px with compact 28 px keeps 320 queries usable: 22 rows at comfortable or 25 at compact in a 720 px navigator, which is plenty with search, chips and grouping. Virtualisation (WB-11) is unaffected.

---

## 3. Rules of hierarchy

These rules make the screen calm. Each is checkable, and §6 checks the ones a machine can check.

### 3.1 Three levels of emphasis, never more
Every region has at most:
1. **One title**: the pane header label at `--t-sm` 600 `--ink-2`, or the item name in the editor tab.
2. **One loud affordance**: in the top bar, the Run split-button. In the steps pane, the step cursor bar. In a dialog, its primary action.
3. **Everything else quiet**: `--ink-2` or `--ink-3` text, quiet icon buttons, chips with no fill until active.

If a design needs a fourth level, something on level 2 is not the primary thing.

### 3.2 One filled button per layer
A *layer* is the base screen or one open overlay (dialog, popover, palette, sheet). Each layer has at most one `--celadon` filled button. On the base screen that is **Run** (or **Cancel** while running, E-5). In the Add-as-a-step popover it is **Apply**. In the save dialog it is **Save**. In the macro context (WB-25) **Run these queries** is primary *inside the outline section*, and the top-bar Run stays filled, which would be two. So the outline's button uses the **secondary** style with the celadon-ink text colour, and the top-bar Run's menu gains *Run this macro's queries* while a module procedure with links is current. T-V-04 counts.

### 3.3 Space does the separating
- Panes are separated by `--gutter` of ground, **not** by borders. Inside a pane, sections are separated by `--s-4` of space and a sentence-case heading. A hairline `--line` is used only where two scrolling regions meet inside one pane (the steps list and the dependency list).
- Never a border on both sides of a gap (`02A` §6.1, kept).
- Padding inside panes: `--s-3` horizontal, `--s-2` vertical. Rows inset by `--s-1` on each side so their rounded selection never touches the pane edge.
- Dialogs: `--s-5` padding, `--s-4` between groups, `--s-2` between a label and its control.
- Readable line length: prose (dialogs, honest notes, empty states) is capped at `64ch`.

### 3.4 Density is a choice, comfortable is the default
*Comfortable* is the default at every size, because the brief is breathing room. *Compact* swaps `--h-row`, `--h-ctl`, `--h-grid-row` for their `-sm` values with one class on `<html>`. Nothing else changes. Compact is in Settings, in the palette (`>density`), and the view menu. It lives in memory unless D-1 is approved. The navigator does not change density by itself.

### 3.5 Quiet until relevant: the disclosure tiers
Every control lives in at least one of these tiers. **Tier 4 is mandatory for every command**, and every command also lives in one of Tier 1 to 3. Hiding a control means moving it down a tier, never deleting it.

| Tier | Where | What goes here | Visibility rule |
|---|---|---|---|
| **T1 Always visible** | top bar, pane headers, dock tab track, readout, navigator search and chips | the verbs used every minute | always rendered, never behind hover |
| **T2 In context** | row trailing actions, selection bar, step row actions, editor tab close, column header menu button | actions on the focused or selected object | shown on the **selected** row always, on hover, on `:focus-within`, and **always** under `(hover: none)` |
| **T3 One click away** | each pane's `⋯` menu, context menus (right click and `Shift+F10` and the Menu key), the Run split menu, the top-bar overflow | less frequent but still first-class actions | the menu trigger is T1 or T2; the menu lists every action with its shortcut |
| **T4 Palette and keys** | command palette (`>` prefix), shortcut sheet (`?`) | everything | read from the command registry (`06` WB-13) |

**Hover is never the only way.** A T2 action that appears on hover must appear just as fully on keyboard focus and on touch. Opacity is used for the reveal (`0 → 1`, `--dur-1`), never `display: none`, so the action keeps its place in the tab order. Exception: rows in a virtualised list expose T2 actions only on the focused or selected row, to keep the DOM small (WB-11 budget). The row's context menu always has them.

### 3.6 Labels speak, icons support
- Pane headers and section headings are sentence case: *Applied steps*, *Depends on*, not *APPLIED STEPS*. `02A`'s upper-case letter-spaced style is removed.
- Icon-only buttons are allowed in T1 and T2 only when the icon is in `02A` §6.9's set, has an `aria-label` from `strings.js`, and shows a tooltip after 500 ms with the name and shortcut.
- Top-bar labels collapse to icon-only below 1100 px wide, which is a change from 700 px. Below 700 px the mobile layout takes over.

### 3.7 Numbers are calm
Counts in chips and pane headers use `--t-2xs` with tabular numerals on a `--track` pill, and never use colour for the number itself. A count is coloured only when it is a state, such as *Errors 1* on the readout, and then it carries a bead glyph too.

---

## 4. Components, refined

Built to `02` §3's structure with `02A`'s colours, in this shape. Each still needs both themes at 1280×800 and 390×844 (W-5).

### 4.1 Top bar (replaces `02` I-3 size and ground)
`--h-bar`, transparent on `--ground`, so no slab and no hairline. Content is inset to align with the panes below: left padding = `--gutter` + `--s-3`.

Left: the mark at 20 px and the wordmark (I-15), then `--s-4` of space, then the file name with meta in `--ink-3`, using the two-span middle truncation from `02` I-3.

Centre: the **palette trigger**, a 360 px wide `--h-ctl` field on `--track` with `--r-2`, a search glyph, the placeholder *Search queries, steps, procedures, commands* and a `Ctrl K` kbd. It shrinks to an icon button below 1100 px.

Right, in this order with `--s-2` gaps: **Changes N** (secondary; disabled when clean, with the E-1 tooltip), **Print** (quiet icon), **Run ▾** (the one filled button; the split part opens the run modes from WB-9), and **⋯** (quiet icon: theme, density, layout presets, Sources, Settings, shortcut sheet, About).

Nothing from `02` I-3 or `06` §1 is dropped. Download lives in the Changes button's split menu, as E-3 already places it, and stays on `Ctrl/Cmd+S`.

### 4.2 Buttons (extends `02` I-5)
| Kind | Look | Size |
|---|---|---|
| Primary | `--celadon` fill, `--on-celadon` text 600, 1 px `--celadon-edge` | `--h-ctl`, padding `0 var(--s-4)`, `--r-2` |
| Secondary | `--raised` fill, 1 px `--line` border, `--ink` text; hover `--hover` | same |
| Quiet | no fill, no border, `--ink-2`; hover `--hover` | same |
| Icon | quiet, square | `--h-ctl` × `--h-ctl` (`--h-ctl-sm` inside pane headers), 16 px icon centred, `--r-2` |
| Split | primary or secondary with a 1 px divider in `--celadon-edge` or `--line` and a chevron segment of `--h-ctl-sm` width | — |

The secondary button changes from `02`'s transparent fill with a `--line-strong` border to a `--raised` fill with a `--line` border, because a soft filled shape is calmer than an outline. The 3:1 boundary requirement for controls is met by `--line-strong` on the **focus** and **hover** states and by the label text itself. If axe flags it, keep the `--line-strong` border and record the deviation. Press: `translateY(.5px)` (`02A` §6.3). Disabled: 55 % opacity plus `aria-disabled`, still focusable so the tooltip can explain why.

### 4.3 Lists: navigator, steps, outline, problems, queue (replaces `02` I-4 look)
- Row: `--h-row`, inset `0 var(--s-1)`, inner padding `0 var(--s-3)`, `--r-2`, gap `--s-2`. Layout: bead · name (flex, ellipsis) · secondary meta in `--ink-3` `--t-xs` right-aligned · T2 trailing actions.
- Hover: `--hover`. **Selected:** `--raised` fill with `--shadow-pane`, plus a **3 × 14 px slate tick** with `--r-pill`, centred vertically at `--s-1` from the row's left edge inside the rounded shape. This replaces the full-height 3 px bar, which looks cut off on a rounded row. **Current-but-not-focused** (navigator selection while the editor has focus): `--raised` without the shadow.
- Focus: the inset ring `outline: 2px solid var(--slate); outline-offset: -2px` with the row's radius (`02A` §6.2).
- Group headers: `--h-row-sm`, sentence-case name in `--ink-2` `--t-sm` 600, chevron, then status counts in `--ink-3` `--t-xs` (`12 · 1 error · 3 stale`). Sticky with a `--surface` ground. No `--sunk` slab.
- Multi-selected rows: `--slate-soft` fill, no tick. The focused one also has the ring.
- Edited mark: 6 px `--ochre` dot plus the visually hidden `S.asEdited`.
- Bypassed step: name struck through in `--ink-3`, a *bypassed* chip, the skipped bead.

### 4.4 Pane headers (replaces `02A` §6.8)
`--h-pane-head`, **no separate ground**: the header is part of the pane surface, with `--s-3` horizontal padding. Left: the title (`--t-sm` 600 `--ink-2`, sentence case) and an optional count pill (§3.7). Right: up to three icon buttons at `--h-ctl-sm` (T1), then `⋯` (T3). If a pane needs more than three header actions, the rest go in `⋯`. The header gets a `--line` hairline at its bottom **only while the list below is scrolled** (an `IntersectionObserver` sentinel toggles a class), so the header separates from the content exactly when it needs to.

### 4.5 Editor (replaces `02` I-7 gutter)
- Ground `--surface`. Gutter in the same tone with numbers in `--ink-3`, right-aligned, `--s-4` gap before the code. No tinted strip, no hairline.
- Current line: a `--hover` band with `--r-1`, inset `--s-1` from the pane's inner edge. Current step span (WB-14): a 3 px `--slate` tick in the gutter for the span's height (rounded ends) plus a `--slate-soft` band at 60 % of the line, done with the existing highlight layer.
- Error line: `--madder` tick in the gutter and the number in `--madder-ink`. The message appears in a hover/focus card, not inline.
- Tabs: on the pane's top edge, `--h-ctl` tall, `--r-2` top corners only. The active tab is `--raised` and joins the editor area, inactive ones are quiet text, the close button is T2. The preview tab has an italic title. The tab strip scrolls horizontally with fade masks at both ends and **never** wraps.
- Breadcrumb (WB-22): `--t-xs` `--ink-3` under the tabs, with `›` separators; the last crumb opens the procedure picker.
- Find bar: a `--raised` card with `--r-3` and `--shadow-overlay` at the top-right, `--s-2` from the edges.

### 4.6 Result grid (replaces `02` I-8 sizes)
- Header: 40 px, `--surface`, sticky, 1 px `--line-strong` bottom rule. Name on line one in `--ink` 600. The type label sits on line two as `--t-2xs` `--ink-3` text. The column menu button is T2 and appears on header hover and focus, and always for a column with an active view filter or sort, which is marked with a slate dot.
- Body rows: `--h-grid-row`, `--line` hairlines, no zebra (kept from `02`). Hover: `--hover`. Focused cell: inset 2 px slate ring with `--r-1`.
- Index column: no fill, `--ink-3`, sticky, separated by a `--line` hairline.
- The header line above the grid (`928 rows · 6 cols · 41 ms · step 4 of 7`) and the chips (view filter, Excel verdict, row cap notice) sit in one 36 px row. The view chip has its own *Clear* ✕ and *Add as a step* action.

### 4.7 Dock and segmented controls
- Dock tabs: a **segmented control** on a `--track` with `--r-2` and `--s-0` inner padding. The active segment is a `--raised` thumb with `--shadow-pane`. Each segment holds the label and an optional count pill. All seven tabs (Result, Pinned, Compare, Problems, Queue, Graph, Changes) stay visible down to 1100 px. Below that, the least-used tabs move into a `More ▾` segment in usage order (Graph, Compare, Changes). They are still T1-adjacent and still reachable by palette and `Ctrl/Cmd+J` cycling.
- The same segmented control is used for: Queries / VBA in the navigator, portrait / landscape and margins in the print panel (`04` P-7), and the mobile region switcher.

### 4.8 Readout (replaces `02` I-6 geometry)
A 32 px **floating bar**: `--readout` fill, `--r-3`, sitting in the bottom gutter with `--gutter` margin on three sides. `--font-code` `--t-xs`. Left is the polite status region. Right are counter **buttons**: Problems, Edited, Stale, the Excel verdict, culture. Each is a quiet button on the readout (`--on-readout-2`, hover `--on-readout`) with its bead. It is still the single inverted element (`02` I-6). It is now a rounded object rather than a slab across the window edge. On mobile it merges into the bottom region switcher (§4.11).

### 4.9 Overlays (replaces `02` I-9 radius and padding)
- Dialogs: `--raised`, `--r-4`, no border in light and 1 px `--line` in dark, `--shadow-overlay`, padding `--s-5`, max width 520 px. Title `--t-lg` 600, a description in `--ink-2` underneath, actions at the bottom right with `--s-2` gaps, primary last. Below 520 px viewport they become bottom sheets with `--r-4` top corners and a 36 × 4 grabber in `--line-strong`, purely visual since Escape and the close button remain.
- Menus and popovers: `--raised`, `--r-3`, padding `--s-1`, items `--h-ctl` at `--r-2` with label left and shortcut right in `--ink-3` kbd style. Separators are `--s-1` space plus a hairline. Submenus open on hover after 150 ms and on `→`.
- Command palette: 640 px wide, 14vh from the top, `--r-4`. A 48 px input with no border, result rows at `--h-row` grouped under sentence-case kind headings (*Queries*, *Steps*, *Procedures*, *Commands*), and a footer hint row in `--ink-3` (`↑↓ to move · Enter to open · Tab for actions`). A disabled command shows its reason in `--ink-3` in place of the shortcut.
- Tooltips: `--readout` fill, `--on-readout` text, `--r-1`, `--t-xs`, a 500 ms delay, 0 ms when moving between neighbours.
- Scrim: `--scrim` at the `02A` opacities.

### 4.10 Inputs, chips and beads
- Inputs: `--h-ctl`, `--raised`, 1 px `--line`, `--r-2`; hover border `--line-strong`; focus is the slate ring with no border colour change. The navigator search uses `--track` without a border until focus. Prefix tokens (`code:`, `step:`) render as a slate-soft inline chip inside the field.
- Filter chips: `--h-ctl-sm`, `--r-pill`, `--line` border, `--ink-2` label and a count. *On*: `--slate-soft` fill, `--slate` border, `--slate-ink` text and a leading ✓ icon. Four chips are visible (Edited, Errors, Stale, Never run). The rest of the WB-11 chips (Loaded, Connection only, Functions, Linked to a macro) are behind a `+ More` chip that opens a checklist popover. **Any active chip is always shown** in the visible row. This is T1 for the common four, T3 for the rest, and T4 for all.
- Beads: unchanged from `02A` §6.4 (8 px, distinct shapes). The error bead's gap ring uses the **local** ground token (`--surface`, `--raised` or `--readout`) through a `--bead-gap` custom property set by the container, so the ring does not show a wrong-coloured halo on a selected row.

### 4.11 Mobile, 390×844 (refines `06` §1)
- Panes are full-bleed with no gutter, and the top bar is 48 px with the mark, the current item name and Run.
- The bottom has **one floating rounded bar** (`--r-pill`, `--raised`, `--shadow-overlay`, `--s-2` from the edges, plus `env(safe-area-inset-bottom)`). It holds the segmented region switcher (*Items · Code · Steps · Result*) on the left and the Problems counter on the right. The status text appears above it for 4 s after each change and is always in the live region.
- Every touch target is ≥ 44 × 44 px (T-V-05). Rows use `--h-row` + 12 px = 44 px on touch through `(pointer: coarse)`.
- Every drag has a menu equivalent (kept from `06`). T2 actions are always visible under `(hover: none)`, and the step row shows a `⋯` button.

### 4.12 Empty, loading and error states
- Empty state (I-10): the classes `.empty img.mark`, `.empty h2` and `.footnote` are kept (W-2). Column max 440 px. Above the tagline there is `--s-7` of space. The drop zone is `--r-3`, 1.5 px dashed `--line-strong`, `--surface` fill, `--s-6` padding, with a `--h-ctl` secondary *Choose a file* button inside.
- Pane empty states: centred in the pane, one `--ink-2` sentence and one quiet action, such as *No pinned results. Pin a step from the steps list.* with a button that does exactly that.
- Skeletons (I-19): bars in `--track` with `--r-1` at the real row height, with an opacity pulse of 0.6 → 1 every 1.4 s that is turned off under reduced motion.
- Errors in panes: a `--madder-soft` card with `--r-3` holding the message, the action sentence (E-11) and the action button. No full-pane red.

---

## 5. Control inventory: the no-loss contract

Every control in `03`, `04` and `06` is listed with its tier and placement. **A control that is not in this table is a bug in this table, not a licence to drop it.** If you find one, add it, place it by §3.5 and record it under *Deviations*. Command ids are the ones registered in `src/app/commands.js` (WB-13). Every row is also in the palette (T4).

| Command / control | Source | T1 / T2 placement | T3 placement | Shortcut |
|---|---|---|---|---|
| Open file | 03 E-12 | empty state, top bar `⋯` when a file is open | top bar `⋯` | `Ctrl/Cmd+O` |
| Run (current query, all steps) | 06 WB-9 | top bar Run (filled) | Run split menu | `Ctrl/Cmd+Enter` |
| Cancel run / cancel batch | 03 E-5, 06 WB-9 | Run becomes Cancel; Queue pane header | — | `Escape` |
| Run to here | 06 WB-9 | step row T2 | Run split menu; step context menu | `Ctrl/Cmd+F10` |
| Run selected | 06 WB-9 | navigator selection bar | Run split menu | `Ctrl/Cmd+Shift+Enter` |
| Run with downstream | 06 WB-9 | navigator selection bar | Run split menu; graph node menu | — |
| Run stale | 06 WB-9 | readout *Stale N* popover button | Run split menu | — |
| Run all | 06 WB-9 | — | Run split menu | `Ctrl/Cmd+Alt+Enter` |
| Stop at first error (option) | 06 WB-9 | — | Run split menu (checkbox item) | — |
| Run this macro's queries | 06 WB-25 | outline Refreshes section (secondary) | Run split menu while relevant | — |
| Changes review / Download / Save | 03 E-1, E-3, E-9 | top bar Changes N | Changes split menu: *Review changes*, *Save a copy…*, *Download* | `Ctrl/Cmd+S` |
| Revert edit / item / all / procedure | 03 E-2, 06 WB-22 | editor tab context, outline row T2 | item `⋯`; Changes menu (*Revert all*) | — |
| Print / print preview | 04 P-7, P-10 | top bar Print | top bar `⋯` | `Ctrl/Cmd+P` |
| Command palette | 06 WB-13 | top bar field | — | `Ctrl/Cmd+K`, `Ctrl/Cmd+Shift+P` |
| Shortcut sheet | 03 E-12 | — | top bar `⋯` | `?` (outside text fields) |
| Theme, density, layout presets | 02, 02B §3.4, 06 §1 | — | top bar `⋯` → View | — |
| Sources inventory | 06 WB-19 | — | top bar `⋯` | — |
| Settings | existing | — | top bar `⋯` | — |
| Toggle navigator / inspector / dock | 06 WB-10 | pane header collapse icon | View menu | `Ctrl/Cmd+B`, `Ctrl/Cmd+Alt+B`, `Ctrl/Cmd+J` |
| Cycle regions | 06 WB-10 | — | — | `F6`, `Shift+F6` |
| Queries / VBA switch | 06 WB-11 | navigator segmented control | — | `Ctrl/Cmd+Shift+1`, `Ctrl/Cmd+Shift+2` (§7.1) |
| Navigator search, `code:`, `step:` | 06 WB-11 | navigator field | — | `Ctrl/Cmd+Shift+O` focuses it |
| Group by, Sort | 06 WB-11 | — | navigator `⋯` (two radio groups) | — |
| Filter chips (8) | 06 WB-11 | 4 visible + active ones | `+ More` checklist | — |
| Multi-select actions: Run, Run with downstream, Revert, Show in graph, Print, Copy names | 06 WB-11 | selection bar (appears with ≥2 selected) | row context menu | — |
| Preview vs open tab | 06 WB-11 | single / double click | row context: *Open in tab*, *Open to the side* | `Enter` |
| Tabs: close, next/prev, go to n, split | 06 WB-12 | tab close T2; split icon in tab strip | tab context menu | `Alt+W`, `Alt+[`, `Alt+]`, `Alt+1…9`, `Ctrl/Cmd+\` |
| Step cursor move | 06 WB-14 | click a step | — | `F10`, `Shift+F10`, `J`/`K` |
| Follow caret (option) | 06 WB-14 | — | steps `⋯` | — |
| Count rows for every step (option) | 06 WB-14 | — | steps `⋯` | — |
| Auto-run steps after structural edits (option) | 06 WB-15 | — | steps `⋯` | — |
| Peek | 06 WB-14 | hover/focus 400 ms | step context: *Peek* | `Space` on a step |
| Pin step / pin result | 06 WB-14, WB-16 | step row T2; result header *Pin* | step context | `Ctrl/Cmd+Alt+P` |
| Invoke function | 06 WB-14 | steps pane header for function queries (secondary) | — | — |
| Move up/down, drag | 06 WB-15 | grip T2 (drag) | step context | `Alt+Shift+↑/↓` |
| Rename, Insert after, Duplicate, Delete, Bypass/restore, Edit step | 06 WB-15 | step row `⋯` T2 | step context | `F2`, `Insert`, `Ctrl/Cmd+D`, `Delete`, `B`, `Enter` |
| Undo structural op / History | 06 WB-15 | status region *Undo* (10 s) | steps `⋯` → History | `Ctrl/Cmd+Z` in steps pane |
| Column menu: sort, filter, profile, hide, Add as a step | 06 WB-16 | header menu button T2 | cell context menu | `Alt+↓` on header |
| Clear view filter/sort | 06 WB-16 | view chip ✕ | result `⋯` | — |
| Export | 06 WB-16 | — | result `⋯` | — |
| Compare two results | 06 WB-16 | Compare tab pickers | result `⋯` → *Compare with…* | — |
| Excel differences view | 03 E-8 | verdict chip (button) | result `⋯` | — |
| Graph: open, run, downstream, neighbourhood, show all, fit, zoom | 06 WB-17 | graph toolbar (Fit, Show all, zoom) | node menu | `G`, `+`, `-`, arrows |
| Problems filters | 06 WB-18 | Problems pane header segmented (All · Errors · Warnings · Info) | Problems `⋯` (item kind) | — |
| Completion, signature, definition, references | 06 WB-20 | automatic | editor context menu | `Ctrl+Space`, `F12`, `Shift+F12` |
| Find in editor, next/prev | 03 E-12 | — | editor context menu | `Ctrl/Cmd+F`, `F3`, `Shift+F3` |
| Find / replace across workbook | 06 WB-21 | — | top bar `⋯` → Find in workbook | `Ctrl/Cmd+Shift+F`, `Ctrl/Cmd+Alt+F` (§7.1) |
| Outline jump, procedure picker, focus procedure | 06 WB-22 | outline rows; breadcrumb | editor context | `Ctrl/Cmd+Shift+.` |
| Calls / Called by | 06 WB-24 | inspector section | — | `Shift+F12` |
| Bindings: choose, skip, clear | 03 E-6, 06 WB-19 | binding dialog | Sources | — |
| Print settings (paper, orientation, margins, rows per page, scale, fit, repeats, columns, sticky, head/foot, what to print) | 04 P-7 | print panel: all visible, grouped in 5 `<fieldset>`s | — | — |

The print panel is the one place where **everything stays visible**, because printing is a task the user sets up once and checks at a glance. It gets calm through grouping (Paper · Rows · Repeat · Columns · Header and footer), segmented controls instead of radio stacks, and `--s-4` between groups. Nothing in it is collapsed.

---

## 6. Tests for this file

| ID | Kind | Proves |
|---|---|---|
| T-V-01 | lint (T-LINT-17) | `border-radius` and control `height`/`min-height` in CSS use `var(--r-*)` / `var(--h-*)` only, outside `tokens.css` and `print.css` |
| T-V-02 | unit | every command in the registry has `S.cmd[id]`, appears in the palette, and declares ≥ 1 `surfaces` entry from T1–T3; no command declares `hoverOnly` |
| T-V-03 | e2e | every T2 action rendered on hover is also visible with `:focus-within` and with `hasTouch` + `(hover: none)` emulation; its computed opacity is 1 in both |
| T-V-04 | e2e | at most one visible `--celadon` filled button per layer, checked in states 3, 5, 9, 13 and with each dialog open |
| T-V-05 | e2e | every interactive element ≥ 24 × 24 CSS px at 1280×800; ≥ 44 × 44 at 390×844 for row targets and the region switcher |
| T-V-06 | e2e | at 1280×800 no pane header title truncates; panes have ≥ `--gutter` between them; no horizontal page overflow at either width |
| T-V-07 | e2e | every surface listed in §5 renders its control (walk the registry's `surfaces`, open each surface, find the control by accessible name) |
| T-I-09 | unit | each icon SVG's ring reaches ≥ 3:1 against its own ground in every colour scheme it declares (see §7.2) |

Add T-V-01 … T-V-07 and T-I-09 to `05` §2 under Phase 2. The visual baseline (`02` I-16, `06` WB-28) is taken **after** this file is applied.

---

## 7. Small fixes found while refining

### 7.1 Shortcuts the browser will not give up
These were in `06` and cannot work reliably:
- `Ctrl/Cmd+1` / `Ctrl/Cmd+2` (WB-11 Queries/VBA) switch browser tabs in Chromium and Firefox and on macOS, and cannot be cancelled. Use **`Ctrl/Cmd+Shift+1` / `Ctrl/Cmd+Shift+2`**.
- `Ctrl/Cmd+Shift+H` (WB-21 replace) opens history in Firefox and *Home* in Chromium on macOS. Use **`Ctrl/Cmd+Alt+F`**.
- `Alt+` letter or digit on macOS produces characters (`Alt+W` types `∑`). Match **`event.code`**, not `event.key`, for every Alt combination.
- `?` opens the shortcut sheet **only when focus is not in a text field or the editor**. Otherwise it types a `?`.
- `F10` on Windows Firefox focuses the menu bar if not cancelled. Call `preventDefault` on keydown, and add a row to the manual matrix (`05` §4.1) to confirm.

**T-LINT-16 is extended** to hold a reserved list and to fail if any command uses one of these: `Ctrl/Cmd+W`, `+T`, `+N`, `+Shift+N`, `+Shift+T`, `+Tab`, `+1…9`, `+L`, `+PageUp/PageDown`, `Cmd+Q`, `Cmd+H`, `Cmd+M`, `Ctrl/Cmd+Shift+H`, `Ctrl/Cmd+Shift+Delete`.

### 7.2 The dark favicon ring is invisible
Renders of the 16 px and 64 px marks on a dark ground draw the ring at about `#2E3232` on black, roughly 1.5:1. The ring disappears and only the celadon block remains. Cause: the dark-scheme ring takes a dark ink, not `--ink` (dark) `#E3E8E5`. Fix: in `favicon.svg`'s `prefers-color-scheme: dark` block, the ring is `#E3E8E5`. In `mark.svg` the fallback ring is `#1A201E` for light use only, and inline uses take `currentColor`. `icon-maskable.svg` uses `#DDE3E0` (`--on-readout`) on `#1E2422`. The correct versions are in `assets-v2/`. T-I-09 guards it.

### 7.3 ARIA for the grouped navigator
`06` WB-11 said "`role="listbox"` … inside a `role="tree"` when grouped". A listbox cannot sit inside a tree, and axe will fail it. Use **`role="tree"` with `aria-multiselectable="true"` when grouped** (group headers are `treeitem`s with `aria-expanded`, queries are child `treeitem`s with `aria-level="2"`) and **`role="listbox"` with `aria-multiselectable="true"` when ungrouped**. Keep `aria-setsize` / `aria-posinset` on virtualised items in both.

### 7.4 Old palette names left in `03` and `04`
`03` E-1, E-3, E-8 and `04` P-3 still name `--patina*` and `--minium*`. Read them through `02A` §5: patina → `--celadon-ink` / `--celadon-soft`, minium → `--madder-ink` / `--madder-soft`. Those files now say so inline.

---

## 8. Acceptance for this file

- No colour value from `02A` changed; the only colour additions are `--hover`, `--press`, `--track`, all covered.
- T-V-01 … T-V-07 and T-I-09 green, and T-I-01 … T-I-08 still green.
- §5 has no unplaced control. Every command id in the registry appears in §5 or is added to it.
- The owner is shown the same four screenshots as `02A` §8 (empty light, query selected dark, result grid light, VBA module dark) plus **the workbench at 1280×800 light with a run finished**, before the baseline is committed.
- `assets-v2/refined-preview.html` (light and dark) has been opened and compared with the built app; differences are recorded under *Deviations*.
