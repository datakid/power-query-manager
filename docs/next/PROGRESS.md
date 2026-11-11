# quoin vNext progress

## Phase 0 — Baseline and hygiene

### Done
- Baseline on a clean checkout of main: lint failed with 2 findings (T-LINT-1 comments in vendor/jszip.min.js and vendor/xlsx.full.min.js); unit and browser suites not reached.
- H-1 (from 00_START_HERE.md only; 01_AUDIT.md was not available): removed js/ and vendor/ (no references anywhere in src, styles, index.html, sw.js, scripts or tests) and the unused fonts fraunces-italic, instrument-sans, jetbrains-mono from public/fonts.
- npm run build: 89 files, none of the removed paths listed.
- Suite after H-1: lint 0 findings, unit green, browser 46 passed.

### Changed expectations
- None.

### Not reproduced
- First full run after H-1 showed 7 browser failures (T-PERF-3 and six privacy tests failing on page.goto to localhost:5173). Each passes alone and a second full run was fully green, so this was a transient dev-server failure after the 1,000,000-row perf test, not caused by H-1.

### Blocked
- Phases 1 to 5 need 01_AUDIT.md, 02_IDENTITY.md, 03_EDIT_RUN_SAVE.md, 04_PRINT.md and 05_TEST_PLAN.md. Only 00_START_HERE.md and the identity assets (favicon.svg, mark.svg, icon-maskable.svg, preview.html, preview.css) were supplied.

### Deviations
- None.

## Phase 1 — Correctness fixes

### Done
- Identity choice: the ring-and-block mark from `assets/` (the `_1` set) is the one to ship in Phase 2.
- H-1 follow-up: T-LINT-11 (every font file is referenced by an @font-face).
- B-01 extension chosen from the format first (`xltm` stays `xltm`), single `src/core/filename.js` shared by `Session.suggestedName` and `save.js`. B-02 file names truncate by code point, drop trailing dots and spaces, prefix reserved device names.
- B-03 one `normalizeQueryText` in `src/core/pq/section.js`; decision 15 in `docs/decisions.md`.
- B-04 T-B-04 (tampered workbook makes the save reject with no bytes) and T-LINT-12 (selfCheck defined in `save.js` only, never inside a try whose catch does not rethrow).
- B-05 unload guard registered only while dirty; service worker no longer calls `skipWaiting`.
- B-06 T-B-06 over every fixture: untouched entries identical as compressed bytes, second save byte-identical.
- B-07 `h()` emits `"false"` and `"true"` for `aria-*`, `contenteditable`, `draggable`, `spellcheck`. Export and Download triggers now carry `aria-expanded` (B-13).
- B-09 main-thread stop at timeout plus 2 s grace, reported as `stopped` / `m.timeout`; the timer pauses while a binding dialog is open.
- B-10 rail built once, roving tabindex, Up/Down/Home/End move selection and focus, type-ahead; edited dot updated in place.
- B-11 sorting disabled with a reason above 200,000 rows (`aria-disabled` plus a note in the menu); Ctrl+Home/End, Enter on error and nested cells, `aria-selected` on selected cells.
- B-12 ligatures and kerning off on the shared text layers; find count announced once after 300 ms.
- B-13 menus and popovers flip inside the viewport, return focus to the trigger (also after an outside click), top layer only handles Escape.
- B-14 dialogs restore focus to a connected opener; Run and Cancel swap keeps focus on a visible button (`setRunning`).
- B-15 `#status` (polite, throttled to one update per 500 ms, no duplicates) and `#alert` (errors) inside `.statusbar`; an identical note sent twice is announced twice.
- B-16 drag counter, one-file rule, folder and unsupported-type messages (alert region when a session is open), drops outside the zone are prevented.
- B-17 theme-init catch is a no-op; T-LINT-13 compares both `theme-color` metas and the manifest colours with the body background token; manifest `theme_color` now equals the ground colour.
- B-18 `src/ui/formats.js` (`formatsFor`) used by the status strip, the grid and the row-cap message; a culture change re-renders the grid without a re-run.
- B-19 grid labels and glyphs in `strings.js`; T-LINT-9 now also checks `text:` properties and `*Label`/`*Text`/`*Display` functions.
- B-20 `sw.js` is part of the version hash and is not pre-cached.
- B-21 contrast checker lives in `tests/unit/contrast-lib.js` and reports missing, uncovered and non-hex tokens; `pairs.json` has an `exempt` map with reasons.
- B-24 T-LINT-14 keeps all four CSP copies identical.

### Changed expectations
- None. `.statusbar` now contains `#status` and `#alert`; existing tests read the container text and still pass.

### Not reproduced (the audit's claim did not match the code)
- B-04 as a bypass: no flag or path skips `selfCheck`; `faultInject` throws before it. T-B-04b is the existing T-E2E-19.
- B-08 stuck `runId` after a worker crash: the run handler receives a synthetic `result` and clears it (T-B-08 passes on the old code). A neighbouring defect was real and is fixed: `rows()` resolved `undefined` after a crash.
- B-10 scroll reset on selection (T-B-10 scroll test passes on the old code). Focus loss and the missing tab stop were real.
- B-12 overlay drift at line 1,500: the overlay is translated from the textarea scroll position, so it cannot drift; the test passes on the old code.
- B-14 focus loss in native dialogs: the browser restores it. The real loss was the hidden Run button.
- B-17 mismatch between `theme-color` and `--paper`: they were equal; they diverge only once I-1 renames the palette, which T-LINT-13 now catches.
- B-22 claim that `inner` is unused: it is used for the 512 maskable icon.
- B-23 offline reload with a query string works already (`ignoreSearch`); the test stays as a guard. A 504 fallback was not added.

### Blocked
- B-22 (icon script) is moved into I-14: it needs `public/icon-maskable.svg` from I-13, and both rewrite `scripts/make-icons.mjs`. T-B-22 is added there.

### Deviations
- B-01 and B-02 share one commit because they share the new module.
- B-07: nothing in the app passed a boolean to `h()` for these attributes, so there was no visible symptom; fixed at the helper.
- B-09: the terminal state is `{ status: 'stopped', code: 'm.timeout' }` so the existing message path is reused.
- B-11: PageUp and PageDown keep the viewport-sized step instead of the audit's fixed 200 rows. T-B-11 uses a 300,000-row query built in the test.
- B-16: `.xls`, `.xlsb` and `.ods` go through the content check so their specific messages survive; only other extensions get the type message.
- B-18: no date formatter was added; nothing formats dates. The grid keeps grouping off for cells by design, so the test asserts the decimal comma for cells and the thousands dot for counts.
- B-24: `frame-ancestors` stays out of the meta policy because browsers ignore it there and log an error; the lint requires the header copies to match each other and the meta to match them minus that directive.
- E-1 refers to `isDirty()`; the session exposes `editCount`. Phase 3 will add `changes()` on top.
- The plan quotes token names that differ from the code (`--t-xs` is split from `--t-xs-lh`, `--hit`, `--r-sm`, Commit Mono as `--font-code`, `--scrim` already exists). Phase 2 maps the old names to the new ones instead of copying the plan's block verbatim.

### Observations for Phase 2
- At 390 px wide the top bar overflows (Download is clipped), the Code/Result switch is oversized and the Run bar is out of reach. I-3, I-4 and I-9 must fix this.
- Typing in a 2,000-line module costs about 230 ms per edit in `afterEdit`. Not in scope; noted for `docs/observations.md`.

## Phase 2 — Visual identity

### Done
- I-1 tokens, I-2 migration (old names mapped as in 02, `--tide` folded into cobalt), `tests/a11y/pairs.json` rewritten with an `exempt` map; contrast test green for both themes.
- I-3 top bar (mark, wordmark, file name truncating before its extension, size, Export, Settings, Download), I-4 rail with sticky headers, rounded rows, selected row with a `--marker` bar (the old selector never matched because `aria-selected` is on the `li`; fixed), visible `edited` label next to the dot, and a sheet below 1024 px.
- I-5 buttons (Run is the sodium button; Download is secondary), I-6 inverted status strip with a verdict chip, I-7 editor tokens (`--syn-*`, error line bar), I-8 grid (error cells on `--minium-soft`, row hover), I-9 dialogs and menus on `--raised`, bottom sheet below 640 px, I-10 empty state, I-11 motion (also forced off under reduced motion), I-12 forced colours.
- I-13 mark and favicon replaced, I-14 icon script rewritten (also closes B-22: any and maskable icons at 192 and 512, opaque apple icon, T-B-22), I-15 wordmark in CSS.
- I-16 36 baselines, T-I-03, T-I-05, T-I-06, T-I-07 (`tests/unit/icons.test.js`).
- Screenshots of every baseline were looked at: desktop and 390 px, light and dark.

### Changed expectations
- `downloadButton` in `tests/e2e/helpers.js` (and two direct uses) now targets `.topbar button[aria-haspopup="dialog"]` instead of `.topbar .btn-primary`, because Run is now the single sodium button.
- T-E2E-17 (mobile) opens the Items sheet before tapping a query, because the rail is a sheet at 390 px.

### Not reproduced
- None.

### Blocked
- State 10 of I-16 (print preview) and its 4 baselines wait for Phase 4.

### Deviations
- I-1 values changed where the contrast test required it (see decision 17). I-4 marker colour, I-6 `--readout-alert`.
- I-3: Print is not in the top bar yet (Phase 4). I-7: no current-line highlight (it would need editor code, not styling). I-8: the index column is not sticky; rows are absolutely positioned and the sticky behaviour would need a rewrite of the grid layout. Neither is in the acceptance list.
- Radii are rounder than the document, at the owner's request for a rounded, calm look.
- The mark swaps `src` through JS rather than using `currentColor`, because the existing e2e assertion requires an `<img class="mark">`.

### Manual checks still to do
- The favicon in a real browser tab at 16 px in both OS schemes. It was checked as an `<img>` at 16, 24 and 32 px and reads clearly; a tab is not available here.

## Phase 3 — Edit, run, save

### Done
- E-1 `Session.changes()` returns `{ queries, modules, count }`, computed each call; `editCount` and `isDirty()` read it. Download is `aria-disabled` with the title "No changes yet." when clean and its name becomes "Download — N changes" (the count is hidden below 700 px).
- E-2 revert this item (existing button), revert all through the Changes dialog with a confirmation that names the count; the editor keeps its native undo.
- E-3 `src/core/diff.js` (`diffLines`, `diffStats`, `hunkLines`; the LCS is shared with `module-source.js`); Changes dialog with one expandable unified diff per item, line numbers on both sides, glyph and colour.
- E-4 `src/core/vba/validate.js` (NUL, lone surrogate, code page, 1023-character lines, typed `Attribute` lines, size limit); live check on edit with the gutter marker and the info strip; the Download popover names the problem and disables the button.
- E-5 lifecycle test over done, runtime error, parse error, cancelled and timeout. No code change was needed; the Run and Cancel swap was fixed in Phase 1.
- E-6 the binding dialog names the query, the function and the path; a provided file is remembered for the session only; reload asks again.
- E-7 empty table row, value card, go-to-error link on parse errors, a notice above the grid for lists cut at the display limit.
- E-8 View differences dialog with the first 200 differing cells (row, column, Excel value, quoin value), an honest introduction and a "same text, different type" note.
- E-9 `src/app/file-save.js`: picker save with read-back, replace-original dialog, abort handling; download fallback says only that it downloaded. Tested with a stubbed picker.
- E-10 the round-trip test now also asserts entry order and unchanged index parts on every fixture.
- E-11 every `QuoinError` code has a two-part message; T-LINT-15 and T-E-11; the status strip shows plain text ("Syntax error") instead of codes; the discard confirmation is an in-page dialog, not `window.confirm`.
- E-12 F3 and Shift+F3, shortcuts ignored under a dialog except Escape, focus lands on the rail after opening, keyboard-only loop test, sheet lists every shortcut.

### Changed expectations
- T-E2E-12 final assertion: the clean state is the disabled Download button with the title, not a popover saying "No changes yet." (E-1 asks for a disabled button).
- `openApp` removes `showSaveFilePicker` so the existing download-event tests keep using the download path; the picker path has its own tests with a stub.
- T-A11Y-2 starts its Tab walk from the first top-bar control, because focus now starts on the rail after a file opens (E-12).
- T-B-14 and the overlay test were already adjusted in earlier phases for the disabled Download button.
- grid.spec 'a syntax error blocks the run': the message now also holds the Go to the error button, so the exact-text assertion became contains plus a check for the button (E-7).
- Baselines 05 and 07 were regenerated for the Download label and the plain status text.

### Not reproduced
- None.

### Blocked
- Nothing. G-5 was respected: no file under `src/core/m/**` or the binary writers was touched.

### Deviations
- E-4 test: the plan's euro sign is representable in Windows-1252, so the test uses an arrow (U+2192) as the unencodable character.
- E-6: the dialog does not offer the workbook's own tables first, and Skip ends a run whose only source is missing with that source's M error (not a cell error); a query with other sources still runs.
- E-7: the engine stops at the row cap (`m.rows`) and returns no partial table; the message names the stop. The "first N rows" notice therefore applies to lists cut at the display limit.
- E-8: no "no Excel snapshot" chip; a query with no cached table simply shows no verdict.
- E-9: the source handle is known only for drops in browsers that provide `getAsFileSystemHandle`; elsewhere the replace-original dialog cannot trigger.
- E-10: a signed workbook that loses its signature on save gets its `[Content_Types].xml` rewritten and written first.

### Manual checks still to do (need a real browser)
- `showSaveFilePicker` in Chrome and Edge: save, overwrite the opened file, cancel the picker.
- Open each saved file in Excel (see `05_TEST_PLAN.md` section 4.2).

## Phase 4 — Printing

### Done
- P-1 `paginate` and P-2 `bandColumns` in `src/core/print/layout.js` (integers in tenths of a millimetre, paper and margin tables, `pageGeometry`), P-11 `wrapCodeLines` in `src/core/print/code-lines.js`; T-P-01, T-P-02, T-P-05, T-P-11 are unit tests.
- P-3 `styles/print.css` (twelve named `@page` rules, screen preview and print output share the classes, light-theme colours scoped to `.print-root`), P-4 `src/ui/print-render.js` (pages built 25 at a time, confirmation above 20,000 rows, refusal above 200,000), P-5 repeated header, first rows and last rows (last rows pinned above the foot), P-6 running head and `Page N of M` foot.
- P-7 `src/ui/print-preview.js` with every control in the plan except fit columns to width; P-8 the honest notes plus overflow, shrink and too-small notes; P-9 tab order (panel, then pages), region and names, Escape returns focus to Print; P-10 `beforeprint` fallback; P-12 printed changes with glyphs and numbers from both sides; P-13 decisions 22 and 23; P-14 T-P-14a to T-P-14e, T-P-05b, T-P-11b, T-P-12, T-P-10, T-P-09, T-P-04.
- Visual state 10 (print preview): 4 baselines, which completes the 40.
- The PDF produced from the preview has the preview's page count (40 of 40) and the right media box for A4 landscape and Letter portrait.

### Changed expectations
- None.

### Not reproduced
- None.

### Blocked
- Firefox and WebKit: the browser downloads fail in the sandbox, so no projects were added to `playwright.config.js`.
- The manual print matrix on a real printer.

### Deviations
- `styles/print.css` is linked for all media, not `media="print"`, because the preview uses it on screen.
- Fit columns to width is not offered.
- A chosen rows-per-page that cannot fit at full height is drawn smaller (with a note) rather than clipped or ignored.
- On phones the Print button is hidden and the command is in the Export menu.
- `session` does not store the file name; the preview reads it from the workbook.

## Phase 5 — Hardening and docs

### Done
- README, decisions 14 and 20 to 23, observations (print matrix, MX-10, known gaps).
- `npm run build` was re-run; `asset-manifest.json` lists `styles/print.css`, `src/ui/print-render.js`, `src/ui/print-preview.js`, `src/core/print/*.js`, `src/core/diff.js`, `src/app/file-save.js`, the new icons and both marks.

### Blocked
- Firefox and WebKit runs (see above).

### Not done on purpose
- Sticky index column in the grid, current-line highlight in the editor, a "no Excel snapshot" chip, workbook tables offered first in the binding dialog.

## Phase 2R — Glaze palette and 02B refinement

### Done
- I-R: `styles/tokens.css` rewritten for the Glaze palette (02A) with the 02B size, radius, spacing and type tokens; every stylesheet migrated off the sodium names; `public/favicon.svg`, `mark.svg`, `icon-maskable.svg` replaced and `mark-dark.svg` recoloured; PNG icons regenerated; `tests/a11y/pairs.json` rewritten (T-I-01, T-I-02, T-B-21 green); `tests/unit/glaze.test.js` adds T-I-08 and T-I-09.
- I-V: panes float on the ground with an 8 px gutter; top bar sits on the ground; readout is a floating bar; buttons, menus, popovers, tooltips, dialogs, inputs, rail rows, grid rows and the print panel use the new tokens; touch targets are 44 px; Compact density is a setting kept in memory (T-V-08).
- `T-LINT-17` (radius and control heights come from tokens) and `tests/e2e/refinement.spec.js` (T-V-04, T-V-05, T-V-06, T-V-08).
- Visual baselines regenerated and reviewed by eye.

### Changed expectations
- T-I-04 baselines: regenerated for the new look.
- `tests/unit/icons.test.js`: the sodium block colour is now the celadon mark colour; the maskable ground is `--readout`.
- `aria-valuemin/max/now` on the rail resizer: 220 / 420 / 272.

### Fixed on the way
- `.main > .editor-wrap` never matched because the editor sits in a `display: contents` host; the editor now fills its grid row.
- The status bar goes transparent when there is nothing to say, without removing the live region from the accessibility tree.

### Deviations
- `--celadon-edge` is `#5C9180` (plan `#5E9483` reached 2.92:1 against the ground; the target is 3:1).
- `--madder` is `#B1594C` (plan `#B5574A` has OKLCH chroma 0.125, above the 0.12 cap in 02A §8).
- `--t-code-lh` is 22 px, not 1.6: a 21 px line height misaligned the highlight layer at line 1 500 (T-B-12).
- `pairs.json` exempts only `--line` and `--scrim`; every other token is paired.
- The legacy size aliases (`--r-sm` … `--r-xl`, `--dur-fast`, `--dur-panel`) stay in `tokens.css` until nothing references them.
- Density is not persisted: G-3 allows only `quoin.theme` unless D-1 is approved.

### Blocked
- `T-E-12` (keyboard loop) and `T-P-14b` (PDF export) cannot run in the build sandbox used for this phase; they were not run.
- The visual baselines were produced with Chromium build 1243, not the build that produced the earlier ones.

### Not done
- Run in the top bar, the Changes split-button, the palette and the T1–T4 disclosure tiers: these belong to Phase 6 (WB-10 to WB-13).
