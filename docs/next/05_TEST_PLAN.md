# 05 — Test plan

## 1. How the suite is organised

```
tests/unit/*.test.js     node --test, pure core only, no DOM
tests/lint/run.js        structural rules over the whole repo
tests/e2e/*.spec.js      Playwright, real browser, real fixtures
tests/a11y/*.spec.js     Playwright + axe-core
tests/fixtures/          generators, workbooks, external (Excel-saved), expected
```

Rules that do not change: a new test is added in the same commit as the item it proves (W-3); an expectation is only changed when a spec item says so, and is listed in `PROGRESS.md` (W-2); the full suite must be green at the end of every phase (W-4).

---

## 2. Every new test ID

### Phase 0
| ID | Kind | Proves |
|---|---|---|
| T-LINT-11 | lint | every file in `public/fonts/` is referenced by an `@font-face` |

### Phase 1 — audit
| ID | Kind | Proves |
|---|---|---|
| T-B-01 | unit | extension chosen per `(format, hasVba)`; `xltm` stays `xltm` |
| T-B-02 | unit | filename sanitising: surrogates, trailing dot/space, reserved names, length |
| T-B-03 | unit | one definition of "changed"; a trailing newline is not a change |
| T-B-04 | unit | `selfCheck` failure rejects the save and returns no bytes |
| T-B-04b | e2e | the self-check failure message reaches the user |
| T-LINT-12 | lint | `selfCheck` is defined once and never swallowed by a catch |
| T-B-05 | e2e | dirty session warns on reload; clean session does not |
| T-B-06 | unit | save → save again with no edits is byte-identical |
| T-B-07 | e2e | `aria-expanded="false"` is present, not omitted |
| T-B-08 | e2e | a worker crash returns the UI to idle; the next run works |
| T-B-09 | e2e | a main-thread timeout fires and the app stays usable |
| T-B-10 | e2e | rail keyboard navigation, focus and scroll survive selection |
| T-B-11 | e2e | sort disabled with a reason above 200 000 rows; cell cursor works |
| T-B-12 | e2e | caret and highlight stay aligned at line 1 500; Escape returns focus |
| T-B-13 | e2e | menus flip inside the viewport at 390×844; focus returns to trigger |
| T-B-14 | e2e | every dialog returns focus to its opener |
| T-B-15 | e2e | no duplicate consecutive announcements; ≤ 1 update per 500 ms |
| T-B-16 | e2e | multi-file, folder, wrong type, empty file, stray drop |
| T-LINT-13 | lint | each `theme-color` equals a `--ground` value |
| T-B-17 | e2e | the rendered background matches the declared theme colour |
| T-B-18 | e2e | one culture formats both the row count and the cells |
| T-B-19 | unit | `typeLabel` for every primitive type, from `strings.js` |
| T-B-20 | unit | editing `sw.js` changes the manifest version |
| T-B-21 | unit | the contrast checker reports missing and uncovered tokens |
| T-B-22 | unit | icon PNGs exist, have the right dimensions, maskable corners filled |
| T-B-23 | e2e | offline reload with a query string still renders |
| T-LINT-14 | lint | the CSP is identical in every copy |

### Phase 2 — identity
| ID | Kind | Proves |
|---|---|---|
| T-I-01 | unit | contrast: every pair in the rewritten `pairs.json`, both themes |
| T-I-02 | unit | every colour token is covered by a pair or an exempt entry with a reason |
| T-I-03 | a11y | axe clean on states 1, 3, 5, 8, 9 of I-16, both themes |
| T-I-04 | e2e | 40 visual snapshots (10 states × 2 themes × 2 widths), 0.2 % tolerance |
| T-I-05 | e2e | focus ring visible on every interactive control (computed outline width > 0) |
| T-I-06 | e2e | `prefers-reduced-motion: reduce` yields zero non-zero transition durations |
| T-I-07 | unit | the three SVGs parse, contain no `<script>`, no external reference, no comment |

**`pairs.json` for the new palette.** Each entry is `[foreground, background, minimum]`. Minimum is 4.5 for body text, 3.0 for ≥ 18.66 px bold or ≥ 24 px text and for non-text boundaries (borders, focus rings, the sodium button's edge).

Required pairs, both themes:
- `--ink`, `--ink-2`, `--ink-3` against `--ground`, `--surface`, `--raised`, `--sunk` (12 pairs, 4.5)
- `--on-sodium` against `--sodium` and `--sodium-hover` (4.5)
- `--sodium-ink` against `--surface`, `--raised`, `--sodium-soft` (4.5)
- `--cobalt` against `--ground`, `--surface`, `--raised` (4.5); `--on-cobalt` against `--cobalt` (4.5)
- `--cobalt-ink` against `--cobalt-soft` (4.5)
- `--minium-ink` against `--surface`, `--raised`, `--minium-soft`, `--readout` (4.5)
- `--patina-ink` against `--surface`, `--raised`, `--patina-soft` (4.5)
- `--on-readout` and `--on-readout-2` against `--readout` (4.5 and 4.5)
- every `--syn-*` against `--surface` (4.5)
- `--line-strong` against `--surface` and `--ground` (3.0)
- `--cobalt` against `--surface` as a focus ring (3.0, already covered)

Exempt, with reasons recorded in the file: `--line` (decorative hairline between same-family grounds), `--sodium` as a 3 px rail marker (non-text, adjacent to `--raised`, still must reach 3.0 — so not exempt; include it), `--scrim`, `--shadow-overlay`.

### Phase 3 — edit, run, save
| ID | Kind | Proves |
|---|---|---|
| T-E-01 | e2e | hand-reverting an edit returns the app to clean |
| T-E-02 | e2e | revert at all three scopes restores the original text |
| T-E-03 | unit | the line differ: empty, identical, all-new, interleaved, CRLF/LF |
| T-E-03b | e2e | the Changes dialog lists exactly the changed items |
| T-E-04 | unit | each VBA validation rule, with line and column |
| T-E-04b | e2e | an unencodable character blocks the save with a specific message |
| T-E-05 | e2e | all five run terminal states; the button label and status each time |
| T-E-06 | e2e | bindings asked once, remembered for the session, Skip yields a cell error |
| T-E-07 | e2e | empty table, scalar, function, error, row-cap notice |
| T-E-08 | e2e | the Excel comparison verdict and the first differing cells |
| T-E-09 | e2e | the download path writes a file with the right name and extension |
| T-E-10 | unit | the saved-file contract, over every fixture (see §3) |
| T-LINT-15 | lint | every `QuoinError` code has a message entry, and none is unused |
| T-E-11 | unit | no unused keys in the error table |
| T-E-12 | e2e | the whole loop from the keyboard; focus never lands on `<body>` |

### Phase 4 — printing
| ID | Kind | Proves |
|---|---|---|
| T-P-01 | unit | `paginate` across the boundary cases, fixed and fit |
| T-P-02 | unit | `bandColumns` including an over-wide column |
| T-P-05 | unit | the repeated-row budget arithmetic |
| T-P-05b | e2e | repeated top and bottom rows appear on every page |
| T-P-11 | unit | `wrapCodeLines` boundary cases |
| T-P-14a | e2e | 1 000 rows at 25 per page gives 40 pages; page 7 starts at row 151 |
| T-P-14b | e2e | the generated PDF's page count and `/MediaBox` match the preview |
| T-P-14c | e2e | column bands and the repeated index column |
| T-P-14d | a11y | axe clean on the print preview |

---

## 3. Fixtures

Generated by `tests/fixtures/generators/build.js` (extend it; do not commit binaries that a generator can make):

| Fixture | Contains | Used by |
|---|---|---|
| `plain.xlsx` | 3 queries, 1 loaded to a table, no VBA | most |
| `macro.xlsm` | 2 modules (standard + class), cp-1252 | E-4, E-10 |
| `template.xltm` | VBA, template format | T-B-01, T-E-10 |
| `wide.xlsx` | 30 columns, mixed types | T-P-02, T-P-14c |
| `big.xlsx` | 300 000 rows, cached result | T-B-11, P-4 guard |
| `print-1000.xlsx` | exactly 1 000 result rows, stable values | T-P-14a |
| `binding.xlsx` | a query needing two external bindings | T-E-06 |
| `slow.xlsx` | an unbounded `List.Generate` | T-B-09 |
| `broken-m.xlsx` | a query with a parse error at a known offset | T-E-07, I-16 state 7 |
| `mismatch.xlsx` | cached values differing in exactly 3 cells | T-E-08 |
| `unicode.xlsx` | query names with emoji, CJK, RTL | T-B-02 |
| `cp932.xlsm` | a shift-jis VBA project | T-E-04 |
| `empty-result.xlsx` | columns, zero rows | T-E-07 |

`tests/fixtures/external/` keeps the real Excel-saved workbooks already in the repo (see its `NOTICE.md`). Never regenerate those; they are the ground truth for byte preservation.

**The saved-file contract (T-E-10), asserted for every fixture:**
1. ZIP entry order unchanged.
2. Every untouched entry byte-identical **as compressed bytes**.
3. Exactly the expected parts differ.
4. The result re-opens in quoin with the edits present.
5. A second, no-edit save is byte-identical (B-06).
6. `[Content_Types].xml` and `.rels` unchanged.

---

## 4. Manual matrix

Automation cannot cover these. Fill the table in and paste it into `docs/observations.md`; leave a row blank with *not run* rather than guessing.

### 4.1 Browsers

| Check | Chromium | Firefox | WebKit/Safari |
|---|---|---|---|
| App loads, no console errors | | | |
| Service worker installs; offline reload works | | | |
| Module worker runs a query | | | |
| `showSaveFilePicker` present / fallback used | | | |
| Saved `.xlsm` opens in Excel with no repair | | | |
| `<thead>` repeats across printed pages | | | |
| `@page size` honoured | | | |
| Background graphics default | | | |
| Favicon adapts to the OS colour scheme | | | |
| Editor caret aligns with the highlight layer | | | |

### 4.2 Excel

For each of `plain.xlsx`, `macro.xlsm`, `template.xltm`, and each external fixture:

| Check | Result |
|---|---|
| Opens with no repair dialog | |
| The edited query text appears in the Power Query editor | |
| Refresh produces the expected rows | |
| The edited VBA appears in the VBE and compiles | |
| Digital signature state as expected (removed where we remove it) | |
| File properties, defined names and formatting unchanged | |

### 4.3 Print

| Check | A4 portrait | A4 landscape | Letter portrait | Letter landscape |
|---|---|---|---|---|
| Page count matches the preview | | | | |
| Repeated header on every page | | | | |
| Repeated bottom rows at the bottom | | | | |
| Nothing clipped at the margin | | | | |
| Code print: line numbers correct across wraps | | | | |
| Diff readable in monochrome | | | | |

### 4.4 Assistive technology

One pass with the screen reader available to you (VoiceOver, NVDA or Orca): open a file, move through the rail, edit, run, read the status, open and close a dialog, open the print preview. Record anything announced twice, anything not announced, and any focus trap.

---

## 5. Definition of done for the whole job

- `npm test` green, including every ID above that belongs to a completed phase.
- 40 visual baselines reviewed by eye, not just stored.
- `docs/next/PROGRESS.md` complete: *Done*, *Changed expectations*, *Not reproduced*, *Blocked*, *Deviations* for all six phases.
- `README.md`, `docs/decisions.md` and `docs/observations.md` match the code.
- `npm run build` produces an `asset-manifest.json` with no dead files and a version that changes when any shipped file, including `sw.js`, changes.
