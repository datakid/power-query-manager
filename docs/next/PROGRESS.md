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
