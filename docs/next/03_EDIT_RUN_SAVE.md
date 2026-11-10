# 03 — Edit, run, save

This is the product. Everything else is support. Twelve items, each finished to the Definition of Done in `00_START_HERE.md` §4 before the next is started.

The loop the user is in: **open → see → change → run → compare → save → open in Excel and it is still their file.**

**Colour names.** This file was written before the Glaze palette. Read `--patina*` as `--celadon-ink` / `--celadon-soft` and `--minium*` as `--madder-ink` / `--madder-soft` (`02A` §5). Where a control is placed (top bar, menu, palette) is decided by `02B` §5. This file decides what the control does.

---

## E-1 — One honest dirty model

**Why:** three places currently decide "has this changed" (B-03), and the Download button, the rail dot and the writer can disagree.

**Build:** in `src/app/session.js`, a single source of truth.

```
changes() -> { queries: Map<name, {original, current}>, modules: Map<name, {original, current}>, count }
isDirty() -> count > 0
```
`changes()` is computed, never cached, and uses `normalizeQueryText` for M and exact comparison for VBA (B-03). Everything that needs to know — the Download button's enabled state, its tooltip, the rail dots, the beforeunload guard (B-05), the Revert buttons — reads it.

**States:** clean (Download disabled, tooltip `S.downloadNone`), dirty (Download enabled, label shows the count: *"Download — 2 changes"*), saving (button busy, disabled, status says what is happening), saved (status says the file name written, verdict chip `--celadon-ink` on `--celadon-soft`).

**Placement (`02B` §4.1, §5).** The top bar's **Changes N** split-button carries the count and opens the Changes review. Its menu holds *Review changes*, *Save a copy…* and *Download*. `Ctrl/Cmd+S` saves directly. Disabled and clean states keep the tooltip above.

**Test:** `T-E-01` e2e: edit, revert by hand to the original text (including a trailing newline), assert the app is clean again.

---

## E-2 — Revert, at three scopes

Revert this edit (undo to the original text of the current item), revert this item, revert everything. The third asks for confirmation in a dialog with the count; the first two do not, because they are reversible by the editor's own undo stack.

Reverting must restore the **original** text exactly, not a re-serialised version. Keep the original string on the item when the workbook is opened and never overwrite it.

**Test:** `T-E-02` e2e: edit three items, revert one, revert all, assert `isDirty()` is false and the editor shows the original bytes for each.

---

## E-3 — See what changed before saving

**Build:** `src/core/diff.js`, pure, no DOM: a line-level diff (longest common subsequence on lines — `module-source.js` already contains an LCS; extract and share it rather than writing a second one, and note that in `docs/decisions.md`). Export `diffLines(a, b) -> [{ kind: 'same'|'add'|'del', a?, b?, text }]`.

**UI:** a Changes dialog from the Download button's split menu listing every changed item, each expandable to a unified diff with `--celadon-soft` additions and `--madder-soft` deletions, plus `+` / `−` glyphs in the gutter so colour is never the only signal, line numbers from both sides. It is read-only. This is also what gets printed by P-12.

**Test:** `T-E-03` unit on the differ (empty, identical, all-new, interleaved, CRLF vs LF); `T-E-03b` e2e asserting the dialog lists exactly the changed items.

---

## E-4 — Refuse to save VBA that cannot be a module

**Why:** a saved `.xlsm` that Excel repairs on open is worse than a refused save.

**Build:** `src/core/vba/validate.js`, pure. Checks, each returning a specific message:
- The edited text contains no NUL and no lone surrogate.
- Every character is encodable in the project's code page (`encodeText` already throws — catch it here and report the first offending character with its line and column, instead of failing deep in the writer).
- Line length ≤ 1023 characters (the VBA limit), reported per line.
- `Attribute` lines were not introduced into the visible text by the user (they belong to the hidden set — `splitModuleSource` moves them; if the user types one, say so plainly).
- Total module size under the limit in `src/core/limits.js`.

Validation runs on edit (debounced 300 ms) and marks the gutter; saving with an error is blocked with the reason, not with a generic failure.

**Test:** `T-E-04` unit per rule; `T-E-04b` e2e: paste a `€` into a cp-1252 project, assert the specific message and that Download is blocked.

---

## E-5 — The run lifecycle, stated once

**States:** idle → running → (done | error | cancelled | timeout). Every transition updates the status region once (B-15), and the primary button is Run in idle and Cancel in running, never both.

**Rules:** cancelling terminates the worker and the UI returns to idle within 200 ms (do not wait for a cooperative stop to be acknowledged); a second run while running is impossible because the button is Cancel; the timeout is enforced on the main thread (B-09); every terminal state clears `runId` (B-08).

**Test:** `T-E-05` e2e over all five terminal states, each asserting the button label, the status text and that a subsequent run works.

---

## E-6 — Bindings, asked for once

When a query needs an external input, the worker posts `need-binding`. The dialog must: name the query and what it wants; offer the workbook's own tables/sheets as the first option; allow a file to be chosen for a file-backed source; allow Skip, which makes the run continue with an M error value for that source rather than failing the whole run; and remember the answer **for the session only** (G-3).

Never ask the same question twice in one run. The `waiting` map in `m-worker.js` keys on `${m.id}:${key}` — keep the key stable across retries, and clear the map when a run ends, or a cancelled run leaves a promise that never settles.

**Test:** `T-E-06` e2e: a fixture needing two bindings asks twice; re-running asks zero times; Skip produces a cell error, not a failed run.

---

## E-7 — The result, with all four states

Empty table (columns but no rows): show the header and a row that says so. Scalar result: show the value in a card, not a one-cell grid. Function: show the signature and the message that a function is not run. Error: show the M error's reason, detail and the source position, with a link that focuses the editor at that offset.

Row cap: when `rowCap` truncates, say it above the grid — *"Showing the first 1,000,000 rows."* — not only in the status strip.

**Test:** `T-E-07` e2e, one fixture per state.

---

## E-8 — Compare with what Excel loaded

The snapshot comparison already exists (`compare/cache-compare.js`). Make its verdict unmissable and specific: a chip in the status strip with one of *matches Excel*, *differs from Excel (N cells)*, *no Excel snapshot*, and a Differences view that lists the first 200 differing cells as `row, column, Excel value, quoin value`. The chip colour is `--celadon-ink` on `--celadon-soft` / `--madder-ink` on `--madder-soft` / `--ink-3` on `--track`, each with a glyph (check, cross, dash).

Be honest in the copy: quoin's engine is not Excel's. A difference is information, not a failure. The message for a type-only difference says so.

**Test:** `T-E-08` e2e on a fixture whose cached values were edited to differ in exactly three cells.

---

## E-9 — Saving to a real file

Two paths, one flow:

1. **File System Access** (`showSaveFilePicker`) when available: suggested name from `suggestedFileName` (B-01), a type entry matching the real extension, write, then **re-read back from the handle** and compare bytes with what was written. Only then say saved.
2. **Download fallback** elsewhere: `<a download>` with an object URL, revoked after the click. Say that the browser's download folder has the file; there is nothing to verify, and the UI must not claim there is.

Never overwrite the original silently: in path 1, if the chosen handle resolves to the file the session was opened from, warn once with a dialog that says the original will be replaced, and let the user continue or choose another name. Feature-detect — do not sniff the user agent.

**Test:** `T-E-09` e2e via the download path with `acceptDownloads` (already configured); the File System Access path goes on the manual matrix in 05 §4.

---

## E-10 — Prove the saved file in the test, not by eye

For each fixture, the save test asserts: the ZIP entry order is unchanged; every untouched entry's compressed bytes are identical; only the expected parts differ; the result re-opens in quoin with the edits present; a second no-edit save is byte-identical (B-06); and `[Content_Types].xml` and the `.rels` are unchanged unless an item was added.

**Test:** `T-E-10`, parameterised over every workbook fixture.

---

## E-11 — Errors the user can act on

One taxonomy, in `src/core/errors.js`, surfaced through `errorMessage` in `strings.js`. Every `QuoinError` code has: a sentence saying what happened, a sentence saying what the user can do, and, where it exists, the part name or source position. No code path shows `e.message` from a thrown `Error` raw. No alert boxes.

Audit every `throw new QuoinError(` in `src/core/**` and make sure each code has an entry. Add `T-LINT-15`: every string passed as the first argument to `QuoinError` appears as a key in the `errorMessage` table.

**Test:** `T-LINT-15`; `T-E-11` unit asserting the table has no unused keys either.

---

## E-12 — The keyboard runs the whole app

`?` opens the shortcut sheet when focus is not in a text field or the editor (it already exists — make it complete and correct, and generate it from the command registry once `06` WB-13 exists). Required: `Ctrl/Cmd+O` open, `Ctrl/Cmd+S` save, `Ctrl/Cmd+Enter` run, `Escape` cancel a run or close the top layer, `Ctrl/Cmd+F` find in editor, `F3`/`Shift+F3` next/previous match, `Alt+Up`/`Alt+Down` previous/next item in the rail, `Ctrl/Cmd+P` print preview (Phase 4), `Ctrl/Cmd+Z`/`Shift+Ctrl/Cmd+Z` the textarea's native undo (do not reimplement it).

Shortcuts are suppressed while a dialog is open except Escape. `Ctrl/Cmd+S` must `preventDefault` so the browser's own save dialog never appears. Match `Alt` combinations on `event.code`, not `event.key` (macOS turns `Alt`+letter into a character). Never bind the reserved combinations listed in `02B` §7.1.

**Test:** `T-E-12` e2e: perform open → select → edit → run → save entirely from the keyboard, asserting focus is never on `<body>` after any step.

