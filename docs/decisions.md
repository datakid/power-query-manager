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
