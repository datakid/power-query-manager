# 01 — Audit

Every item has an **ID**, the **file**, the **evidence** you can see without running anything, the **fix**, and the **test** that proves it.

Rule W-1 still applies: reproduce before you fix. Items marked `[verify]` were derived from reading the code, not from a run — if the symptom does not appear, write it under *Not reproduced* in `PROGRESS.md` and move on. Items marked `[certain]` are visible in the source as written.

Order of work: **H-1**, then **B-01 … B-06** (data and file safety), then **B-07 … B-16** (interaction), then **B-17 … B-24** (polish).

---

## H-1 — Remove dead files and unused fonts `[certain]`

**Where:** repo root, `public/fonts/`, `scripts/build-manifest.mjs`, `tests/lint/checks.js`

**Evidence:** `build-manifest.mjs` walks `src`, `styles`, `public` whole, so every stray file in those trees ships and is cached by the service worker. Prototype directories (`js/`, `vendor/`, `scratch/`) and font families that `styles/tokens.css` never declares (`fraunces`, `instrument-sans`, `jetbrains-mono`) are dead weight in the install cache.

**Fix:**
1. List every file under `public/fonts/` and grep `styles/` for its name. Delete any font file with no `@font-face` referencing it, and the WOFF2 of any weight/style never used.
2. Delete `js/`, `vendor/`, and any prototype HTML at the root that is not `index.html`.
3. Add a lint check `T-LINT-11`: every file under `public/fonts/` must appear in a `src: url(...)` in `styles/*.css`.
4. Re-run `npm run build` and diff `asset-manifest.json`.

**Test:** `T-LINT-11`. Plus: `asset-manifest.json` file count drops and contains no deleted name.

---

## Group A — Data and file safety

### B-01 — A macro-enabled template is saved as `.xlsm` `[certain]`

**Where:** `src/core/save.js`, `suggestedFileName`

**Evidence:**
```
const ext = wb.vba ? 'xlsm' : wb.format === 'xltx' || wb.format === 'xltm' ? wb.format : ...
```
`wb.vba` is tested **first**, so an `.xltm` (macro-enabled template) with VBA — which always has `wb.vba` — is offered as `name (edited).xlsm`. The bytes are still a template; only the extension lies. Excel then opens a template as a workbook.

**Fix:** decide on `wb.format` first, and use `wb.vba` only to promote `xlsx → xlsm`:
- `xltm` → `xltm`; `xltx` → `wb.vba ? 'xltm' : 'xltx'`; `xlsm` → `xlsm`; `xlsx` → `wb.vba ? 'xlsm' : 'xlsx'`; anything else → keep the original extension.
Move this to the new pure module `src/core/filename.js` (see B-02) as `suggestedFileName(wb)`.

**Test:** `T-B-01` unit, table-driven over the eight `(format, hasVba)` pairs.

---

### B-02 — `sanitizeFileName` can produce broken or illegal names `[certain]`

**Where:** `src/core/export/files.js`

**Evidence:**
```
.slice(0, 120).trim() || 'file'
...
`${clean.slice(0, 120 - ext.length)}${ext}`
```
Three defects: (a) `String.prototype.slice` cuts UTF-16 code units, so a name truncated at 120 can end in a lone surrogate half (emoji, many CJK extension characters) and produce a name the OS rejects or mangles; (b) a trailing `.` or space survives the second slice and is illegal on Windows; (c) Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, with or without extension) are returned unchanged and cannot be saved.

**Fix:** create `src/core/filename.js` exporting `sanitizeFileName(name, ext)` and `suggestedFileName(wb)`; `src/core/export/files.js` re-exports from it so no caller changes.
- Truncate by code point: `[...base].slice(0, n).join('')`.
- After truncation strip trailing `.` and whitespace, then re-apply the `|| 'file'` fallback.
- If the base, upper-cased, matches `/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/`, prefix with `_`.
- Keep the existing allowed-character class and the case-insensitive extension strip.

**Test:** `T-B-02` unit: surrogate pair at the boundary; `"  ....  "`; `"CON"`; `"report.XLSX"` with `.xlsx`; a 400-character name; a name of only banned characters.

---

### B-03 — Two different definitions of "unchanged" `[certain]`

**Where:** `src/app/session.js` (`trimEnds`) and `src/core/pq/writeback.js` (`changedQueryEdits`)

**Evidence:** both trim with `replace(/^\s+/,'').replace(/\s+$/,'')`, written out twice. The UI decides whether the Download button is enabled using one copy; the writer decides whether a part is rewritten using the other. Any future edit to one (for example, also normalising line endings) silently desynchronises them: the UI says "no changes" while the writer rewrites the part, or the reverse.

**Fix:** add `export const normalizeQueryText = (s) => s.replace(/^\s+/, '').replace(/\s+$/, '');` to `src/core/pq/section.js` and import it in both places. Do the same for the VBA side if a second copy exists (`changedVbaEdits` compares `view !== m.model.visible` exactly — document that VBA is compared **without** trimming, because leading whitespace is significant in a module, and add that sentence to `docs/decisions.md`).

**Test:** `T-B-03` unit: an edit that differs from the original only by a trailing newline is reported as *not changed* by both `session.isDirty` and `changedQueryEdits`.

---

### B-04 — `selfCheck` must be unbypassable `[verify]`

**Where:** `src/core/save.js`, `src/app/main.js` (download path), `src/core/export/files.js` (zip export)

**Evidence:** `buildWorkbook` imports `openWorkbook` and `equalBytes`, i.e. it re-opens what it wrote and compares. Guardrail G-1 depends on there being **no** path to a downloaded workbook that skips this. The export-to-zip path builds `.m` and `.bas` files directly and legitimately skips it; the workbook path must not.

**Fix:**
1. Make the check mandatory inside `buildWorkbook` (not an option argument). If a caller passes a flag that disables it, delete the flag.
2. On failure throw `QuoinError('save.selfcheck', …)` and show a specific message; never fall back to "download anyway".
3. Add `T-LINT-12`: the identifier `selfCheck` appears in exactly one file and is never called behind a `try {} catch {}` that swallows.

**Test:** `T-B-04` unit: monkey-patch the comparison input so the rebuilt workbook differs, assert `buildWorkbook` rejects with `save.selfcheck` and that no bytes are returned. `T-B-04b` e2e: the error surfaces in the status region with a specific sentence.

---

### B-05 — Unsaved edits can be lost without warning `[verify]`

**Where:** `src/app/main.js`, `sw.js`

**Evidence:** edits live only in `Session.queryEdits` / `moduleEdits` (G-3 forbids persisting them). Nothing guards a reload, a tab close, or a navigation. `sw.js` calls `self.skipWaiting()` in `install` and `clients.claim()` in `activate`, so a new worker takes control of the open tab; any later reload (user or browser) discards the session silently.

**Fix:**
1. Add a `beforeunload` listener registered **only while dirty**, removed when clean. No storage, no new permission, allowed by G-3.
2. Remove `self.skipWaiting()` from `install`. Let the new worker wait. Do not prompt, do not auto-reload — the updated app is picked up the next time the user opens the tab with no session.
3. `clients.claim()` stays in `activate` (it only matters on first install).

**Test:** `T-B-05` e2e: edit a query, call `page.reload()`, assert the dialog fires (`page.on('dialog')` receives a `beforeunload`); then revert the edit and assert reloading is silent.

---

### B-06 — Round-trip through quoin twice must be byte-stable `[verify]`

**Where:** `src/core/save.js`

**Evidence:** `selfCheck` proves *written → readable*. It does not prove *written → written again with no edits → identical*. A writer that, say, re-wraps base64 at a different width (`wrapBase64` in `pq/writeback.js` takes `lineLength`) would pass `selfCheck` and still drift on every save.

**Fix:** none expected; this is a proof. If it fails, the failing writer is the bug and it is in scope.

**Test:** `T-B-06` unit for each fixture: open → edit one query → save → open the result → save again with **no** edits → assert the two outputs are byte-identical, and that every part the first save did not touch is byte-identical to the original.

---

## Group B — Interaction

### B-07 — `h()` silently drops every `false` attribute value `[certain]`

**Where:** `src/ui/dom.js`

**Evidence:**
```
if (v === undefined || v === null || v === false) continue;
```
So `h('button', { 'aria-expanded': false })` renders **no** `aria-expanded` attribute at all. For a disclosure control the missing attribute is not equivalent to `"false"`: a screen reader announces a plain button with no collapsed state. The same applies to `aria-selected`, `aria-pressed`, `aria-checked`, `aria-current`, `aria-hidden`, `aria-disabled`, `aria-invalid`, `aria-modal`, `contenteditable`, `draggable`, `spellcheck`.

**Fix:** in `h()`, before the skip, special-case the string-valued attributes:
```
const STRING_BOOL = /^(aria-|contenteditable$|draggable$|spellcheck$)/;
```
If `v === false` **and** `STRING_BOOL.test(k)`, set the attribute to `"false"`. Keep `v === false` skipping for everything else (so `disabled: false` still means "no attribute"). `v === true` on an `aria-*` key must set `"true"`, not the empty string — the current `v === true → setAttribute(k, '')` branch produces `aria-expanded=""`, which is invalid.

**Test:** `T-B-07` unit (jsdom-free: assert through a Playwright page evaluating `h`) or e2e: open the settings menu, assert `aria-expanded="true"`, close it, assert `aria-expanded="false"` is **present**. Add an axe run on the menu-open state.

---

### B-08 — A worker error leaves the app permanently "running" `[certain]`

**Where:** `src/app/runner.js`

**Evidence:**
```
this.worker.onerror = (ev) => {
  for (const h of this.handlers.values()) h({ type: 'result', status: 'internal', ... });
  this.handlers.clear();
  this.worker = null;
};
```
`this.runId` is never cleared, and `get running() { return this.runId !== null; }`. After any worker-level error the Run button stays in its Cancel state and `ensure()` builds a new worker whose results are delivered against a stale handler map. The only recovery is a reload, which loses the session (B-05).

**Fix:** set `this.runId = null` in `onerror`, and in every terminal branch of `run()` (`result`, `cancel`, `internal`). Extract a private `finish(id)` that deletes the handler and clears `runId` only if `this.runId === id`, and call it from all of them.

**Test:** `T-B-08` e2e: start a run against a query that throws at module scope in the worker (fixture `worker-boom.xlsx`, or force it by posting a malformed message), assert the status shows the internal-error string **and** the Run button returns to "Run" and a second run succeeds.

---

### B-09 — The run timeout is not enforced on the main thread `[verify]`

**Where:** `src/app/runner.js`, `src/workers/m-worker.js`, `src/core/limits.js`

**Evidence:** `timeoutS` is a setting and `withLimits` exists in the core, so the interpreter can stop itself — but only while it is executing M. A worker stuck in a native call, or a run that never posts a result, has no main-thread deadline.

**Fix:** in `Runner.run`, start a `setTimeout(timeoutS * 1000 + 2000)`. On fire: `worker.terminate()`, `this.worker = null`, resolve with `{ status: 'timeout' }`, clear state as in B-08. Clear the timer on every terminal message. Use the *settings* timeout plus a two-second grace so the engine's own cooperative stop normally wins and produces the better message.

**Test:** `T-B-09` e2e with `timeoutS` set to 1 on a fixture containing an infinite `List.Generate`; assert the timeout string within 5 s and that the UI is usable afterwards.

---

### B-10 — Rail focus and scroll position are lost when the selection changes `[verify]`

**Where:** `src/app/workspace.js`

**Evidence:** `this.rail = h('nav', ...)` is rebuilt (`clear()` + re-append) on selection change; a rebuilt list cannot keep DOM focus, and the scroll offset of the rail container resets when its children are replaced.

**Fix:**
1. Build the rail **once**; on selection change only toggle `aria-selected` / the `is-current` class.
2. Roving tabindex: the selected item has `tabindex="0"`, all others `-1`. Up/Down move selection and focus; Home/End jump; typing a letter jumps to the next item starting with it.
3. If the list must be rebuilt (a new file is opened), restore `scrollTop` and focus the selected item explicitly.

**Test:** `T-B-10` e2e: focus the third query with the keyboard, press Down, assert `document.activeElement` is the fourth item, assert `aria-selected="false"` is present on the third (needs B-07), and assert the rail `scrollTop` is unchanged after switching.

---

### B-11 — Grid limits and keyboard `[verify]`

**Where:** `src/ui/grid.js`

**Evidence:** `const SORT_LIMIT = 200000;` and `const PAGE = 200;` with no visible user-facing explanation. A result of 500 000 rows either sorts silently wrongly, or the sort control does nothing with no message. The grid is `tabindex`-able (`.grid:focus-visible` exists in `grid.css`) but there is no documented cell cursor.

**Fix:**
1. Above `SORT_LIMIT` rows, disable the sort control, set `aria-disabled="true"`, and show the string `sortTooLarge` (new, in `strings.js`): *"Sorting is available up to 200,000 rows. This result has N."*
2. Keyboard: Arrow keys move a cell cursor; PageUp/PageDown move by `PAGE`; Home/End to first/last column; Ctrl+Home/Ctrl+End to the corners; Enter opens the cell detail popover; Escape closes it. The focused cell gets `aria-selected` and is scrolled into view.
3. The grid container is `role="grid"` with `aria-rowcount`/`aria-colcount` set to the **total**, not the rendered window.

**Test:** `T-B-11` e2e on a 300 000-row fixture: sort disabled with the message; arrow and page navigation move the cursor and the virtual window; `aria-rowcount` equals the total.

---

### B-12 — Editor overlay drift and find-bar behaviour `[verify]`

**Where:** `src/ui/editor.js`, `styles/editor.css`

**Evidence:** `.code-area pre` and `.code-area textarea` are absolutely positioned on top of each other and both declare `letter-spacing: 0; word-spacing: 0; tab-size: 4`. Any difference in font fallback, `font-feature-settings`, or padding between the two shifts the highlight layer away from the caret. The CSS does not pin `font-variant-ligatures: none`, and ligatures in a code font (`->`, `=>`, `<=`) change the advance width of the `pre` only, because the textarea is rendered by the platform text layer.

**Fix:**
1. Add `font-variant-ligatures: none; font-kerning: none; font-variant-numeric: normal;` to the shared rule in `editor.css`.
2. Make `scroll` sync one-directional and rounded: on textarea scroll, set `pre.scrollTop = textarea.scrollTop` and the same for `scrollLeft`, with no smoothing.
3. Find bar: `Escape` returns focus to the textarea with the selection preserved; `Enter`/`Shift+Enter` next/previous; the match count is announced **once** per search term via the status region (not per keystroke — debounce 300 ms).
4. The gutter must scroll with the code (`gutter.scrollTop = textarea.scrollTop`) — `overflow: hidden` on `.gutter` means it currently relies on being translated; verify at 2 000 lines.

**Test:** `T-B-12` e2e: load a 2 000-line module, type at line 1 500, screenshot and assert the caret and the highlighted token line up (compare the `pre` line offset with the textarea's `selectionStart` line via `scrollTop`); search, press Escape, assert focus is back in the textarea.

---

### B-13 — Menus and popovers: escape, outside click, focus return `[verify]`

**Where:** `src/ui/dialogs.js` (`menu`, `popover`), `src/ui/dom.js` (`placeBelow`, `onOutside`)

**Evidence:** `onOutside` exists, so outside-click closing is handled; nothing in the excerpt restores focus to the trigger, and `placeBelow` has no flip logic for a trigger near the bottom edge (at 390×844 the overflow menu opens off-screen).

**Fix:**
1. On open: remember the trigger; on close: `trigger.focus()` unless focus already moved deliberately.
2. `Escape` closes the top-most layer only.
3. `placeBelow`: if the panel bottom would exceed `innerHeight - 8`, flip above; if it would exceed the right edge, right-align. Clamp to the viewport with an 8 px margin (use `var(--s-2)` through a CSS custom property read once, not a literal in JS — or keep the literal in JS, which the lint allows, since T-LINT-3 is about CSS).
4. Arrow keys move between menu items; `aria-expanded` on the trigger (needs B-07).

**Test:** `T-B-13` e2e at 390×844: open the overflow menu, assert the panel's bounding box is fully inside the viewport; press Escape, assert focus is on the trigger.

---

### B-14 — Dialogs do not return focus `[certain]`

**Where:** `src/ui/dialogs.js`, `openDialog`

**Evidence:**
```
document.body.append(dialog);
dialog.addEventListener('close', () => dialog.remove());
dialog.showModal();
```
The element is removed on close, so the browser's own "return focus to the previously focused element" behaviour has nothing to return to in some engines, and in all of them the removal happens before any restore the app might do.

**Fix:**
```
const opener = document.activeElement;
dialog.addEventListener('close', () => { dialog.remove(); if (opener && opener.isConnected) opener.focus(); });
```
Also: give every dialog an `aria-labelledby` pointing at its `<h2>`, and focus the first interactive control (or the heading with `tabindex="-1"` if the dialog is read-only) on open.

**Test:** `T-B-14` e2e for settings, shortcuts, details and binding dialogs: open with the keyboard, close with Escape and with the Close button, assert focus is back on the opening control each time. Run axe with the dialog open.

---

### B-15 — Status announcements `[verify]`

**Where:** `src/app/main.js` (status region), `src/app/workspace.js`

**Evidence:** a single status element is used for file state, run state, match counts and errors. A live region that is rewritten on every keystroke (find) or every progress tick floods a screen reader; one that is written with the same text twice announces nothing the second time.

**Fix:**
1. Two regions: `#status` (`aria-live="polite"`, `role="status"`) for state, and `#alert` (`role="alert"`) for errors only.
2. A `say(text)` helper that no-ops if the text is unchanged, and re-announces an identical message by appending a zero-width space toggle.
3. Progress during a run updates at most once per 500 ms.

**Test:** `T-B-15` e2e: run a query, collect the sequence of `#status` text values, assert no duplicate consecutive values and at most one update per 500 ms.

---

### B-16 — Drop zone edge cases `[verify]`

**Where:** `src/app/main.js`

**Evidence:** `dropFile` in the test helpers synthesises a single-file drop, so only that path is covered.

**Fix:** handle, each with a specific string from `strings.js`:
- `dragenter`/`dragleave` counting so the highlight does not flicker over child elements (use a counter, not a boolean).
- More than one file dropped → use none, say *"Drop one workbook."*
- A directory dropped → say *"That is a folder."*
- An unsupported extension → say *"quoin opens .xlsx, .xlsm, .xltx and .xltm files."*
- A zero-byte or non-ZIP file → the existing open error, not a stack trace.
- `dragover` must `preventDefault` on the window too, so a miss-drop does not navigate the tab away (this one can destroy a session — treat it as Group A priority).

**Test:** `T-B-16` e2e: each case above; plus a drop outside the drop zone asserts the page did not navigate.

---

## Group C — Polish and build

### B-17 — Theme colours and the theme bootstrap `[certain]`

**Where:** `index.html`, `src/app/theme-init.js`

**Evidence:**
```
<meta name="theme-color" content="#F8F5EF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17181C" media="(prefers-color-scheme: dark)">
```
Neither value exists in the new palette (`--ground` is `#DCE0DA` light, `#0D100F` dark), and neither matches the current `--paper` either. Also, `theme-init.js` removes `data-theme` in its `catch` — if `localStorage` throws, the correct behaviour is to do nothing, since the attribute cannot have been set.

**Fix:** update both metas to the new `--ground` values (02 I-1). Change the catch body to a no-op that still satisfies the lint (assign to a void variable or keep an empty block if the parser allows). Add `T-LINT-13`: each `theme-color` value must appear literally as a `--ground` value in `styles/tokens.css`.

**Test:** `T-LINT-13`, and `T-B-17` e2e asserting `getComputedStyle(document.body).backgroundColor` equals the meta colour in both schemes.

---

### B-18 — The culture setting is ignored by the UI `[certain]`

**Where:** `src/app/workspace.js`, `src/ui/grid.js`

**Evidence:**
```
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ...`;
```
`'en-US'` is hard-coded while `settings.culture` offers every supported culture, and the grid formats numbers with its own `numberFormat`. A user on `de-DE` sees `1,234` in one place and `1.234` in another.

**Fix:** one `Formats` object built from `settings.culture`, holding `number`, `integer` and `dateTime` formatters, passed to the grid and to the workspace. Rebuild it when the setting changes and re-render.

**Test:** `T-B-18` e2e: set culture to `de-DE`, assert the row-count label and a numeric cell both use `.` as the thousands separator.

---

### B-19 — User-visible text outside `strings.js` `[certain]`

**Where:** `src/ui/grid.js`

**Evidence:** `typeLabel` returns the literals `'123'`, `'abc'`, `'1.2'`, `'true/false'` and falls through to the raw M type name; `cellDisplay` substitutes `' ↵ '`. These are visible in the column headers and cells, so T-LINT-9 should have caught them and did not.

**Fix:** move them into `S.typeInteger`, `S.typeText`, `S.typeNumber`, `S.typeLogical`, `S.newlineGlyph`. Widen the lint rule: in `src/ui/**` and `src/app/**`, a string literal that reaches `textContent`, a `text:` attribute in `h()`, or an `aria-label` must come from `S`. Implement by walking the acorn AST for `h(...)` calls and `textContent =` assignments.

**Test:** `T-LINT-9` extended; `T-B-19` unit on `typeLabel` over every M primitive type.

---

### B-20 — The cache version does not change when `sw.js` changes `[certain]`

**Where:** `scripts/build-manifest.mjs`

**Evidence:**
```
const roots = ['src', 'styles', 'public'];
const files = ['index.html', 'manifest.webmanifest'];
...
const hash = createHash('sha256'); for (const f of files) hash.update(f).update(readFileSync(f));
```
`sw.js` is copied into `dist/` later but is **not** in `files`, so it is not in the hash. Edit only the service worker and `version` is unchanged: the old cache is kept, and because `activate` deletes every cache that is not the current version, the new worker adopts the old entries wholesale.

**Fix:** include `sw.js` in the hashed set (hash it, but keep it out of the `files` array the worker pre-caches — a worker must not cache itself). Hash the literal file list too, so a deletion changes the version.

**Test:** `T-B-20` unit: run the manifest builder, record the version, append a newline to `sw.js`, run again, assert the version changed; restore the file.

---

### B-21 — The contrast test can pass vacuously `[certain]`

**Where:** `tests/unit/contrast.test.js`

**Evidence:**
```
for (const m of text.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2];
```
Only six-digit hex is collected. A token written as `#fff`, `rgb(...)`, `color-mix(...)`, `oklch(...)` or as a reference to another token is absent from `out`; the pair then compares `undefined` and — depending on how `lum` handles `NaN` — either throws or silently yields a ratio that passes. A missing pair is also not an error, so dropping a pair from `pairs.json` makes the suite greener.

**Fix:**
1. After parsing, assert every token named in `pairs.json` exists in **both** theme blocks; fail with the missing names.
2. Assert every `--*` token declared in `tokens.css` whose value is a colour appears in at least one pair, or in an explicit `pairs.json` `"exempt"` list with a reason string.
3. Support `#RGB` and reject anything else with a clear failure, so the palette is forced to stay in plain hex (which T-LINT-6 already implies).

**Test:** the test tests itself: `T-B-21` adds a temporary token in a fixture string and asserts the checker reports it as uncovered.

---

### B-22 — Icon generation `[certain]`

**Where:** `scripts/make-icons.mjs`

**Evidence:** `inner` is computed (strip the `<svg>` wrapper and the first `<rect>`) and then never used in the three PNG renders, which pass the whole `mark` as a data URL. So the maskable icon is produced from the same artwork as the normal one, with no safe-zone padding — Android will clip the corners of a full-bleed mark.

**Fix:** rewrite the script around three explicit sources: `public/mark.svg` (transparent, used for `icon-192.png` and `icon-512.png`), `public/icon-maskable.svg` (full-bleed background, content inside the central 66 %, used for `icon-maskable-192.png`/`-512.png`), and `public/apple-touch-icon.png` from a dedicated 180 px render with an opaque background (iOS does not honour transparency). Delete `inner`. Update `manifest.webmanifest` with both `"purpose": "any"` and `"purpose": "maskable"` entries.

**Test:** `T-B-22` unit: run the script in CI, assert each PNG exists, has the right pixel dimensions (parse the PNG IHDR directly — no dependency), and that the maskable PNG's corner pixels equal the background colour.

---

### B-23 — Offline behaviour on a cache miss `[verify]`

**Where:** `sw.js`

**Evidence:** the fetch handler returns the cached response or falls through to the network. Offline, a request for anything not pre-cached rejects, and a navigation to a URL with a query string (`?file=` is read in `main.js`) may miss the `'./'` entry.

**Fix:** in the fetch handler, for `request.mode === 'navigate'`, serve the cached `'./'` entry on network failure. For other misses, return `new Response('', { status: 504 })` rather than letting the promise reject, so no uncaught error reaches the page.

**Test:** `T-B-23` e2e: load the app, `context.setOffline(true)`, reload with `?x=1`, assert the app renders.

---

### B-24 — CSP drift between the meta tag and the server headers `[verify]`

**Where:** `index.html`, `_headers`, `vercel.json`, `tests/e2e/server.js`

**Evidence:** the policy is written out three or four times. The dev server's header includes `frame-ancestors 'none'`; the `index.html` meta does not (it cannot — `frame-ancestors` is ignored in a meta tag). Any future edit to one copy will not reach the others.

**Fix:** keep the meta as the source of truth, and add `T-LINT-14`: extract the policy string from `index.html`, from `_headers`, from `vercel.json` and from `tests/e2e/server.js`, normalise directive order and whitespace, and require the server copies to equal the meta copy **plus** exactly the allowed extra directives (`frame-ancestors 'none'`).

**Test:** `T-LINT-14`.

---

## Summary table

| ID | Area | Certainty | New test |
|---|---|---|---|
| H-1 | build | certain | T-LINT-11 |
| B-01 | save | certain | T-B-01 |
| B-02 | save | certain | T-B-02 |
| B-03 | state | certain | T-B-03 |
| B-04 | save | verify | T-B-04, T-LINT-12 |
| B-05 | state | verify | T-B-05 |
| B-06 | save | verify | T-B-06 |
| B-07 | a11y | certain | T-B-07 |
| B-08 | run | certain | T-B-08 |
| B-09 | run | verify | T-B-09 |
| B-10 | nav | verify | T-B-10 |
| B-11 | grid | verify | T-B-11 |
| B-12 | editor | verify | T-B-12 |
| B-13 | overlay | verify | T-B-13 |
| B-14 | dialog | certain | T-B-14 |
| B-15 | a11y | verify | T-B-15 |
| B-16 | input | verify | T-B-16 |
| B-17 | theme | certain | T-LINT-13, T-B-17 |
| B-18 | i18n | certain | T-B-18 |
| B-19 | text | certain | T-B-19 |
| B-20 | build | certain | T-B-20 |
| B-21 | test | certain | T-B-21 |
| B-22 | icons | certain | T-B-22 |
| B-23 | sw | verify | T-B-23 |
| B-24 | csp | verify | T-LINT-14 |
