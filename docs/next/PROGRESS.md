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
