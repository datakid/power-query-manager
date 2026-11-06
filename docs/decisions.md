# Decisions

Each entry records a place where the build differs from `docs/QUOIN_SPEC.md`, or where the spec left a choice open, with the reason.

## 1. A small XML scanner instead of `DOMParser`

The spec names `DOMParser` for XML. Quoin uses its own scanner in `src/core/xml.js`. Reasons: it runs in Node, so every part of the core is unit-tested without a browser; it records the byte span of every element and attribute, so edits are made as text splices and everything else in the part stays byte-for-byte identical (declaration, namespaces, attribute order, `mc:Ignorable`); and the same tokenizer streams large sheets. DOCTYPE and ENTITY are rejected before parsing, as the spec requires.

## 2. Operator precedence of `meta`

The spec's precedence list puts `meta` lowest. The official M grammar puts it between unary and multiplicative operators, and `as` and `is` below equality. The parser follows the official grammar, because queries written for Excel assume it.

## 3. `pq.trailing` and `pq.version` are warnings

Spec DM-1 says trailing bytes give an error, while S-4 and T-PQ-5 say reading still works and only writing is blocked. The parser records a warning, reading proceeds, and writeback refuses. Length overflow still throws `pq.length`.

## 4. Edits are trimmed at both ends

A query's expression span excludes surrounding whitespace, so a trailing newline typed in the editor cannot be stored. The editor text is trimmed at both ends before it is compared or written, and a difference in whitespace alone is not an edit. If the edit ends inside a `//` comment, a line break is added before the member's closing `;`, otherwise the terminator would become part of the comment.

## 5. Binding requests re-run the query

The spec has the worker pause and wait for a file. A synchronous interpreter cannot wait without `SharedArrayBuffer`, which needs cross-origin isolation headers that static hosts rarely send. The interpreter stops with a `NeedBinding` signal, the host asks for the file, and the run starts again with the binding in place. The result is the same for the user.

## 6. Time values

Date-times and durations hold their ticks as `BigInt`, because 100 ns ticks since year 1 exceed 2^53. Dates hold a day count and times hold ticks within a day as numbers.

## 7. Final partial OVBA chunk

A final chunk shorter than 4096 bytes that does not compress below 4096 bytes cannot be written as a raw chunk without zero padding. Source text never behaves like this, but the writer decompresses its own output and compares it with the input, and refuses to write if they differ.

## 8. Fonts

Atkinson Hyperlegible Next and Commit Mono come from the `@fontsource` packages (SIL Open Font License). The licence texts are in `public/fonts/`.

## 9. Fixtures

The spec asks for fixtures made in real Excel. No Excel was available. The fixtures are real Excel-saved files from public repositories (see `tests/fixtures/external/NOTICE.md`) plus synthetic variants produced by `tests/fixtures/generators/build.js`. Synthetic files are marked as such in `tests/fixtures/workbooks/README.md`. F-MIXED has three modules, not four.

## 10. Browser coverage

The spec asks for Chromium, Firefox, and WebKit. Only Chromium was available. The code uses standard APIs only (`CompressionStream`, `DecompressionStream`, module workers, `<dialog>`), but Firefox and WebKit runs are outstanding.

## 11. `frame-ancestors`

Browsers ignore `frame-ancestors` in a meta tag and log a console error. The meta policy omits it; `_headers` carries the full policy.

## 12. Rounding functions

`Number.RoundUp`, `RoundDown`, `RoundTowardZero` and `RoundAwayFromZero` are directed (ceiling, floor, truncate, away from zero), matching their documented examples. `RoundingMode.AwayFromZero` inside `Number.Round` rounds halves away from zero, which is how it is used in practice. The default mode is `ToEven`, as documented, and is on the list of things to confirm in Excel.

## 13. Cells in tables may hold unevaluated values

Table cells can hold lazy values so that one failing cell does not fail the table. `cell()` forces them. Any code that reads a table cell goes through it.

## 14. Not built

Print preview and page-break emulation (M5, marked optional in the spec) are not implemented. The lexer fuzz test runs 1,000 seeds of 4 KB and a few seeds of 1 MB, not 1,000 seeds of 1 MB.

## 15. What counts as a change

Query text is compared after trimming both ends through `normalizeQueryText` in `src/core/pq/section.js`; the session and the writer share that one function. VBA module text is compared exactly, without trimming, because leading whitespace and trailing blank lines are significant in a module.

## 16. Identity

The name stays quoin. The mark is a square ring with a solid sodium block replacing the bottom-right corner (`public/mark.svg`, `public/mark-dark.svg`, `public/favicon.svg`, `public/icon-maskable.svg`). The app embeds the mark with `<img>`, which cannot inherit `currentColor`, so there are two files with the ring in ink and in bone, and `src/ui/mark.js` swaps the `src` when the theme (explicit choice or system scheme) changes. `favicon.svg` is the only file with a `<style>` element: an SVG used as a favicon is a separate document, so the page policy does not apply to it, and the block inside follows the operating system colour scheme.

## 17. Palette and tokens

`styles/tokens.css` holds the ground, sodium, cobalt, minium and patina sets from `docs/next/02_IDENTITY.md`. Differences from that document, each forced by the contrast test or by the existing code:
- `--tide` is gone; its two roles fold into `--cobalt-ink` and `--cobalt-soft`.
- `--marker` is new: the selected-row bar. Sodium on the light grounds is about 1.5:1, so light uses the dark gold of `--sodium-ink` and dark uses sodium.
- `--readout-alert` is new: error text on the inverted status strip, which is dark in both themes, so `--minium-ink` cannot be used there.
- Dark `--line-strong` is `#5B6760` instead of `#4A544E` to reach 3:1 on both dark grounds.
- Radii are rounder than the document (8, 12, 16 and 22 px) and a pill radius is added; `--font-code` keeps Commit Mono; type tokens keep their existing split of size and line height.
- The sodium fill of the primary button is not paired for boundary contrast: the label is paired at well above 4.5:1 and the button is identified by its text.

## 18. Layout below 1024 px

The rail becomes a sheet opened from an Items button in the item header; selecting an item closes it. Below 700 px the wordmark and file size are hidden; below 640 px the Code and Result switch is shown and the Run bar stays visible in both panes. The grid rows of the main column are assigned explicitly so that a visible information strip cannot push the editor into the wrong row.

## 19. Visual baselines

`tests/__visual__` holds 36 baselines (nine states, two sizes, two themes) from Chromium on Linux with reduced motion and the status strip masked where it shows a duration. They are not platform-suffixed, so a different operating system will show small font-rendering differences; regenerate them with `npx playwright test tests/e2e/visual.spec.js --update-snapshots` after checking the screenshots by eye.

## 20. One line differ

`src/core/diff.js` holds the longest-common-subsequence matcher that `module-source.js` already used to place hidden `Attribute` lines, now shared with the Changes view and the printed diff. Above four million line pairs the middle of the text is not matched and shows as removed and added; the shared prefix and suffix are always matched.

## 21. Saving

When the browser offers `showSaveFilePicker` the workbook is written through it, read back from the handle and compared byte for byte before the status says it was saved; a mismatch is reported as `write.verify` and nothing is called saved. If the chosen entry is the file that was dropped in (known only when the browser gives a handle for a drop), a dialog asks before the original is replaced. Elsewhere the file goes through an `<a download>` and the status says only that it was downloaded. The feature is detected, never inferred from the user agent.

When a digital signature is removed on save, the rewritten `[Content_Types].xml` is written first and the signature parts and `vbaProject.bin.rels` are dropped; every other entry keeps its position and its original compressed bytes.
