# 04 — Printing

The owner's requirement: real control over printing — rows per page, orientation, paper, repeated rows at the top or bottom, the best the browser print engine allows, and **plain honesty about what is not possible**.

Phase order: pure maths (P-1, P-2) → rendering (P-3 … P-6) → UI (P-7 … P-10) → code printing (P-11, P-12) → honesty and verification (P-13, P-14).

---

## 0. What a browser can and cannot do

Write this section into `docs/observations.md` as well, because users will ask.

**Possible, reliably:**
- Paper size and orientation via `@page { size: A4 landscape; }`.
- Margins via `@page { margin: … }`.
- Forcing a break before/after an element (`break-before: page`).
- Keeping an element off a break (`break-inside: avoid`).
- Repeating a `<thead>` on every page: supported in Chromium, Firefox and WebKit for `display: table` elements.
- Printing colours, **if** the user leaves "Background graphics" on. `print-color-adjust: exact` asks for it; it is a request, not a guarantee.

**Not possible from a web page, in any browser:**
- Reading or setting the user's printer, tray, duplex or copies.
- Knowing which paper the user actually chose in the print dialog, or whether they overrode orientation there.
- Repeating a footer row at the **bottom** of every page. `<tfoot>` repeats in Chromium but is not dependable across engines, and it does not sit at the bottom of a short last page.
- Page numbers with `@page { @bottom-center { content: counter(page) } }` — CSS Paged Media margin boxes are not implemented in any shipping browser.
- Knowing the page count before printing.
- Starting the print dialog without a user gesture, or printing silently.

**Our answer to the two impossible ones that matter:**
- *Repeated bottom rows* (P-5): quoin paginates the table itself, so it can place a repeated row at the end of every page group. This is why the layout maths exists.
- *Page numbers* (P-6): same reason — if we own the pagination, we can print `Page 3 of 12` into our own footer element.

Owning pagination is the central decision of this phase. Record it in `docs/decisions.md`.

---

## P-1 — The pagination model (pure, Node-testable)

**File:** `src/core/print/layout.js`. No DOM, no `window` (T-LINT-7).

```
paginate({
  rowCount, rowHeight, headerHeight, footerHeight,
  repeatTop, repeatBottom,
  pageHeight, titleHeight, pageFooterHeight,
  rowsPerPage
}) -> { pages: [{ index, firstRow, lastRow, rows, repeatTop, repeatBottom }], pageCount, rowsPerPage, mode }
```

Rules:
- `rowsPerPage` given by the user wins, and `mode = 'fixed'`. Otherwise it is computed from the available height, and `mode = 'fit'`.
- Available height = `pageHeight - titleHeight - pageFooterHeight - headerHeight - repeatTop*rowHeight - repeatBottom*rowHeight`.
- `rowsPerPage = max(1, floor(available / rowHeight))`. One row per page is legal; zero is not.
- The last page is short, never padded.
- `rowCount === 0` yields exactly one page with zero rows, so the empty state prints.
- Everything is integers; never produce a fractional row.

**Tests:** `T-P-01` unit, table-driven: 0, 1, `rowsPerPage-1`, exactly `rowsPerPage`, `+1`, 10 000 rows; fixed vs fit; a page height too small for any row (assert the clamp to 1 and a `tooSmall` flag the UI reports).

---

## P-2 — Column bands (pure)

A table wider than the page is split into vertical bands; each band repeats the index column and the chosen sticky columns.

```
bandColumns({ columns, pageWidth, indexWidth, stickyCount, minColumnWidth }) -> [{ index, columns, width }]
```

Rules: sticky columns appear in every band; a column wider than the usable width gets a band of its own and is marked `overflow: true` (the UI then offers to shrink the font or rotate to landscape); band order follows column order; never split a column.

Pages are emitted **band-major**: all row pages for band 1, then band 2, and each page header says `Columns 1–7 of 24`. This matches how a printed table is actually read.

**Tests:** `T-P-02` unit: zero columns; one enormous column; sticky > total; exact fit; off-by-one at the page edge.

---

## P-3 — `styles/print.css`

A separate stylesheet, linked with `media="print"`, plus a screen-side preview that reuses the same classes inside a `.print-sheet` container so the preview looks like the output.

```
@page { size: var-driven; margin: 12mm 10mm; }
```
`@page size` cannot read a CSS custom property in any current engine. Write the four combinations as real rules and toggle a class on `<html>`:
`.p-a4-portrait`, `.p-a4-landscape`, `.p-letter-portrait`, `.p-letter-landscape`, plus A3 and Legal. Six paper sizes × 2 orientations = twelve `@page` rules. That is verbose and correct; do not try to be clever.

Rules: `print-color-adjust: exact` on banded rows and chips; hide the rail, top bar, status strip and every control; `break-inside: avoid` on each `.print-page`; `break-after: page` on all but the last; black text on white by default with the palette's `--minium-ink`/`--patina-ink` kept for the diff and verdict colours only. `mm` and `pt` are allowed by T-LINT-3 — use `mm` for page geometry and `pt` for type in print.

---

## P-4 — The print renderer

**File:** `src/ui/print-render.js`. Takes the result table plus the settings and builds a DOM tree of `.print-page` elements with `h()`. **Not virtualised** — the printed document must contain every row, so a 50 000-row print creates 50 000 rows in the DOM.

Guard it: above `printRowLimit` (default 20 000) require explicit confirmation naming the row count and the page count, and build in chunks with `requestAnimationFrame` so the tab does not freeze, showing progress in the status region. Above 200 000 rows, refuse and say to use a filter or export to CSV instead. Both limits live in `src/core/limits.js`.

---

## P-5 — Repeated rows, top and bottom

The user picks, per print: *repeat the header* (default on), *repeat the first N data rows* (default 0, max 5), and *repeat the last N data rows at the bottom of every page* (default 0, max 5).

Implementation: real `<thead>` for the header so the browser also repeats it if our pagination is off by a page, plus our own repeated rows rendered inside each `.print-page`. Repeated rows are visually distinguished: `--sunk` ground and a `--line-strong` rule, and they do **not** count towards the row numbering — the index column keeps the true row number.

**Tests:** `T-P-05` unit on `paginate` for the row-budget arithmetic; `T-P-05b` e2e on the preview asserting page 2 begins with the same repeated rows as page 1 and ends with the repeated bottom rows.

---

## P-6 — Running head and foot

Our own, since the browser cannot provide them. Head: workbook file name · query name · the band label. Foot: `Page N of M` · the print date · `quoin`. Each toggleable. All text from `strings.js`.

---

## P-7 — The print preview

**File:** `src/ui/print-preview.js`. A full-screen view (not a dialog — it needs the width), opened from the Print button or `Ctrl/Cmd+P` with `preventDefault` so the browser dialog does not pre-empt it.

Left: a scrollable stack of rendered pages at a fitted zoom, with page numbers. Right: a 280 px settings panel.

- Paper: A4, A3, Letter, Legal, Tabloid, Executive.
- Orientation: portrait / landscape.
- Margins: normal / narrow / wide (mm values shown).
- Rows per page: *fit to page* or a number.
- Scale: 60 %–140 %, and *fit columns to width*.
- Repeat: header, first N, last N.
- Columns: a checklist, plus which are sticky.
- Head/foot toggles.
- What to print: result / code / both / changes.

Every change re-renders the preview immediately, and only the first page synchronously — the rest can lag behind with a skeleton. Bottom of the panel: a live summary, *"12 pages · A4 landscape · 46 rows per page"*. Then Print and Close.

Settings live in memory for the tab (G-3), seeded per result from the fit calculation.

---

## P-8 — Honest warnings in the panel

Shown inline, in `--ink-3`, as calm statements of fact — never as an exclamation:

- *"Colours print only if background graphics are on in the print dialog."*
- *"Your printer dialog can override paper and orientation. quoin cannot read that choice."*
- *"Page numbers are produced by quoin, not the browser."*
- When a column was given its own band: *"Column X is wider than the page. It prints on its own."*

---

## P-9 — Keyboard and accessibility in the preview

Tab order: panel, then the page stack. `Escape` closes and returns focus to the Print button. The stack is `role="document"` with each page `aria-label="Page N of M"`. The settings panel is a `<form>` with real `<label>`s and `<fieldset>`/`<legend>` groups. The preview is announced once on open with the page count.

---

## P-10 — Printing without the preview

`window.print()` straight from the toolbar is still allowed and must produce something sane: it applies the last-used settings, or the fitted defaults. If no result has been run, it prints the code (P-11) rather than a blank page.

---

## P-11 — Printing code

**File:** `src/core/print/code-lines.js`, pure.

```
wrapCodeLines({ lines, columns, tabWidth }) -> [{ number, text, continued }]
```
Soft-wrap at `columns` characters (default computed from the font size and page width), break at a space or an operator when one exists in the last 20 % of the line, otherwise hard-break. A wrapped continuation carries `continued: true` and prints with a blank gutter and a small hanging indent, so line numbers stay truthful.

Rendering: monospaced, syntax colours kept (they are information, and they degrade to grey legibly), line numbers in the gutter, the module or query name in the running head, `break-inside: avoid` on each line, and a page break between modules. Printing *both* puts code first, then the result.

**Tests:** `T-P-11` unit: a line of exactly `columns`; `columns+1`; a 5 000-character single token; tabs; CRLF; an empty file.

---

## P-12 — Printing the changes

The diff from E-3, printed: one section per changed item, unified, with line numbers from both sides, additions and deletions marked by a glyph in the gutter (`+` / `−`) as well as by colour, so a monochrome print is still readable. This is the artefact someone takes to a review.

---

## P-13 — What we do not build

Write these down, in `docs/decisions.md`, so they are not attempted later: no PDF generation in the app (no bundled PDF library — G-6; the browser's "Save as PDF" is the supported route); no print-to-file naming control; no duplex, tray, copies or printer selection; no CSS Paged Media margin boxes; no headers/footers in the browser's own print chrome (the user can turn those off in their dialog, and the panel says so).

---

## P-14 — Verification

- `T-P-01`, `T-P-02`, `T-P-05`, `T-P-11` unit, as above.
- `T-P-14a` e2e: open the preview on a 1 000-row fixture, set 25 rows per page, assert exactly 40 `.print-page` elements, and that page 7's first index cell reads row 151.
- `T-P-14b` e2e: `page.pdf({ format: 'A4', landscape: true, printBackground: true })` in Chromium; assert the PDF page count equals the preview's page count and that the `/MediaBox` matches A4 landscape (parse the PDF bytes with a small regex — no dependency).
- `T-P-14c` e2e: a 30-column fixture produces the expected band count, and every band repeats the index column.
- `T-P-14d` axe on the preview.
- Manual: print one real page on a real printer, A4 and Letter, portrait and landscape; confirm the repeated bottom rows are at the bottom and that nothing is clipped at the margin. Record the result in `05_TEST_PLAN.md` §4.
