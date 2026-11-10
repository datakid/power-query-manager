# quoin vNext — Start here**.

All five plan files plus new identity assets are written. Here's what you have in `plan/`:

| File | Contents |
|---|---|
| `01_AUDIT.md` | **25 items** (H-1, B-01…B-24), each with file, evidence quoted from your source, fix, test ID. Marked `[certain]` (visible in the code you pasted) vs `[verify]` (inferred — reproduce first) |
| `02_IDENTITY.md` | Name decision, new mark concept + exact geometry, full light/dark token sets, token migration map, 12 component specs, 40-screenshot baseline |
| `03_EDIT_RUN_SAVE.md` | E-1…E-12: one dirty model, revert, diff, VBA validation, run lifecycle, bindings, result states, Excel compare, real file saving, saved-file contract |
| `04_PRINT.md` | P-1…P-14, opening with what browsers *cannot* do, then the owning-our-own-pagination decision that makes bottom-repeat rows and page numbers possible |
| `05_TEST_PLAN.md` | Every test ID in one table, the `pairs.json` contents, 13 fixtures, the saved-file contract, 4 manual matrices |
| `assets/` | `favicon.svg`, `mark.svg`, `icon-maskable.svg`, `preview.html` |

**The real bugs I found in the code you pasted** (not guesses — quoted in the doc):
- `suggestedFileName` tests `wb.vba` first, so **`.xltm` templates get saved as `.xlsm`**
- `h()` drops `aria-expanded: false` entirely — the attribute is never emitted
- `runner.js` `onerror` never clears `runId` → app stuck in "running" forever after a worker crash
- `openDialog` removes the dialog on close with no focus return
- `build-manifest.mjs` doesn't hash `sw.js` → edit the service worker, version unchanged, old cache kept
- `make-icons.mjs` computes `inner` and never uses it → the maskable icon has no safe zone
- `contrast.test.js` only matches 6-digit hex; a missing token silently passes
- `grid.js` has `'abc'`, `'1.2'`, `'true/false'` as literals, bypassing your own T-LINT-9

**On the name:** keep *quoin*. One syllable, says *coin*, means "the dressed cornerstone" — it's true about the product and already gives you the tagline. Renaming costs you the `quoin.theme` key (G-3 forbids a migration, so a rename silently wipes everyone's theme). I wrote the rationale into the doc so it doesn't get re-litigated.

**On the mark:** I threw both drafts out. The new one is **a square ring with its bottom-right corner replaced by a solid sodium block** — every other corner rounded, that one square. Two primitives. It reads as a Q (ring = counter, block = tail) *and* as a cornerstone, and a rounded square with exactly one sharp corner is the kind of anomaly people actually remember. Geometry is pinned to a 64-unit grid so nobody redraws it by eye; the favicon is a separate heavier 32-grid construction so it survives 16px.

Open `plan/assets/preview.html` to judge it at every size in both themes before you commit to it.

**Cost advice:** have Sonnet do Phase 0 + Phase 1 Group A (B-01…B-06) in one session and stop. Those are the six items where a bug destroys a user's file. Phases 2–4 are safe to run later or to abandon half-done.
# quoin vNext — Start here

This folder is the complete brief for the next version of quoin (repo `datakid/power-query-manager`).
It is written for an implementing model (Claude Sonnet) working inside the repo with a shell, Node and Playwright.

Read every file in this folder **before writing any code**, in this order:

| # | File | What it decides |
|---|------|-----------------|
| 0 | `00_START_HERE.md` | Mission, global guardrails, phase plan, definition of done |
| 1 | `01_AUDIT.md` | Every bug and inconsistency found in the current code, with evidence, fix and test |
| 2 | `02_IDENTITY.md` | The visual overhaul: name, mark geometry, component list, verification |
| 2A | `02A_IDENTITY_AMENDMENT.md` | The Glaze palette: every colour token, both themes; replaces `02` §2 colours |
| 2B | `02B_VISUAL_REFINEMENT.md` | Shape, spacing, hierarchy, density, disclosure tiers and the control inventory (the no-loss contract); replaces `02`'s component sizes |
| 3 | `03_EDIT_RUN_SAVE.md` | The core of the app: view → edit → run → save a real file. Quality work only |
| 4 | `04_PRINT.md` | Printing: rows per page, orientation, paper, repeated rows top/bottom, column bands, code printing |
| 5 | `05_TEST_PLAN.md` | Every new test ID, the fixtures they need, the manual Excel and browser matrix |
| 6 | `06_WORKBENCH.md` | Phase 6: the workbench for many queries and VBA |
| — | `assets-v2/` | Glaze `favicon.svg`, `mark.svg`, `icon-maskable.svg`; `refined-preview.html` (+ `-dark`) is the **visual target**; `glaze-preview.html` shows the contrast pairs computed live |

Where two files disagree, the later letter wins for its own subject: `02B` over `02A` over `02` for shape and size, `02A` over `02` for colour. Behaviour, controls and features always come from `03`, `04` and `06`, and `02B` §5 guarantees none of them is dropped.

---

## 1. Mission

quoin opens an `.xlsx`/`.xlsm` in the browser, shows its Power Query (M) queries and VBA modules, lets the user
edit them, run the queries with a built-in M interpreter, and download a workbook that differs from the
original **only** in the parts that were edited.

The owner's priorities, in their words, are binding:

1. **A visual overhaul** with a palette that does not look like a generic SaaS product or a cosy editorial hobby project, plus a hand-drawn favicon and mark.
2. **Printing** with real control: rows per page, landscape/portrait, repeated rows at the top or bottom, the best result the browser print engine allows. Say plainly what is not possible.
3. **Fix bugs and inconsistencies.** The heart of the app is: view VBA and queries, run queries, edit, save a file with the edited code.
4. **Quality over quantity.** One finished feature is worth more than three half-finished ones. Do not add anything that is not in these files.

---

## 2. What you must never do (global guardrails)

These apply to every phase. A change that breaks one of them is wrong, even if the tests pass.

### 2.1 Product invariants
- **G-1 Byte preservation.** Parts the user did not edit are copied as their original compressed bytes. `selfCheck` in `src/core/save.js` must stay at least as strict as it is now. Never loosen it, skip it or catch-and-ignore it to make something work.
- **G-2 No network.** The app makes no requests after load. Do not add `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, CDN links, web fonts from other origins, analytics or telemetry. The CSP in `index.html`, `_headers` and `vercel.json` stays as strict as it is. Do not add `'unsafe-inline'` anywhere.
- **G-3 No new storage.** The only persistent item is `localStorage['quoin.theme']` (lint rule T-LINT-8). Print settings, file handles and edit state live in memory for the tab's lifetime. No IndexedDB, no sessionStorage, no cookies.
- **G-4 VBA is never executed.** Do not write a VBA interpreter, "dry run" or simulation. VBA is viewed, edited and saved only.
- **G-5 Do not touch the M engine** (`src/core/m/**`) or the binary writers (`zip-write.js`, `vba/cfb-write.js`, `vba/ovba-compress.js`, `pq/datamashup.js`) unless an item ID in these files names the file. If a fix seems to need it, stop and record it under *Blocked* in `PROGRESS.md`.
- **G-6 No runtime dependencies.** No npm packages in shipped code. Dev dependencies only for tests, and only if a spec item asks for one.

### 2.2 Code rules already enforced by `npm run test:lint` (do not fight them)
- **No comments** in JS, CSS, HTML or SVG (T-LINT-1). Not even one. Explain things in the markdown docs instead.
- Imports in `src/` are relative only (T-LINT-2).
- CSS spacing properties use `var(--s-*)` tokens, never raw `px` (T-LINT-3). `mm`, `pt`, `%`, `fr` are allowed (needed for print).
- **Colours only in `styles/tokens.css`** (T-LINT-6). Every other CSS file uses `var(--token)`.
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string timers (T-LINT-5). Build DOM with `h()` from `src/ui/dom.js`.
- No inline `style=` attributes, inline scripts or inline handlers in HTML. Setting `el.style.x` from JS is allowed (CSSOM is not blocked by CSP).
- `src/core/**` never touches `document`, `window` or `navigator` (T-LINT-7). Put pure logic there so it can be unit-tested in Node; put DOM code in `src/ui/` or `src/app/`.
- **All user-visible text lives in `src/ui/strings.js`** (T-LINT-9). Banned in strings: `!`, "please", "oops", "sorry", emoji (any Extended_Pictographic character, including `⚠`). Write calm, specific, plain sentences.
- The query string is read only in `src/app/main.js` (T-LINT-10).

### 2.3 Working rules
- **W-1 Reproduce first.** For every item in `01_AUDIT.md`, first write the failing test or reproduce the symptom (screenshot or console). If you cannot reproduce it, write what you tried under *Not reproduced* in `PROGRESS.md` and move on. Do not "fix" what you cannot show is broken.
- **W-2 Never weaken a test to make it pass.** If a spec item deliberately changes an expectation (for example the empty state in T-E2E-1 after the identity change), change that one assertion in the same commit and list it in `PROGRESS.md` under *Changed expectations*.
- **W-3 One item ID per commit.** Commit message format: `<ID>: <short summary>`, e.g. `B-07: keep rail focus and scroll across selection`.
- **W-4 Run the full suite at the end of each phase:** `npm test`. A phase is not done until it is green, and every new test listed for that phase exists and passes.
- **W-5 Look at what you built.** For every UI change, take Playwright screenshots at 1280×800 and at 390×844, in light and dark themes, and look at them. Clean tests do not prove a screen looks right.
- **W-6 Keep `PROGRESS.md` current** (create it at `docs/next/PROGRESS.md`): one section per phase with *Done*, *Changed expectations*, *Not reproduced*, *Blocked*, *Deviations*. Write it as you go, not at the end.
- **W-7 When the spec is ambiguous**, choose the option that preserves user data and the byte-preservation guarantee, write down the choice under *Deviations*, and continue. Do not stop the whole job over a cosmetic ambiguity.
- **W-8 Do not refactor what you are not asked to touch.** No renames, file moves or style changes outside the items in scope.

---

## 3. Phases

Run the phases in order. Each phase lists entry and exit criteria. Do not start the next phase while the current one is red.

### Phase 0 — Baseline and hygiene (small, mandatory)
**Entry:** a clean checkout.
1. `npm install`, `npx playwright install chromium`, `npm test`. Record the result in `PROGRESS.md`. If anything is red **before** you change code, record it and fix only what blocks the suite from running.
2. Do item **H-1** from `01_AUDIT.md` (remove dead prototype files and unused fonts).
3. Create `docs/next/PROGRESS.md`.

**Exit:** suite green, `npm run build` lists only the files it should (no `fraunces`, `instrument-sans`, `jetbrains-mono`, no `js/`, no `vendor/`).

### Phase 1 — Correctness fixes (`01_AUDIT.md`, items B-01 … B-24)
Fix the bugs that are independent of the new look first, so that the identity work and the print work build on correct behaviour.
Order inside the phase: data and file safety first (B-01 … B-06), then interaction (B-07 … B-16), then polish (B-17 … B-24).

**Exit:** every B-item is *Done* or recorded as *Not reproduced*; all new tests T-B-* pass; full suite green.

### Phase 2 — Visual identity (`02`, `02A`, `02B` as one phase)
Tokens first (I-1: `02A` §2 colours plus `02B` §2 shape and size tokens), then the mechanical token migration (I-2, `02A` §5), then components (I-3 … I-12) built to `02B` §4, then icons (I-13 … I-15) from `assets-v2/`, then the polish details (I-18, I-19 from `02A` §6), then the visual baseline (I-16).

**Exit:** contrast unit test green with the `02A` §7 `pairs.json` plus the `02B` §2 additions; T-I-08, T-I-09 and T-V-01 … T-V-07 green; screenshots of the 10 reference states (listed in I-16) taken in both themes and at both widths, compared with `assets-v2/refined-preview.html`, reviewed and stored as Playwright baselines; full suite green.

### Phase 3 — Edit, run, save (`03_EDIT_RUN_SAVE.md`, items E-1 … E-12)
**Exit:** round-trip tests T-E-* green on every fixture; manual checklist items that need a real browser (File System Access) noted in `PROGRESS.md`; full suite green.

### Phase 4 — Printing (`04_PRINT.md`, items P-1 … P-14)
Pure layout maths first (P-1, P-2, unit-tested in Node), then rendering, then UI, then code printing.

**Exit:** T-P-* green including the PDF page-count and paper-size tests; the browser behaviour matrix in `05_TEST_PLAN.md` §4 filled in for every browser you were able to run; full suite green.

### Phase 5 — Hardening and docs
1. Add Firefox and WebKit projects to `playwright.config.js` if they install. Run the suite. Record differences in `docs/observations.md`; fix only regressions you caused.
2. Update `README.md`, `docs/decisions.md` (remove the "print preview not built" entry, add the decisions you made), `docs/observations.md` (MX-10 is now applicable).
3. Re-run `npm run build`; check that `asset-manifest.json` contains the new files (`styles/print.css`, `src/ui/print*.js`, `src/core/print/*.js`, new icons).

**Exit:** green suite; docs match the code; `PROGRESS.md` complete.

---

## 4. Definition of done for any feature

A feature is done only when **all** of these are true. Check them one by one in `PROGRESS.md` for each E- and P-item.

- [ ] Works with the mouse, and with the **keyboard alone** (Tab, Shift+Tab, arrows, Enter, Space, Escape). Focus is visible and never lost to `<body>` after an action.
- [ ] Has accessible names; state changes are announced once through the existing status live region, not repeatedly.
- [ ] Looks right in **light and dark** and at **1280×800 and 390×844** (screenshots reviewed).
- [ ] Respects `prefers-reduced-motion`.
- [ ] Has a designed **empty state**, **loading state** and **error state**. No silent failures: every failure path shows a specific message from `strings.js`.
- [ ] No console errors or warnings, and no `securitypolicyviolation` events, during its tests.
- [ ] Has unit tests for pure logic and Playwright tests for the flow.
- [ ] The text is in `strings.js` and follows the tone rules.

---

## 5. Files you will create or change (overview)

```
docs/next/PROGRESS.md                new
styles/tokens.css                    rewritten (02 I-1 with 02A colours, 02B shape tokens)
styles/app.css, editor.css, grid.css token migration + components (02)
styles/print.css                     new (04)
public/favicon.svg, mark.svg         replaced from assets-v2 (02 I-13, 02B §7.2)
public/icon-maskable.svg             new source for PNG generation (02 I-14), from assets-v2
public/icons.svg                     the in-house icon sprite (02A §6.9)
public/*.png                         regenerated by scripts/make-icons.mjs (02 I-14)
scripts/make-icons.mjs               updated (02 I-14)
index.html, manifest.webmanifest     theme colours, print stylesheet link (02, 04)
src/core/print/layout.js             new, pure (04 P-1, P-2)
src/core/print/code-lines.js         new, pure (04 P-11)
src/core/diff.js                     new, pure (03 E-3)
src/core/vba/validate.js             new, pure (03 E-4)
src/core/filename.js                 new, pure (01 B-03)
src/ui/print-preview.js              new (04)
src/ui/print-render.js               new (04)
src/app/*.js, src/ui/*.js            fixes per item IDs
tests/unit/*.test.js                 new tests per 05
tests/e2e/*.spec.js                  new tests per 05
tests/a11y/pairs.json                rewritten for new tokens (02A §7, 02B §2)
```

