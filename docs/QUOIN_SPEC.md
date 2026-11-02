# Quoin — Build Specification

> Quoin reads the working parts of an Excel workbook (Power Query and VBA), lets you inspect, edit, and run them, and gives the workbook back to you with your changes. All of this happens in your browser.

This document is the single source of truth for building Quoin. It is written for the engineer (human or AI) who will implement it. Every requirement has an ID. Every ID is covered by at least one test in §14. If the spec and the code disagree, the spec wins until the spec is changed on purpose.

---

## 0. How to use this document

1. Read §1–§3 fully before writing code. They set the boundaries.
2. Build in the order given in §16 (Milestones). Do not start a milestone until the previous one passes its gate.
3. Treat every **MUST** as a blocking requirement, every **SHOULD** as expected unless there is a written reason, and every **MAY** as optional.
4. When something here is uncertain (marked **VERIFY**), do not guess. Produce a fixture in real Excel, observe what happens, record the result in `docs/observations.md`, and then implement it.
5. Never add a feature that is not here. Quoin does one thing.

---

## 1. Product definition

### 1.1 The one thing

A user drops in an `.xlsx` or `.xlsm` file. Quoin shows the Power Query queries and the VBA modules inside it. The user can:

| ID | Capability |
|---|---|
| P-1 | Read every Power Query (M) query, with its name, its code, and how it is loaded (table on a sheet, connection only, or Data Model). |
| P-2 | Read every VBA module (standard, class, document, and form code) as plain text. |
| P-3 | Edit query code and VBA code in a calm, well-built code editor. |
| P-4 | Run a query in the browser with a defined subset of the M language, and see the result as a table. |
| P-5 | Compare a query's result with the cached result Excel last saved in the workbook. |
| P-6 | Export a query result as CSV, TSV, JSON, or a new plain `.xlsx`. |
| P-7 | Export query code (`.m`) and VBA code (`.bas`, `.cls`, `.frm` code only) as single files or one `.zip`. |
| P-8 | Download the original workbook with the edited queries and/or VBA written back in, with everything else left as it was. |
| P-9 | (Milestone 5, optional) Show an approximate print preview based on the workbook's page setup. |

### 1.2 Who it is for

People who received a workbook and do not have Excel for Windows: Mac users, Linux users, Chromebook users, auditors, analysts who need to see "what this file actually does" before they trust it, and developers who keep M and VBA in version control.

### 1.3 What Quoin is not (non-goals)

| ID | Non-goal | Reason |
|---|---|---|
| N-1 | Running VBA | Running untrusted macros is a security risk, and a faithful VBA runtime needs the Excel object model. Quoin shows VBA and lets you edit it. It never runs it. |
| N-2 | Full M engine parity | The M standard library has over 900 functions and many connectors. Quoin implements a documented subset (§8.6). It names the exact unsupported function instead of guessing. |
| N-3 | Connecting to databases or services | Quoin makes no network requests (§3). External sources are mapped to local files the user chooses (§8.8). |
| N-4 | A spreadsheet editor | Quoin does not edit cells, formulas, charts, or formatting. |
| N-5 | `.xls`, `.xlsb`, `.ods`, Strict OOXML, encrypted workbooks | These are detected and refused with a clear one-line reason (§6.2). |
| N-6 | Accounts, sync, telemetry, cloud storage | None of these exist, and none ever will. |
| N-7 | Pixel-perfect Windows print output | Impossible in a browser: Windows printing uses GDI font metrics, the printer driver, and licensed fonts. M5 targets "same pages, same breaks, same headers," not identical pixels (§11). |

### 1.4 Honest assessment of feasibility

| Goal | Feasibility | Notes |
|---|---|---|
| Extract M queries | High | The format is documented in [MS-QDEFF]. |
| Write edited M back | High, but **VERIFY** in Excel | Excel will reset query permissions to defaults if the permission binding check fails. The queries still load. See §7.5. |
| Extract VBA source | High | The formats are documented in [MS-CFB] and [MS-OVBA]. |
| Write edited VBA back | Medium-high, but **VERIFY** in Excel | Quoin drops the compiled p-code so Excel recompiles from source. Digital signatures are removed (§9.6). |
| Run M | Medium | Fine for common transforms on local data. Connectors are out of scope. |
| Print fidelity | Low-medium | This is an approximation. That is stated in the UI. |

---

## 2. Brand and visual identity

### 2.1 Name

**Quoin** (pronounced "coin"). A quoin is the dressed cornerstone at the edge of a building. It holds the structure together and is usually ignored. That describes Power Query and VBA inside a workbook. The leading **Q** also stands for *query*.

- Wordmark: lowercase `quoin`, UI font, weight 600, letter-spacing `-0.01em`.
- Tagline (used once, on the empty state only): `The working parts of a workbook.`
- Never use exclamation marks, emoji, mascots, or jokes anywhere in the product.

### 2.2 Mark and favicon

The mark is a rounded square in Heather. It holds a parchment octagon (a cornerstone seen end-on, and a **Q** bowl) and a short Flax stroke at the lower right (the **Q** tail, and a magnifier handle). It was tested for legibility at 16 px, 32 px, and 256 px on both light and dark backgrounds.

`public/favicon.svg` (use this for 16–48 px):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#5F4D73"/><path d="M12.5 6h7l5.5 5.5v7L19.5 24h-7L7 18.5v-7z" fill="none" stroke="#F8F5EF" stroke-width="2.6" stroke-linejoin="round"/><path d="M21 21l5 5" stroke="#E6D79A" stroke-width="3.4" stroke-linecap="round"/></svg>
```

`public/mark.svg` (use this for 64 px and up; it adds the faint cube facets):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5F4D73"/><path d="M25 13h14l11 11v14L39 49H25L14 38V24z" fill="none" stroke="#F8F5EF" stroke-width="4" stroke-linejoin="round"/><path d="M14 24l18 7 18-7M32 31v18" fill="none" stroke="#F8F5EF" stroke-opacity=".38" stroke-width="2" stroke-linejoin="round"/><path d="M41 41l9 9" stroke="#E6D79A" stroke-width="5" stroke-linecap="round"/></svg>
```

Required raster exports (render from `mark.svg` once, offline, and commit the results): `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (mark at 80% scale on a full-bleed `#5F4D73` field), `apple-touch-icon.png` (180 px). Do not use a generator website, because that would upload brand files to a third party.

### 2.3 Palette — "Heather & Lichen"

The palette uses low chroma and warm neutrals: a dusty plum heather, grey-green lichen, dried flax, fired clay, and slate tide on parchment. It avoids the blue/indigo that dominates productivity tools and the green that is Excel's own.

Use colour sparingly. Neutrals carry about 90% of the screen. Heather is for the one primary action and the current selection. The other hues are for meaning only: success, warning, error, and information.

#### Light theme tokens

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F8F5EF` | App background |
| `--surface` | `#FFFDF9` | Panels, editor, grid |
| `--sunk` | `#F1EDE5` | Inputs, inactive tabs, code gutters |
| `--line` | `#E4DED3` | Hairlines |
| `--line-strong` | `#D3CBBE` | Focused borders, dividers that need presence |
| `--ink` | `#222830` | Primary text |
| `--ink-2` | `#4A505A` | Secondary text |
| `--ink-3` | `#6B7079` | Tertiary text, placeholders (must stay ≥ 4.5:1 on `--paper`) |
| `--heather` | `#5F4D73` | Primary action, selection, focus ring base |
| `--heather-hover` | `#52426A` | Primary hover |
| `--heather-soft` | `#EEE9F2` | Selected row, active nav item |
| `--lichen` | `#93AD84` | Success fill, "matches Excel" dot |
| `--lichen-ink` | `#4D6841` | Success text |
| `--lichen-soft` | `#EAF0E5` | Success background |
| `--flax` | `#E6D79A` | Accent in the mark, warning fill |
| `--flax-ink` | `#6E5E1E` | Warning text |
| `--flax-soft` | `#F7F1DA` | Warning background |
| `--clay` | `#B5705A` | Error fill |
| `--clay-ink` | `#94523F` | Error text |
| `--clay-soft` | `#F6E6E0` | Error background |
| `--tide` | `#6C9499` | Info fill, library function highlight base |
| `--tide-ink` | `#3F6A70` | Info text |
| `--tide-soft` | `#E3EEEF` | Info background |

#### Dark theme tokens (used when `prefers-color-scheme: dark`, or when the user chooses it)

| Token | Hex |
|---|---|
| `--paper` | `#17181C` |
| `--surface` | `#1E2026` |
| `--sunk` | `#131418` |
| `--line` | `#2C2F37` |
| `--line-strong` | `#3A3E48` |
| `--ink` | `#ECE8E1` |
| `--ink-2` | `#B9B5AE` |
| `--ink-3` | `#8D8A85` |
| `--heather` | `#B7A5CC` |
| `--heather-hover` | `#C7B8D9` |
| `--heather-soft` | `#2A2433` |
| `--lichen` / `--lichen-ink` / `--lichen-soft` | `#93AD84` / `#A9C39A` / `#1F271C` |
| `--flax` / `--flax-ink` / `--flax-soft` | `#E6D79A` / `#E6D79A` / `#2A261A` |
| `--clay` / `--clay-ink` / `--clay-soft` | `#C98670` / `#E0A08B` / `#2E1F1A` |
| `--tide` / `--tide-ink` / `--tide-soft` | `#86AEB3` / `#9CC2C6` / `#1A2729` |

In dark mode, the primary button uses `--heather` as its background and `--paper` as its text.

**Contrast rule (C-1):** Every text token on every background it is used on MUST meet WCAG 2.2 AA: 4.5:1 for body text, 3:1 for text ≥ 18.66 px bold or 24 px regular, and 3:1 for UI component boundaries and focus indicators. Test T-A11Y-3 computes every pair in code. If a pair fails, change the token, not the test.

### 2.4 Syntax highlighting (M and VBA)

| Token class | Light | Dark | Style |
|---|---|---|---|
| Keyword (`let in each if then else try otherwise error section shared type meta and or not` / VBA `Sub Function Dim If Then End …`) | `--heather` | `--heather` | weight 600 |
| Library function (`Table.SelectRows`, `Text.Upper`) | `--tide-ink` | `--tide-ink` | regular |
| Quoted identifier (`#"Changed Type"`) | `--ink-2` | `--ink-2` | regular |
| String | `--lichen-ink` | `--lichen-ink` | regular |
| Number, date literal (`#date(…)`) | `--clay-ink` | `--clay-ink` | regular |
| Comment | `--ink-3` | `--ink-3` | italic |
| Operator, punctuation | `--ink-2` | `--ink-2` | regular |
| Everything else | `--ink` | `--ink` | regular |

### 2.5 Typography

Fonts are self-hosted from `public/fonts/`. Quoin MUST NOT load fonts from any CDN (§3).

| Role | Family | Fallback stack |
|---|---|---|
| UI | Atkinson Hyperlegible Next (SIL OFL) | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` |
| Code and grid numbers | Commit Mono (SIL OFL) | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| Print preview (M5) | Carlito (SIL OFL, metric-compatible with Calibri), Caladea (Cambria-compatible), Liberation Sans/Serif (Arial/Times-compatible) | see §11 |

Use `font-display: swap` and subset to Latin + Latin Extended-A + punctuation (the full set of glyphs is acceptable if each file is under 60 KB).

Type scale (rem; the root is 16 px):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--t-xs` | 0.75 / 1rem | 500 | Badges, grid header type labels |
| `--t-sm` | 0.8125 / 1.25rem | 400 | Secondary UI, status bar |
| `--t-md` | 0.875 / 1.375rem | 400 | Default UI text |
| `--t-lg` | 1 / 1.5rem | 600 | Panel titles |
| `--t-xl` | 1.375 / 1.875rem | 600 | Empty-state title only |
| `--t-code` | 0.8125 / 1.375rem | 400 | Editor, grid cells |

### 2.6 Space, shape, depth, motion

- **Space scale (4 px base):** `--s-1: 4px`, `--s-2: 8px`, `--s-3: 12px`, `--s-4: 16px`, `--s-5: 24px`, `--s-6: 32px`, `--s-7: 48px`, `--s-8: 64px`. Every margin, padding, and gap MUST come from this scale. Test T-LINT-3 enforces this.
- **Radii:** `--r-sm: 6px` (badges, inputs, grid cells when focused), `--r-md: 10px` (buttons, menus), `--r-lg: 14px` (panels, cards), `--r-xl: 20px` (drop zone, dialogs), `--r-pill: 999px` (status dots, segmented controls).
- **Borders:** 1 px `--line`. Use no borders and shadows on the same element unless it floats.
- **Shadows:** Floating layers only (menus, dialogs, tooltips). Light: `0 1px 2px rgb(34 40 48 / .06), 0 8px 24px rgb(34 40 48 / .08)`. Dark: `0 1px 2px rgb(0 0 0 / .4), 0 8px 24px rgb(0 0 0 / .35)`.
- **Focus ring:** `outline: 2px solid var(--heather); outline-offset: 2px;` on `:focus-visible` only. Never remove focus visibility.
- **Motion:** 120 ms for hover and press, 180 ms for panel and dialog enter, with `cubic-bezier(.2,.7,.2,1)`. Animate opacity and transform only. Under `prefers-reduced-motion: reduce`, all durations are 0 ms. There are no spinners longer than necessary: a run shows a 2 px indeterminate Heather bar at the top of the result panel, and nothing else moves.
- **Hit targets:** at least 32×32 px on desktop and 44×44 px under `pointer: coarse`.

### 2.7 Voice and copy

Quoin is quiet. It states facts, uses sentence case and short sentences, does not use "please," "oops," "awesome," or exclamation marks, and does not narrate what it is about to do.

| Situation | Write | Never write |
|---|---|---|
| Empty state | `Drop an .xlsx or .xlsm file, or choose one.` | `Let's get started! 🎉` |
| Loaded | `4 queries · 3 modules` | `Great news! We found…` |
| Run finished | `1,204 rows · 0.31 s` | `Your query ran successfully!` |
| Run matches cache | `Matches the last Excel refresh` | `Perfect match!` |
| Run differs | `Differs from the last Excel refresh in 3 cells` | `Uh-oh…` |
| Unsupported function | `Web.Contents is not available offline. Map it to a local file.` | `Sorry, something went wrong.` |
| Refused file | `This workbook is encrypted. Remove the password in Excel first.` | `Invalid file.` |
| Unsaved changes | `You have unsaved edits. Leave anyway?` (native `beforeunload` only) | custom nagging modals |
| Download done | (nothing; the browser's download UI is enough) | toast |

Quoin does not use toasts. Status lives in one place: the status bar at the bottom (§10.2). Errors that block an action appear inline next to that action.

---

## 3. Privacy and security posture

### 3.1 Privacy guarantees (each is tested)

| ID | Guarantee | Test |
|---|---|---|
| PR-1 | File bytes never leave the tab. There is no upload, no server-side processing, and no `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`/`EventSource` with user data. | T-PRIV-1, T-PRIV-2 |
| PR-2 | No third-party requests of any kind: fonts, scripts, images, analytics, and error reporting are all same-origin. | T-PRIV-1 |
| PR-3 | Nothing is persisted by default: no `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or Cache API entries containing user data. The only persisted item is the theme preference (`localStorage["quoin.theme"]` = `"light" \| "dark" \| "system"`). | T-PRIV-3 |
| PR-4 | The service worker caches only the app's own static assets, which are listed explicitly in a build manifest. | T-PRIV-4 |
| PR-5 | Closing or reloading the tab discards everything. The UI says this once, in the footer of the empty state: `Files stay in this tab. Nothing is uploaded or stored.` | T-E2E-1 |
| PR-6 | Quoin never runs VBA, and it never evaluates M functions that touch the network or the filesystem without an explicit user-chosen file binding (§8.8). | T-SEC-6, T-M-CONN-* |

### 3.2 Content Security Policy

This policy is set in `index.html` as a `<meta http-equiv>` tag, and SHOULD also be set as a response header by the host:

```
default-src 'none';
script-src 'self';
worker-src 'self';
style-src 'self';
font-src 'self';
img-src 'self' blob: data:;
connect-src 'self';
manifest-src 'self';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
object-src 'none';
```

- Browsers ignore `frame-ancestors` in a `<meta>` tag, so the host MUST also send it as a header.
- `connect-src 'self'` exists only so the service worker can fetch its own assets. Application code MUST NOT call `fetch` at all, except in `sw.js`. Test T-LINT-4 greps for this.
- There is no `'unsafe-inline'` and no `'unsafe-eval'`. Quoin MUST NOT use `eval`, `new Function`, `setTimeout(string)`, or inline event handlers.
- Also set (host headers): `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`.

### 3.3 Threat model

| Threat | Mitigation | Test |
|---|---|---|
| Malicious workbook triggers XSS via a query name, module name, M string, or cell value | All untrusted text is rendered with `textContent` or `createTextNode`. `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` are banned (T-LINT-5). The syntax highlighter builds `<span>` nodes with DOM APIs. | T-SEC-1 |
| Zip bomb | Limits in §6.3: total uncompressed size, per-entry size, ratio, and entry count. Decompression is streamed with a running byte counter, and it aborts the moment a limit is crossed. | T-SEC-2 |
| XML entity expansion / XXE | Quoin rejects any XML part containing `<!DOCTYPE` or `<!ENTITY` before parsing. `DOMParser` does not fetch external entities, but this rejection is defence in depth. | T-SEC-3 |
| CFB loops and out-of-range sectors | Chain walks track visited sectors. Every index is bounds-checked, and chain length is capped at the sector count. | T-SEC-4 |
| Runaway M evaluation (infinite recursion, huge tables) | Evaluation happens in a dedicated Worker, with a wall-clock timeout (default 30 s, adjustable up to 300 s), a row cap per materialized table (default 1,000,000), a recursion depth cap (2,000), and a cancel button that calls `worker.terminate()`. | T-SEC-5 |
| VBA auto-run | Quoin never executes VBA. The downloaded workbook keeps its macros, and the download filename keeps `.xlsm`. Quoin never changes `.xlsm` to `.xlsx` while VBA is present. | T-SEC-6 |
| CSV formula injection in exports | When enabled (default: on), cells beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed with `'`. Numbers that are genuinely negative (typed as number) are not affected. | T-EXP-4 |
| Prototype pollution through record field names (`__proto__`) | M records are stored in `Map`, never in plain objects. JSON import uses a reviver that maps to `Map`. | T-SEC-7 |
| Filename injection on download | Download names are sanitized to `[\p{L}\p{N} ._()-]`, at most 120 characters, with the extension enforced. | T-SEC-8 |

---

## 4. Platform and technology

| ID | Requirement |
|---|---|
| TECH-1 | Plain JavaScript (ES2022 modules), HTML, and CSS. There is no framework, no runtime dependency, and no build step needed to run the app. |
| TECH-2 | Runs from any static file host over HTTPS, or from `localhost`. (`file://` is not supported, because module workers and service workers need an origin. The README states this.) |
| TECH-3 | Installable PWA with offline support after the first load. |
| TECH-4 | Supported browsers: Chrome/Edge ≥ 120, Firefox ≥ 120, Safari ≥ 17. The app needs `CompressionStream`/`DecompressionStream` with `"deflate-raw"`, module Workers, `TextDecoder` with legacy labels (`windows-1252` and others), `structuredClone`, and `Intl.Segmenter` (optional). |
| TECH-5 | Feature detection at startup. If a required API is missing, the empty state shows one line: `This browser is missing features Quoin needs. Use a current Chrome, Edge, Firefox, or Safari.` |
| TECH-6 | No source comments anywhere in shipped files (`.js`, `.css`, `.html`, `.svg`, `.webmanifest`). Names and structure carry the meaning. Test T-LINT-1 enforces this. Explanations live in this document and in `docs/`. |
| TECH-7 | Dev-only tooling is allowed in `devDependencies` and MUST NOT be shipped or imported by app code: Playwright, axe-core, and a JS tokenizer for the comment lint (for example, `acorn`). |
| TECH-8 | Code style: 2-space indentation, single quotes, semicolons, `const` by default, one exported concern per module, and pure functions in `src/core/**` (no DOM access). |

---

## 5. Project structure

```
quoin/
  index.html
  sw.js
  manifest.webmanifest
  public/
    favicon.svg
    mark.svg
    icon-192.png
    icon-512.png
    icon-maskable-512.png
    apple-touch-icon.png
    fonts/
      atkinson-hyperlegible-next-400.woff2
      atkinson-hyperlegible-next-600.woff2
      commit-mono-400.woff2
      carlito-400.woff2
      carlito-700.woff2
  styles/
    tokens.css
    base.css
    layout.css
    components.css
    editor.css
    grid.css
    print.css
  src/
    main.js
    app/
      state.js
      store.js
      router.js
      shortcuts.js
      download.js
      features.js
    ui/
      dom.js
      strings.js
      empty-state.js
      shell.js
      nav-list.js
      editor.js
      highlight-m.js
      highlight-vba.js
      grid.js
      result-panel.js
      bindings-dialog.js
      export-menu.js
      status-bar.js
      theme.js
      print-preview.js
    core/
      bytes.js
      crc32.js
      zip-read.js
      zip-write.js
      inflate.js
      xml.js
      opc.js
      workbook.js
      cells.js
      numfmt.js
      limits.js
      errors.js
      pq/
        datamashup.js
        section.js
        connections.js
        metadata.js
        writeback.js
      vba/
        cfb-read.js
        cfb-write.js
        ovba-compress.js
        ovba-decompress.js
        dir-stream.js
        project-stream.js
        codepages.js
        vba-project.js
        writeback.js
      m/
        lexer.js
        parser.js
        ast.js
        values.js
        types.js
        evaluator.js
        environment.js
        errors.js
        culture.js
        library/
          index.js
          core.js
          logical.js
          number.js
          text.js
          date.js
          duration.js
          list.js
          record.js
          table.js
          splitter.js
          combiner.js
          comparer.js
          replacer.js
          binary.js
          csv.js
          json.js
          excel.js
          value.js
          type.js
      export/
        csv.js
        json.js
        xlsx-writer.js
        code-files.js
        zip-bundle.js
      compare/
        cache-compare.js
      print/
        page-setup.js
        paginate.js
        render.js
    workers/
      m-worker.js
      parse-worker.js
  tests/
    unit/
    integration/
    e2e/
    fixtures/
      workbooks/
      expected/
      generators/
    run.html
    runner.js
  docs/
    observations.md
    m-coverage.md
    decisions.md
  README.md
  QUOIN_SPEC.md
  package.json
```

`package.json` holds dev scripts only:

```json
{
  "name": "quoin",
  "private": true,
  "type": "module",
  "scripts": {
    "serve": "npx --yes http-server -c-1 -p 5173 .",
    "test:unit": "node --test tests/unit",
    "test:browser": "playwright test tests/integration tests/e2e",
    "test:lint": "node tests/lint/run.js",
    "test": "npm run test:lint && npm run test:unit && npm run test:browser"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "axe-core": "^4.10.0",
    "acorn": "^8.12.0"
  }
}
```

Unit tests for `src/core/**` modules that do not need the DOM run under Node ≥ 20. Node provides `CompressionStream`, `DecompressionStream`, and `TextDecoder`, but not `DOMParser`. Any module that needs XML is tested in the browser runner, `tests/run.html`.

---

## 6. Container layer (ZIP / OPC)

### 6.1 ZIP reader — `core/zip-read.js`

API:

```
readZip(bytes: Uint8Array, limits: Limits) -> ZipArchive
ZipArchive.entries: ZipEntry[]          (in central-directory order)
ZipArchive.get(name: string) -> ZipEntry | undefined
ZipEntry: { name, method, crc32, compressedSize, uncompressedSize, localHeaderOffset, flags, extra, comment, rawCompressed(): Uint8Array, read(): Promise<Uint8Array> }
```

Requirements:

| ID | Requirement |
|---|---|
| Z-1 | Locate the End of Central Directory (`0x06054b50`) by scanning backwards from the end, at most 65,557 bytes. Support the ZIP64 EOCD locator (`0x07064b50`) and record (`0x06064b50`). |
| Z-2 | Parse entries from the central directory (`0x02014b50`). Use the local header (`0x04034b50`) only to find where the data starts (`30 + nameLen + extraLen`). Never trust local-header sizes when bit 3 (data descriptor) is set. |
| Z-3 | Supported methods: 0 (stored) and 8 (deflate). Any other method gives `QuoinError('zip.method', …)`. |
| Z-4 | Encrypted entries (flag bit 0) give `QuoinError('zip.encrypted')`. |
| Z-5 | Filenames: decode as UTF-8 if flag bit 11 is set, otherwise as CP437 (implement the table). Normalize `\` to `/`, and reject names containing `..` segments, absolute paths, or NUL characters. |
| Z-6 | Verify the CRC-32 of every entry that is read. A mismatch gives `QuoinError('zip.crc', name)`. |
| Z-7 | Reject duplicate entry names (case-insensitive, because OPC part names are case-insensitive). |
| Z-8 | Inflate with `DecompressionStream('deflate-raw')`, streaming chunks into a growing buffer and enforcing limits (§6.3) on every chunk. |

### 6.2 Format detection — `core/workbook.js`

Detect the format before anything else, using the first 8 bytes and then the package content:

| Input | Detection | Result |
|---|---|---|
| Starts with `D0 CF 11 E0 A1 B1 1A E1` and the CFB contains `EncryptionInfo` + `EncryptedPackage` | Encrypted OOXML | Refuse: `This workbook is encrypted. Remove the password in Excel first.` |
| Starts with `D0 CF 11 E0…` and contains `Workbook` or `Book` | Legacy `.xls` | Refuse: `Legacy .xls files are not supported. Save as .xlsx or .xlsm in Excel.` |
| ZIP with `xl/workbook.bin` | `.xlsb` | Refuse: `Binary workbooks (.xlsb) are not supported.` |
| ZIP whose workbook part uses `http://purl.oclc.org/ooxml/spreadsheetml/main` | Strict OOXML | Refuse: `Strict Open XML workbooks are not supported.` |
| ZIP with `content.xml` + `mimetype` = `application/vnd.oasis.opendocument.spreadsheet` | ODS | Refuse: `OpenDocument spreadsheets are not supported.` |
| ZIP with `[Content_Types].xml` and an officeDocument relationship pointing to a SpreadsheetML workbook | `.xlsx` / `.xlsm` / `.xltx` / `.xltm` | Accept |
| Anything else | — | Refuse: `This is not an Excel workbook.` |

Determine the format from content, never from the file extension. Show a warning (not a refusal) when the extension and the content disagree, for example a `.xlsx` that contains `vbaProject.bin`: `This file contains macros but is named .xlsx. It will be saved as .xlsm.`

### 6.3 Limits — `core/limits.js`

| Limit | Default | Notes |
|---|---|---|
| Max input file size | 200 MB | Checked before reading. |
| Max ZIP entries | 20,000 | |
| Max uncompressed size, total | 1 GB | |
| Max uncompressed size, per entry | 512 MB | |
| Max compression ratio, per entry | 200:1, applied only when uncompressed size > 10 MB | Zip-bomb guard. |
| Max CFB sectors | 2^20 | |
| Max XML part size parsed into DOM | 64 MB | Larger sheet XML is parsed with a streaming tokenizer (§6.6). |
| Max M recursion depth | 2,000 | |
| Max rows per materialized M table | 1,000,000 | Configurable in Settings up to 5,000,000. |
| M wall-clock timeout | 30 s | Configurable from 5 to 300 s. |

Every limit violation gives a `QuoinError` with a code and one human sentence. Limits are passed in explicitly (there are no globals), so tests can lower them.

### 6.4 ZIP writer — `core/zip-write.js`

```
writeZip(entries: Array<{ name, data?: Uint8Array, raw?: { method, crc32, compressedSize, uncompressedSize, bytes } , modified?: Date }>) -> Uint8Array
```

| ID | Requirement |
|---|---|
| ZW-1 | Untouched entries are copied **byte-for-byte** from their original compressed data (`raw`), with the same method and the same CRC. Quoin never re-inflates and re-deflates parts it did not change. |
| ZW-2 | Changed entries are deflated with `CompressionStream('deflate-raw')`. If deflate does not shrink the data, the entry is stored instead. |
| ZW-3 | Entry order is preserved, and `[Content_Types].xml` stays first. |
| ZW-4 | No data descriptors, no encryption, and no ZIP64 unless the output is over 4 GB (which cannot happen given the limits). |
| ZW-5 | Set general-purpose bit 11 (UTF-8 names) when a name contains non-ASCII characters. |
| ZW-6 | Timestamps: keep the original for untouched entries. Use the current local time in DOS format for changed entries. |
| ZW-7 | Writing a ZIP read from file F without any modifications must produce entries with byte-identical names, compressed data, and CRCs (test T-ZIP-RT-1). |

### 6.5 OPC helpers — `core/opc.js`

- Parse `[Content_Types].xml` (Default and Override).
- Parse `_rels/.rels` and `xl/_rels/workbook.xml.rels`, resolving targets relative to the source part. Handle absolute targets (`/xl/...`) and `TargetMode="External"` (record these, but never follow them).
- Provide `addPart`, `removePart`, `setOverride`, and `removeRelationship`, used by VBA signature removal (§9.6).

### 6.6 XML — `core/xml.js`

- `parseXml(text)`: reject DOCTYPE and ENTITY declarations (T-SEC-3), then `new DOMParser().parseFromString(text, 'application/xml')`. If the result contains `parsererror`, raise `QuoinError('xml.parse', partName)`.
- `serializeXml(doc)`: `XMLSerializer`, then make sure the original XML declaration is preserved exactly. Tests verify that namespaces, `mc:Ignorable`, and `xml:space="preserve"` survive.
- **Minimal edit rule:** when changing an attribute in a large part (such as `connections.xml`), use DOM editing on that part only, and leave every other part untouched (ZW-1).
- `streamSheetCells(text, onCell)`: a small forward-only tokenizer for `<sheetData>`, used for large sheets in `Excel.CurrentWorkbook` and cache comparison.
- Text encodings: detect a BOM (UTF-8, UTF-16LE, UTF-16BE) and the `encoding=` attribute. When writing back, re-encode with the **same** encoding and BOM. This matters for `customXml/itemN.xml`, which Excel usually writes as UTF-16LE with a BOM.

---

## 7. Power Query layer

### 7.1 Where queries live

1. `customXml/item{n}.xml` contains `<DataMashup xmlns="http://schemas.microsoft.com/DataMashup">BASE64</DataMashup>`. Identify the item by **namespace**, never by item number. There may be other customXml items, and the root may carry attributes such as `sqmid`. Preserve those attributes.
2. The base64 decodes to the binary **DataMashup** stream described in [MS-QDEFF] §2.
3. `xl/connections.xml` holds one `<connection>` per loaded query, with `<dbPr connection="Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=QueryName;…" command="SELECT * FROM [QueryName]"/>`. The Location value may be quoted: `Location="My Query"`.
4. `xl/queryTables/queryTable{n}.xml` together with `xl/tables/table{n}.xml` (`tableType="queryTable"`) link a connection (`connectionId`) to a table on a sheet. The table's cells are Excel's **cached result**.
5. `xl/model/item.data` is present when queries load to the Data Model. Quoin does not parse it. It only marks those queries `Loaded to Data Model`, and cache comparison is unavailable for them.
6. Legacy Excel 2010/2013 Power Query add-in workbooks embed the mashup inside the connection string (`Mashup=` / `Location=`) and have no DataMashup customXml. Detect this case and show the queries **read-only** with the note `Saved by the Power Query add-in for Excel 2010/2013. Editing is not supported.` (**VERIFY** with a fixture if one can be obtained. If none can be obtained, treat these as "no queries found" with that note.)

### 7.2 DataMashup binary — `core/pq/datamashup.js`

All integers are little-endian unsigned 32-bit.

```
offset  field
0       Version                    MUST be 0
4       PackagePartsLength  (n1)
8       PackageParts        [n1]    OPC ZIP: /[Content_Types].xml, /Config/Package.xml, /Formulas/Section1.m
8+n1    PermissionsLength   (n2)
...     Permissions         [n2]    UTF-8 XML
...     MetadataLength      (n3)
...     Metadata            [n3]    see below
...     PermissionBindingsLength (n4)
...     PermissionBindings  [n4]    opaque, DPAPI-protected; preserved as-is
```

Metadata:

```
0       Version             MUST be 0
4       MetadataXmlLength   (m1)
8       MetadataXml         [m1]    UTF-8 (may carry BOM) <LocalPackageMetadataFile>
8+m1    ContentLength       (m2)
...     Content             [m2]    OPC ZIP (often empty or small)
```

| ID | Requirement |
|---|---|
| DM-1 | Validate that every length fits inside the buffer. The sum must equal the total length exactly. Trailing bytes give `QuoinError('pq.trailing')`. |
| DM-2 | `parseDataMashup(bytes) -> { version, packageParts: ZipArchive, permissionsXml: string, metadata: { version, xml: string, content: Uint8Array }, permissionBindings: Uint8Array, raw: { permissions: Uint8Array, metadata: Uint8Array } }` |
| DM-3 | `buildDataMashup(model) -> Uint8Array` reassembles the structure. When nothing changed, the output is **byte-identical** to the input (T-PQ-RT-1). To guarantee this, keep the raw bytes of every section and reuse them unless that section was edited. |
| DM-4 | Inner package write: use ZW-1…ZW-6 rules. Only `/Formulas/Section1.m` changes for code edits. **VERIFY** that Excel accepts the inner ZIP rewritten by Quoin: save the file, open it in Excel 365 for Windows, refresh all, and confirm there is no repair prompt (manual test MX-2). |

### 7.3 Section document — `core/pq/section.js`

`Section1.m` looks like:

```
section Section1;

shared Sales = let
    Source = Excel.CurrentWorkbook(){[Name="tblSales"]}[Content],
    #"Changed Type" = Table.TransformColumnTypes(Source,{{"Amount", type number}})
in
    #"Changed Type";

shared #"Top Customers" = let ... in ...;
```

| ID | Requirement |
|---|---|
| SEC-1 | Split the section into members **with the M lexer** (§8.1), never with regular expressions. Comments, strings, and `#"…"` identifiers may contain `;` and `shared`. |
| SEC-2 | For each member, record `{ name, nameSpan, exprSpan, leadingTrivia, trailingTrivia, attributes }`. `[ Description = "…" ] shared Q = …;` (member attributes) must be preserved. |
| SEC-3 | Editing one query replaces only that member's expression span. Every other byte of the section text stays identical (T-PQ-EDIT-2). |
| SEC-4 | The editor shows only the member's expression (the text after `shared Name =` and before the final `;`). This matches what Excel's Advanced Editor shows. |
| SEC-5 | Before writeback, the whole section must lex and parse without errors. If it does not, the Download button stays disabled for that query, and the inline error shows line and column. |
| SEC-6 | Line endings: detect the dominant ending (CRLF from Excel) and preserve it. Edits made in the editor (LF) are converted back on writeback. |
| SEC-7 | Unicode: normalize nothing. Keep exact code points. |

Renaming, adding, and deleting queries are **out of scope for v1** (§17), because they require coordinated changes in metadata, connections, query tables, and dependants.

### 7.4 Metadata and load targets — `core/pq/metadata.js`, `core/pq/connections.js`

From `LocalPackageMetadataFile` → `Items/Item`, where `ItemLocation/ItemType = Formula` and `ItemPath = Section1/<url-encoded name>`, read these `StableEntries`:

- `FillEnabled`, `FillToDataModelEnabled`, `FillTarget`, `ResultType`, `FillLastUpdated`, `FillCount`, `FillColumnNames`, `FillColumnTypes`, `IsPrivate`, `NavigationStepName`, `LoadedToAnalysisServices`, `QueryGroupID`.
- Query groups come from `AllFormulas/QueryGroups` (if present), and are shown as collapsible folders in the nav.

Entry values carry a type prefix: `l1` (long), `s…` (string), `d…` (datetime), `b…`. Implement `decodeEntryValue` for the observed prefixes. Unknown prefixes are preserved and shown raw.

Derive the load kind per query:

| Condition | Badge |
|---|---|
| `FillEnabled = 1` and a matching connection plus queryTable | `Table · Sheet1!A1:D200` |
| `FillToDataModelEnabled = 1` or `LoadedToAnalysisServices = 1` | `Data Model` |
| Neither | `Connection only` |

### 7.5 Writeback — `core/pq/writeback.js`

Steps, all in memory:

1. Rebuild `Section1.m` with the edited spans (SEC-3, SEC-6).
2. Rebuild the inner package ZIP (copy the other parts raw).
3. Rebuild the DataMashup with the **original** Permissions, Metadata, and PermissionBindings bytes.
4. Base64-encode the result (standard alphabet, no line breaks, unless the original used line breaks; in that case mirror the original line length).
5. Re-serialize `customXml/itemN.xml` in its original encoding and BOM, with the root attributes preserved.
6. Optional (checkbox in the download menu, default **on** when any query was edited): set `refreshOnLoad="1"` on the affected `<connection>` elements, so Excel refreshes the cached table the next time the file is opened. Tooltip: `Excel will refresh these queries when the file opens.`
7. Write the outer ZIP with ZW rules. Only the customXml item (and `connections.xml` if step 6 applies) are re-encoded.

Permission bindings: [MS-QDEFF] describes PermissionBindings as a protected checksum over the package parts and permissions. When it fails to validate, Excel ignores the stored Permissions and uses defaults. **VERIFY** (MX-3) and record the result:

- Does Excel show a repair prompt? (Expected: no.)
- Do the queries load and refresh? (Expected: yes.)
- Is a privacy-level or "native database query" prompt shown again? (Possible. This is acceptable and is documented in the README.)

If MX-3 shows that Excel rejects the file, the fallback is to write `PermissionBindingsLength = 0` and test again. Record which approach worked in `docs/observations.md` and `docs/decisions.md`.

The cached table data is **not** rewritten in v1. This is stated in the download menu: `Cached tables keep their old values until Excel refreshes.`

---

## 8. M evaluation engine

The engine runs in `workers/m-worker.js`. The main thread sends `{ type: 'run', sectionText, queryName, workbookSnapshot, bindings, culture, limits }` and receives `progress` (row counts only), `result`, or `error` messages. Results are transferred as columnar typed arrays where possible.

### 8.1 Lexer — `core/m/lexer.js`

Follow the *Power Query M language specification, Lexical Structure*:

- Whitespace and newlines (including U+2028/U+2029); comments `//…` and `/* … */` (not nested).
- Identifiers: regular identifiers (letters, digits, `_`, and `.` between parts, as in `Table.SelectRows`); quoted identifiers `#"…"` with `""` escapes; generalized identifiers inside `[ ]` field access (they may contain spaces).
- Keywords: `and as each else error false if in is let meta not null or otherwise section shared then true try type #binary #date #datetime #datetimezone #duration #infinity #nan #sections #shared #table #time`. Also `catch` (newer M versions; **VERIFY** against current Excel).
- Literals: numbers (decimal, exponent, hex `0x`), text `"…"` with `""` escape and `#(cr)`, `#(lf)`, `#(tab)`, `#(XXXX)`, `#(XXXXXXXX)`, `#(#)` escapes.
- Operators and punctuators: `= < > <= >= <> + - * / & ( ) [ ] { } @ ! ? ?? , ; => .. ...`.
- Every token carries `{ kind, value, start, end, line, col }`. The lexer is total: unknown characters produce an `error` token. It never throws, so the editor can highlight partial code.

### 8.2 Parser — `core/m/parser.js`

Recursive descent with operator precedence matching the spec (from lowest to highest): `meta`; `or`; `and`; `as`/`is` (type assertion); `= <>`; `< > <= >=`; `&` with `+ -`; `* /`; unary `+ - not`; then primary (field access `[x]`, `[x]?`, item access `{n}`, `{n}?`, invocation `()`, and implicit field access `[x]` inside `each`).

AST node types: `Section`, `SectionMember`, `Let`, `If`, `Each`, `Function` (with typed and optional params), `Invoke`, `FieldAccess`, `FieldProjection` (`[[a],[b]]`), `ItemAccess`, `Record`, `List` (with `..` ranges), `Binary`, `Unary`, `Literal`, `Identifier` (with `@` inclusive scope), `Try` (`otherwise` / `catch`), `Error`, `TypeExpr` (`type table [A = number]`, `type {number}`, `type nullable text`, `type function (...) as ...`), `Meta`, `NotImplemented` (`...`).

Error recovery: report the first error with a span and message. The editor shows a squiggle and a gutter dot. Messages are plain: `Expected "in" after let bindings.`

### 8.3 Values — `core/m/values.js`

| M kind | JS representation |
|---|---|
| null | `null` |
| logical | `boolean` |
| number | `number` (double). Keep `-0`, `NaN` (`#nan`), and `±Infinity`. |
| text | `string` |
| date | `{ k:'date', days }` (days since 0001-01-01, proleptic Gregorian) |
| time | `{ k:'time', ticks }` (100 ns ticks since midnight) |
| datetime | `{ k:'datetime', ticks }` |
| datetimezone | `{ k:'dtz', ticks, offsetMin }` |
| duration | `{ k:'duration', ticks }` (signed BigInt when \|ticks\| > 2^53) |
| binary | `{ k:'binary', bytes: Uint8Array }` |
| list | `MList` (lazy; backed by an array or a generator, with memoized materialization) |
| record | `MRecord` (ordered `Map<string, Thunk>`) |
| table | `MTable` (`columns: string[]`, `types: MType[]`, column-major arrays, `keys`, lazily streamed operators where possible) |
| function | `MFunction` (`params`, `returnType`, `invoke(args)`) |
| type | `MType` |
| error | thrown `MError { reason, message, detail }`, caught by `try` |

Laziness: `let` bindings, record fields, and list items are thunks. Errors in unused bindings must not surface (test T-M-LAZY-1).

### 8.4 Semantics checklist (each item has a unit test)

- Null propagation: `null + 1 = null`, `null & "a" = null`, `null = null` is `true`, `null < 1` is `null`, `null and false` is `false`, `null or true` is `true`.
- `&` concatenates text, lists, records (merge, right wins), and tables (union by column name).
- `+` and `-` on date, datetime, or time with duration; `date - date = duration`; `date & time = datetime`.
- Number equality uses IEEE semantics, except that `#nan = #nan` is `false`.
- Comparison of mixed kinds with `<` raises `Expression.Error` (equality returns `false`).
- `[a]` access to a missing field raises `Expression.Error: The field 'a' of the record wasn't found.` `[a]?` returns `null`.
- `{n}` out of range raises an error; `{n}?` returns `null`.
- Table row access `t{0}`, `t{[Key="x"]}` (exactly one match, otherwise an error), and column access `t[Col]` returns a list.
- `each expr` is `(_) => expr`, and `[Col]` inside it is `_[Col]`.
- `try x` returns `[HasError=false, Value=x]` or `[HasError=true, Error=[Reason, Message, Detail]]`. `try x otherwise y`.
- `error "msg"` and `error [Reason=…, Message=…]`.
- `x as type` checks primitive conformance, and `x is type` returns logical.
- `@` for recursive references inside `let`.
- `meta` attaches metadata. `Value.Metadata` reads it, and evaluation otherwise ignores it.
- `#shared` returns a record of the library. `#sections` returns a record containing Section1.
- Section members reference each other by name, either bare or as `Section1!Name`.

### 8.5 Culture and number formatting — `core/m/culture.js`

- The default culture is `en-US`. The user can change the culture used for a run (Settings → `Culture`), from a list built with `Intl.supportedValuesOf` plus the explicit cultures used in fixtures.
- `Number.FromText`, `Date.FromText`, `DateTime.FromText`, and `Value.FromText` use the given culture. Implement decimal and group separators and date order using `Intl.NumberFormat`/`Intl.DateTimeFormat` `formatToParts` to discover the patterns.
- `Number.ToText(n, format, culture)` supports the formats `G`, `N`, `F`, `D`, `P`, `E`, `X`, and `0.00`-style custom formats. `G` matches .NET round-trip-ish output. **VERIFY** the edge cases (`0.1+0.2`, `1e21`, `-0`) against Excel fixture F-M-NUM.
- Rounding mode for `Int64.Type` conversion and `Number.Round` default: **VERIFY** using fixture F-M-ROUND, which is generated in Excel. Do not assume banker's rounding or away-from-zero until it is observed. `Number.Round(x, d, RoundingMode.*)` must implement all five modes explicitly.

### 8.6 Library coverage (v1)

Tier A must be complete for v1. Tier B should be completed in v1. Tier C is later. Every function must match its documented signature, including optional parameters. `docs/m-coverage.md` is generated from `library/index.js` and lists each function with its status.

**Tier A**

- *Excel/Source:* `Excel.CurrentWorkbook`, `Excel.Workbook` (binary from a binding; `useHeaders`; `delayTypes` is ignored), `Csv.Document` (Delimiter, Columns, Encoding 65001/1252/1200, QuoteStyle `QuoteStyle.Csv`/`None`), `Json.Document`, `File.Contents` (binding only), `Web.Contents` (binding only), `Binary.Buffer`, `Lines.FromBinary`, `Text.FromBinary`, `Binary.FromText`, `#table`.
- *Table:* `Table.PromoteHeaders`, `Table.DemoteHeaders`, `Table.TransformColumnTypes`, `Table.SelectRows`, `Table.SelectColumns`, `Table.RemoveColumns`, `Table.RenameColumns`, `Table.ReorderColumns`, `Table.AddColumn`, `Table.AddIndexColumn`, `Table.DuplicateColumn`, `Table.TransformColumns`, `Table.ReplaceValue`, `Table.Sort`, `Table.Distinct`, `Table.FirstN`, `Table.LastN`, `Table.Skip`, `Table.RemoveFirstN`, `Table.RemoveLastN`, `Table.Range`, `Table.Group` (with `GroupKind.Global`/`Local`), `Table.NestedJoin`, `Table.Join`, `Table.ExpandTableColumn`, `Table.ExpandRecordColumn`, `Table.ExpandListColumn`, `Table.Combine`, `Table.UnpivotOtherColumns`, `Table.Unpivot`, `Table.Pivot`, `Table.FillDown`, `Table.FillUp`, `Table.SplitColumn`, `Table.CombineColumns`, `Table.RemoveRowsWithErrors`, `Table.ReplaceErrorValues`, `Table.SelectRowsWithErrors`, `Table.RowCount`, `Table.ColumnCount`, `Table.ColumnNames`, `Table.Column`, `Table.ToRows`, `Table.FromRows`, `Table.ToRecords`, `Table.FromRecords`, `Table.FromList`, `Table.FromColumns`, `Table.ToColumns`, `Table.Transpose`, `Table.Buffer`, `Table.IsEmpty`, `Table.First`, `Table.Last`, `Table.Max`, `Table.Min`, `Table.Contains`, `Table.MatchesAnyRows`, `Table.MatchesAllRows`, `Table.TransformRows`, `Table.Schema` (subset), `Table.Profile` (subset), `Table.Keys`, `Table.AddKey`.
- *List:* `List.Sum`, `List.Average`, `List.Min`, `List.Max`, `List.Count`, `List.Distinct`, `List.Sort`, `List.Select`, `List.Transform`, `List.Accumulate`, `List.Generate`, `List.Combine`, `List.Zip`, `List.First`, `List.Last`, `List.FirstN`, `List.LastN`, `List.Skip`, `List.Range`, `List.Contains`, `List.ContainsAny`, `List.ContainsAll`, `List.PositionOf`, `List.Positions`, `List.Numbers`, `List.Dates`, `List.Reverse`, `List.RemoveNulls`, `List.RemoveItems`, `List.ReplaceValue`, `List.Union`, `List.Intersect`, `List.Difference`, `List.IsEmpty`, `List.Buffer`, `List.MatchesAll`, `List.MatchesAny`, `List.Median`, `List.Mode`, `List.Product`, `List.StandardDeviation`, `List.Split`, `List.Single`, `List.SingleOrDefault`.
- *Text:* `Text.Upper`, `Text.Lower`, `Text.Proper`, `Text.Trim`, `Text.TrimStart`, `Text.TrimEnd`, `Text.Clean`, `Text.Length`, `Text.Start`, `Text.End`, `Text.Middle`, `Text.Range`, `Text.Contains`, `Text.StartsWith`, `Text.EndsWith`, `Text.PositionOf`, `Text.Replace`, `Text.Remove`, `Text.Select`, `Text.Split`, `Text.Combine`, `Text.PadStart`, `Text.PadEnd`, `Text.From`, `Text.Format`, `Text.BeforeDelimiter`, `Text.AfterDelimiter`, `Text.BetweenDelimiters`, `Text.Insert`, `Text.Repeat`, `Text.Reverse`, `Text.ToList`, `Character.FromNumber`, `Character.ToNumber`.
- *Number:* `Number.From`, `Number.FromText`, `Number.ToText`, `Number.Round`, `Number.RoundUp`, `Number.RoundDown`, `Number.RoundTowardZero`, `Number.RoundAwayFromZero`, `Number.Abs`, `Number.Mod`, `Number.IntegerDivide`, `Number.Power`, `Number.Sqrt`, `Number.Sign`, `Number.IsNaN`, `Number.IsEven`, `Number.IsOdd`, `Number.Exp`, `Number.Ln`, `Number.Log10`, `Int64.From`, `Decimal.From`, `Currency.From`, `Percentage.From`.
- *Date/Time:* `Date.From`, `Date.FromText`, `Date.ToText`, `Date.Year`, `Date.Month`, `Date.Day`, `Date.DayOfWeek`, `Date.DayOfYear`, `Date.WeekOfYear`, `Date.AddDays`, `Date.AddMonths`, `Date.AddYears`, `Date.StartOfMonth`, `Date.EndOfMonth`, `Date.StartOfYear`, `Date.EndOfYear`, `Date.StartOfWeek`, `Date.EndOfWeek`, `Date.StartOfQuarter`, `Date.QuarterOfYear`, `Date.MonthName`, `Date.DayOfWeekName`, `Date.IsInPreviousNDays` (with `DateTime.LocalNow` captured once per run), `DateTime.From`, `DateTime.FromText`, `DateTime.ToText`, `DateTime.Date`, `DateTime.Time`, `DateTime.LocalNow`, `DateTime.FixedLocalNow`, `DateTimeZone.*` (From, ToLocal, SwitchZone, UtcNow), `Time.From`, `Time.Hour`, `Time.Minute`, `Time.Second`, `Duration.From`, `Duration.Days`, `Duration.Hours`, `Duration.Minutes`, `Duration.Seconds`, `Duration.TotalDays`, `Duration.TotalHours`, `Duration.TotalMinutes`, `Duration.TotalSeconds`, `#date`, `#time`, `#datetime`, `#datetimezone`, `#duration`.
- *Record:* `Record.Field`, `Record.FieldOrDefault`, `Record.FieldNames`, `Record.FieldValues`, `Record.HasFields`, `Record.AddField`, `Record.RemoveFields`, `Record.RenameFields`, `Record.SelectFields`, `Record.TransformFields`, `Record.Combine`, `Record.FromList`, `Record.ToList`, `Record.ToTable`, `Record.FromTable`.
- *Splitter/Combiner/Comparer/Replacer:* `Splitter.SplitTextByDelimiter`, `Splitter.SplitTextByEachDelimiter`, `Splitter.SplitTextByAnyDelimiter`, `Splitter.SplitTextByPositions`, `Splitter.SplitTextByLengths`, `Splitter.SplitTextByCharacterTransition`, `Combiner.CombineTextByDelimiter`, `Comparer.Ordinal`, `Comparer.OrdinalIgnoreCase`, `Comparer.FromCulture`, `Replacer.ReplaceText`, `Replacer.ReplaceValue`.
- *Value/Type/Logical:* `Value.Is`, `Value.Type`, `Value.Equals`, `Value.Compare`, `Value.ReplaceType`, `Value.FromText`, `Value.Metadata`, `Value.RemoveMetadata`, `Logical.From`, `Logical.FromText`, `Logical.ToText`, `Type.Is`, `Type.ListItem`, `Type.TableSchema` (subset), and the type constants `Int64.Type`, `Int32.Type`, `Int16.Type`, `Int8.Type`, `Byte.Type`, `Single.Type`, `Double.Type`, `Decimal.Type`, `Currency.Type`, `Percentage.Type`, `Text.Type`, `Date.Type`, `DateTime.Type`, `Time.Type`, `Duration.Type`, `Logical.Type`, `Any.Type`.
- *Enums:* `Order.Ascending`/`Descending`, `JoinKind.*`, `MissingField.Error`/`Ignore`/`UseNull`, `ExtraValues.*`, `QuoteStyle.*`, `RoundingMode.*`, `Occurrence.*`, `GroupKind.*`, `JoinAlgorithm.*` (accepted and ignored), `Culture.Current`.

**Tier B:** `Table.Partition`, `Table.InsertRows`, `Table.RemoveMatchingRows`, `Table.ReplaceRows`, `Table.FuzzyNestedJoin` (refuses with a clear error), `Text.Combine` with null-skipping parity, `List.Percentile`, `Number.Random*` (seeded per run, and the result is marked `non-deterministic`), `Table.SplitColumn` with `Splitter.SplitTextByRepeatedLengths`, `Expression.Evaluate` (limited to `#shared`, never JS eval), `Function.Invoke`, `Diagnostics.Trace` (no-op passthrough).

**Tier C (explicitly unsupported in v1; each raises `Quoin.Unsupported` with the function name):** every connector except those listed above (`Sql.Database`, `Odbc.*`, `OData.Feed`, `SharePoint.*`, `Folder.Files`, `Web.Page`, `Pdf.Tables`, `Xml.Tables`, `AnalysisServices.*`, …), `Cube.*`, `Value.NativeQuery`, `Html.Table`, and R/Python scripts.

### 8.7 `Excel.CurrentWorkbook()` — `core/cells.js`, `core/numfmt.js`

Returns a table with the columns `Content` and `Name`, containing one row per Excel table (`xl/tables/*.xml`, `displayName`) and per workbook-scoped defined name that resolves to a single rectangular range. Excel orders these rows in a specific way: **VERIFY** the order with fixture F-PQ-CW and match it.

Each `Content` table:

- Takes its columns from the table header row (`tableColumns/@name`) or, for named ranges, uses `Column1…ColumnN`.
- Excludes the totals row.
- Converts cell values like this: shared strings (including rich-text runs concatenated), inline strings, `t="str"` formula results (the cached `<v>` only; Quoin never evaluates formulas), booleans, errors (as M error values in cells: `[Reason="DataFormat.Error"…]` **VERIFY** the reason Excel gives for `#N/A` and `#DIV/0!`), and numbers.
- Applies number formats: a cell whose effective `numFmtId` is a built-in date/time format (14–22, 45–47) or a custom format containing unquoted, unescaped `y m d h s` tokens (excluding `[h]`-only elapsed formats, which map to duration) becomes `datetime`. **VERIFY** whether Excel.CurrentWorkbook returns `datetime` or `date` for date-only formats (F-PQ-CW-DATES).
- Respects `workbookPr/@date1904`.
- Leaves column types as `any`, matching Excel. (The user's `TransformColumnTypes` step assigns types.)

A query that references a table **loaded from another query** reads that table's cached cells by default. The run panel offers a toggle: `Use upstream query results instead of cached cells`. When it is on, Quoin evaluates the upstream query first.

### 8.8 Source bindings (offline replacements for external sources) — `ui/bindings-dialog.js`

When evaluation reaches `File.Contents(path)`, `Web.Contents(url, options?)`, or `Excel.Workbook(File.Contents(…))`, the worker pauses and posts `{ type:'need-binding', kind, key }`, where `key` is the literal path or URL (plus the `RelativePath` and `Query` options for Web.Contents, canonicalized).

The main thread opens a small dialog:

```
File.Contents
C:\Data\sales_2026.csv
[ Choose a local file ]   [ Skip ]
```

- When the user chooses a file, its bytes are sent to the worker and memoized for this tab session only. The mapping `key → file name` is shown in the run panel under `Sources`, and each mapping can be cleared.
- **Skip** raises `DataSource.Error: No local file was chosen for C:\Data\sales_2026.csv.`
- Quoin never fetches the URL. The dialog text for Web.Contents adds one line: `Quoin does not connect to the internet. Choose a saved copy of this response.`
- Folder-level sources (`Folder.Files`) are Tier C.

### 8.9 Result model and compare — `core/compare/cache-compare.js`

The `result` message contains: `columns`, `types`, `rowCount`, column data, `durationMs`, `warnings` (for example, `non-deterministic`, `culture-sensitive parse used en-US`), and `steps` (the names of the `let` bindings of the top-level expression, in order).

**Step preview:** clicking a step name in the run panel re-runs the query up to that binding. (Evaluate the `let` with its `in` replaced by the step identifier.) This mirrors Excel's Applied Steps view. It is read-only.

**Compare with cache (P-5):** for queries loaded to a sheet table, read the cached table cells (§8.7 conversion) and compare them with the result:

- Column names must match exactly, in order.
- Row count must match.
- Cells are compared by type. Numbers are equal when `|a−b| ≤ 1e-9·max(1,|a|,|b|)`. Text is equal by exact code points. Datetimes are equal when within 1 second (Excel stores doubles). Null is equal to an empty cell.
- The output is `Matches the last Excel refresh`, or `Differs in N cells`, with an option to highlight the differing cells in the grid using `--clay-soft` backgrounds and a `--clay` 2 px left inset.
- When the query result depends on `DateTime.LocalNow` or `Number.Random*`, compare is disabled with the note `Result depends on the current time.` or `Result is random.`

---

## 9. VBA layer

### 9.1 Where VBA lives

`xl/vbaProject.bin`, reached through the workbook relationship of type `http://schemas.microsoft.com/office/2006/relationships/vbaProject`, with content type `application/vnd.ms-office.vbaProject`. Signatures, when present, are in `xl/vbaProjectSignature.bin`, `xl/vbaProjectSignatureAgile.bin`, and `xl/vbaProjectSignatureV3.bin`, each with its own relationship and content type.

### 9.2 CFB reader — `core/vba/cfb-read.js` ([MS-CFB])

| ID | Requirement |
|---|---|
| CFB-1 | Header: signature `D0 CF 11 E0 A1 B1 1A E1`, minor version `0x003E`, major version 3 (512-byte sectors, shift 9) or 4 (4096-byte sectors, shift 12), byte order `0xFFFE`, mini sector shift 6, mini stream cutoff 4096. Anything else gives `QuoinError('cfb.header')`. |
| CFB-2 | Build the FAT from the 109 header DIFAT entries plus the DIFAT chain. Special values: `FREESECT 0xFFFFFFFF`, `ENDOFCHAIN 0xFFFFFFFE`, `FATSECT 0xFFFFFFFD`, `DIFSECT 0xFFFFFFFC`. |
| CFB-3 | The directory is 128-byte entries: name (UTF-16LE, 64 bytes), name length in bytes including the terminator, object type (0 unused, 1 storage, 2 stream, 5 root), colour, left/right sibling IDs, child ID, CLSID, state bits, creation and modified FILETIMEs, start sector, and stream size (in v3, use the low 32 bits only). |
| CFB-4 | Streams smaller than 4096 bytes (other than the root) live in the mini stream (the root entry's data), addressed through the MiniFAT. |
| CFB-5 | Walk the tree from the root's child through left, right, and child pointers, with a visited set. Produce `{ path: 'VBA/dir', type, data, clsid, stateBits, created, modified }`. |
| CFB-6 | Every chain walk is cycle-checked and bounds-checked (T-SEC-4). |

### 9.3 Compression — `core/vba/ovba-decompress.js`, `ovba-compress.js` ([MS-OVBA] §2.4.1)

- Container: signature byte `0x01`, followed by chunks.
- Chunk header (16-bit LE): bits 0–11 = chunk size − 3; bits 12–14 = `0b011`; bit 15 = 1 for compressed.
- Uncompressed chunk: 4096 raw bytes.
- Compressed chunk: a sequence of a FlagByte followed by 8 tokens (bit *i* = 1 means a copy token). A copy token is 16-bit LE. With `d` = the current decompressed position within the chunk, `bitCount = max(ceil(log2(d)), 4)`, `lengthMask = 0xFFFF >> bitCount`, `offset = (token >> (16 − bitCount)) + 1`, and `length = (token & lengthMask) + 3`. Copies may overlap, so copy byte by byte.
- The compressor implements the reference algorithm in §2.4.1.3 (matching window, maximum length per bit split). Output does not need to match Excel byte-for-byte, but it MUST decompress to the identical input (T-OVBA-2), and it SHOULD be within 10% of Excel's size on fixtures.
- Test vectors: use the three worked examples in [MS-OVBA] §3.2 (no compression, normal compression, maximum compression) **verbatim**, in both directions.

### 9.4 Project structure — `core/vba/dir-stream.js`, `project-stream.js`, `codepages.js`, `vba-project.js`

- `VBA/dir` is decompressed and then parsed as a sequence of `{ id: u16, size: u32, data }` records. **Exception:** `PROJECTVERSION` (id `0x0009`) has `size = 4`, but it is followed by 6 bytes (4-byte major + 2-byte minor). Handle this case explicitly.
- Read `PROJECTCODEPAGE` (`0x0003`) and `PROJECTNAME` (`0x0004`). Read references (`0x0016` name, `0x003E` unicode name, `0x000D` registered, `0x000E` project, `0x002F` control, `0x0033` original) for display only.
- `PROJECTMODULES` (`0x000F`) gives the module count, followed by `PROJECTCOOKIE` (`0x0013`). Each module record contains `MODULENAME 0x0019`, `MODULENAMEUNICODE 0x0047`, `MODULESTREAMNAME 0x001A` (+ unicode `0x0032`), `MODULEDOCSTRING 0x001C` (+ `0x0048`), `MODULEOFFSET 0x0031`, `MODULEHELPCONTEXT 0x001E`, `MODULECOOKIE 0x002C`, `MODULETYPE 0x0021` (procedural) or `0x0022` (document/class), optional `MODULEREADONLY 0x0025` and `MODULEPRIVATE 0x0028`, and the terminator `0x002B`. The dir stream ends with `0x0010`.
- Keep **all** records, including unknown ones, as raw bytes in order, so that re-serialization is lossless (T-VBA-DIR-RT).
- Module source is in `VBA/<streamName>`, starting at `MODULEOFFSET`. Bytes before the offset are the p-code (performance cache). The source is a compressed container from the offset to the end of the stream.
- Decode source with the project code page via `TextDecoder` (`windows-1252`, `windows-1250`…`1258`, `shift_jis` for 932, `gbk` for 936, `euc-kr` for 949, `big5` for 950, `utf-8` for 65001; for 10000, use `macintosh`). Unknown code pages are shown read-only.
- Encoding back: `TextEncoder` only supports UTF-8, so `codepages.js` implements encoders for the single-byte Windows code pages 1250–1258 and 10000, generated from the `TextDecoder` reverse map over 0x00–0xFF at startup. For DBCS code pages (932/936/949/950), editing is allowed only if the edited text contains ASCII characters only plus characters already present in the original source (map them through the original byte sequences). Otherwise, the editor shows `This character cannot be saved in code page 932.` and blocks writeback.
- `PROJECT` stream (text, in the project code page): parse `ID=`, `Document=Name/&H…`, `Module=`, `Class=`, `BaseClass=` (forms), `Package=`, `Name=`, `HelpContextID=`, `VersionCompatible32=`, `CMG=`, `DPB=`, `GC=`, and the `[Host Extender Info]` and `[Workspace]` sections. Use it to classify modules: Document (ThisWorkbook, Sheet*), Standard, Class, or Form.
- **Locked projects:** if `DPB` indicates that the project is locked for viewing (that is, the value does not decode to the "no password" form; **VERIFY** with fixtures F-VBA-LOCKED and F-VBA-UNLOCKED), Quoin shows the modules **read-only**, with the note `This VBA project is locked in Excel. Shown read-only.` Quoin never removes or alters `DPB`, `CMG`, or `GC`.

### 9.5 Module presentation

- Hidden attribute lines (`Attribute VB_Name = "…"`, `Attribute VB_Base…`, `VB_GlobalNameSpace`, `VB_Creatable`, `VB_PredeclaredId`, `VB_Exposed`, `VB_TemplateDerived`, `VB_Customizable`, and procedure-level `Attribute X.VB_…`) are removed from the editor view, and their exact positions are remembered. On writeback they are re-inserted unchanged. The VBA editor in Excel hides these lines in the same way.
- Exports (`.bas`, `.cls`, `.frm`) include the attribute lines, matching the VBE "Export File" format: CRLF line endings, encoded in the project code page. `.frm` export contains the code part only and adds the note line `' Form layout not included.`. This is VBA content, not Quoin source, so the no-comments rule does not apply to it. `.frx` is never produced.

### 9.6 VBA writeback — `core/vba/writeback.js`, `cfb-write.js`

1. For each edited module, encode its source (with the attribute lines restored, and CRLF), compress it, and set the module stream to **source only**, with `MODULEOFFSET = 0`.
2. Update `MODULEOFFSET` in the dir records for edited modules. Re-serialize the dir stream, preserving every other record byte, then recompress it.
3. Replace the `VBA/_VBA_PROJECT` stream with the 7-byte minimal form `CC 61 FF FF 00 00 00` ([MS-OVBA] §2.3.4.1: Reserved1 `0x61CC`, Version `0xFFFF`, Reserved2 `0x00`, Reserved3 `0x0000`, with no PerformanceCache). This tells Excel to recompile from source. The p-code of **un-edited** modules must also be dropped (set their offset to 0 and keep only the compressed source), because the performance cache is now invalid.
4. Delete `VBA/__SRP_*` streams (these are caches).
5. Rewrite the CFB (§9.7). Keep every other stream and storage (forms, `PROJECT`, `PROJECTwm`, `PROJECTlk`, and so on) byte-identical.
6. If any signature part exists, remove `vbaProjectSignature*.bin` together with their relationships and content-type overrides. The download dialog says: `The VBA project was signed. Editing removes the signature.` The user must confirm this before downloading.
7. **VERIFY** in Excel 365 for Windows and Excel for Mac (MX-4, MX-5): the file opens without repair, edited code appears in the VBE, it compiles (Debug → Compile), and macros run.

### 9.7 CFB writer — `core/vba/cfb-write.js`

| ID | Requirement |
|---|---|
| CFBW-1 | Output major version 3 (512-byte sectors), unless the input was version 4 and any stream exceeds what v3 handles comfortably. In practice, always write v3. |
| CFBW-2 | Layout: header, FAT sectors, DIFAT sectors (only if FAT > 109 sectors), directory sectors, MiniFAT sectors, the mini stream (as the root's regular stream), then regular streams ≥ 4096 bytes. |
| CFBW-3 | Directory tree: for every storage, sort its children by (UTF-16 length, then uppercase code-unit compare, per [MS-CFB] §2.6.4). Build a balanced BST by median split. Colour nodes black, except the nodes on the deepest level when that level is incomplete, which are coloured red. This produces a valid red-black tree. ([MS-CFB] allows readers to skip colour validation, but Quoin writes a valid tree anyway.) |
| CFBW-4 | Preserve the CLSID, state bits, and timestamps of every entry. The root entry modified time may be updated. |
| CFBW-5 | Pad unused directory slots with empty entries (type 0, sibling and child IDs `0xFFFFFFFF`). |
| CFBW-6 | Round-trip: `read(write(read(x)))` gives an identical tree with identical stream bytes (T-CFB-RT-1). |

---

## 10. User interface

### 10.1 Layout

Empty state (centred, max-width 560 px):

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                         [mark 48px]                           │
│                     The working parts of a workbook.          │
│                                                               │
│   ╭───────────────────────────────────────────────────────╮   │
│   │                                                       │   │
│   │        Drop an .xlsx or .xlsm file, or choose one.    │   │
│   │                    [ Choose file ]                    │   │
│   │                                                       │   │
│   ╰───────────────────────────────────────────────────────╯   │
│                                                               │
│     Files stay in this tab. Nothing is uploaded or stored.    │
└───────────────────────────────────────────────────────────────┘
```

The drop zone uses a 1.5 px dashed `--line-strong` border, `--r-xl` corners, and `--s-7` padding. On drag-over, the border becomes solid `--heather` and the background becomes `--heather-soft`.

Workspace (desktop ≥ 1024 px):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [mark] quoin   Sales_Model.xlsm                 [Export ▾] [Download]   │  top bar 56px
├───────────────┬──────────────────────────────────────────────────────────┤
│ QUERIES     4 │  Sales                              Table · Sheet2!A1:F1205 │
│ ● Sales       │ ┌──────────────────────────────────────────────────────┐  │
│   Customers   │ │ 1  let                                               │  │
│   Top Cust…   │ │ 2      Source = Excel.CurrentWorkbook(){[Name=…       │  │  editor
│   fnClean  ƒ  │ │ …                                                    │  │
│               │ └──────────────────────────────────────────────────────┘  │
│ MACROS      3 │  [Run ⌘↵]  Steps: Source · Changed Type · Filtered ·…   │
│   ThisWorkbook│ ┌──────────────────────────────────────────────────────┐  │
│   Module1     │ │ Date ▾   Region ▾   Amount ▾ …     (virtualized grid) │  │  result
│   clsHelper   │ │                                                      │  │
│               │ └──────────────────────────────────────────────────────┘  │
├───────────────┴──────────────────────────────────────────────────────────┤
│ 4 queries · 3 modules   ·   1,204 rows · 0.31 s   ·   Matches the last… │  status 32px
└──────────────────────────────────────────────────────────────────────────┘
```

- Left rail: 248 px wide, resizable from 200 to 360 px. It has two sections, `Queries` and `Macros`, with uppercase `--t-xs` labels and a 0.04em letter-spacing in `--ink-3`, and counts aligned right. Query groups appear as collapsible folders. Functions get an `ƒ` badge, and connection-only queries get a hollow dot. An edited item shows a 6 px Heather dot after its name.
- The editor and result panels split vertically with a draggable divider (default 45/55). When a VBA module is selected, the result panel is hidden and the editor fills the space. VBA shows a quiet, read-only info strip: `VBA is shown and edited, never run.`
- Top bar: the file name is shown in `--ink-2`, and clicking it reveals the details (size, format, and counts). `Download` is the only filled (primary) button. It is disabled until there is at least one edit, and its tooltip says `No changes yet.`
- Tablet (640–1023 px): the left rail collapses to a dropdown above the editor.
- Mobile (< 640 px): stacked layout with a segmented control `Code | Result`. Editing is allowed, and the Download button sits in the top bar.

### 10.2 Status bar

There is a single line in `--t-sm`, with segments separated by ` · `. It shows: document counts, the last run (rows and time) or the error kind, compare status with a coloured 8 px dot (lichen/clay/ink-3), and the culture when it is not en-US. The status bar has `role="status"` and `aria-live="polite"`.

### 10.3 Editor — `ui/editor.js`

Use a native implementation: a `<textarea>` overlaid on a `<pre>` highlight layer, with the same font metrics, scroll synchronized, and a line-number gutter built as a separate element.

- Highlighting is incremental per line, using the lexer state at the line start. Re-highlight only the changed lines and the following lines until the lexer state converges.
- Tab inserts 4 spaces. Shift+Tab outdents. Enter keeps the indentation. Selection indent and outdent work on multiple lines.
- Bracket pair highlight on the caret.
- Error squiggle: a wavy `--clay` underline built from a positioned span in the highlight layer, plus a gutter dot. Hovering shows the message in a tooltip (positioned with `--r-md` and the floating shadow).
- Native undo and redo are preserved (insert text with `document.execCommand('insertText')` where supported, otherwise with `setRangeText` and a custom undo stack). **Test both paths.**
- Find: Ctrl/Cmd+F opens a small inline find bar inside the editor (find next/previous, match case). There is no replace in v1.
- Large text (over 20,000 lines) switches to virtualized line rendering.
- The edited state is compared with the original text. Reverting to the original text clears the edited dot.
- `Revert` action per item (in the item's context menu, `⋯`).

### 10.4 Result grid — `ui/grid.js`

- Virtualized rows (row height 28 px) and virtualized columns once there are more than 50 columns. Renders 1,000,000 rows at 60 fps scroll on a mid-range laptop (T-PERF-3).
- The header shows the column name and the M type (`--t-xs`, `--ink-3`): `abc` for text, `1.2` for number, `123` for Int64, and plain text labels for the rest (`date`, `datetime`, `time`, `duration`, `true/false`, `any`). There are no icons or emoji in type labels.
- Null is shown as an italic `null` in `--ink-3`. Error cells are shown as `Error` in `--clay-ink` and are clickable to show `[Reason, Message, Detail]` in a popover. Nested values are shown as `Table`, `List`, or `Record` in `--tide-ink`, and clicking them opens a drill-in breadcrumb, mirroring Power Query.
- Numbers are right-aligned and rendered in the monospace font with tabular numerals, formatted with the run culture. Raw values are shown on hover or copy.
- Selection: click, shift-click, and drag ranges. Ctrl/Cmd+C copies as TSV.
- Column header menu: sort ascending/descending (view only, it does not change M), `Copy column name`.

### 10.5 Export menu — `ui/export-menu.js`

```
Result
  CSV (UTF-8)
  CSV (UTF-8 with BOM, for Excel)
  TSV
  JSON (records)
  New .xlsx
Code
  This query (.m)
  All queries (.zip of .m)
  This module (.bas / .cls)
  All modules (.zip)
  Everything (.zip)
Settings
  ☑ Guard against formula injection in CSV
```

### 10.6 Download (edited workbook)

The Download button opens a compact popover:

```
Sales_Model (edited).xlsm
2 queries and 1 module changed.
☑ Refresh edited queries when opened in Excel
Cached tables keep their old values until Excel refreshes.
[ Download ]
```

When a signature is present, an extra line appears in `--flax-ink` on `--flax-soft`, `The VBA project was signed. Editing removes the signature.`, and a checkbox `I understand` that is required before downloading.

The file name is `<original name> (edited).<ext>`. The extension is `.xlsm` when VBA is present, otherwise the original extension.

Before the bytes are offered, run a **post-write self-check** (S-1 in §12): re-open the produced bytes with Quoin's own reader, confirm that every query and module parses, and confirm that the edited text equals what the user sees. If the check fails, do not download. Show `The file could not be written safely. Nothing was downloaded.`, and give a `Copy details` link that copies a technical report to the clipboard. The report contains no file contents, only error codes and part names.

### 10.7 Keyboard

| Keys | Action |
|---|---|
| Ctrl/Cmd+O | Choose file |
| Ctrl/Cmd+Enter | Run the current query |
| Esc | Cancel the run / close a popover |
| Ctrl/Cmd+S | Open the Download popover (prevent the browser's default save) |
| Ctrl/Cmd+Shift+E | Open the Export menu |
| Alt+↑ / Alt+↓ | Previous/next item in the rail |
| Ctrl/Cmd+F | Find in the editor |
| ? | Shortcut sheet (a dialog with a two-column list) |

### 10.8 Accessibility

- The rail is a `role="tree"` with arrow-key navigation, and items announce their type and edited state.
- The editor textarea has `aria-label="Query code: Sales"`, with errors exposed through `aria-describedby`.
- The grid is a `role="grid"` with `aria-rowcount` and `aria-colcount`, and the active cell is managed through `aria-activedescendant`.
- Everything is reachable by keyboard. The focus order is: top bar → rail → editor → run → result → status.
- Colour is never the only signal: the compare status has text, and differing cells also carry a `title` describing the difference.
- WCAG 2.2 AA. axe-core must report zero violations (T-A11Y-1).

### 10.9 Settings

A small dialog opened from a `⋯` in the top bar, containing: theme (System/Light/Dark), culture for runs, M timeout, row cap, the CSV injection guard, and `Use upstream query results instead of cached cells` (default). Only the theme persists (PR-3). Everything else resets on reload, and the dialog says so in one line: `Only the theme is remembered.`

---

## 11. Print preview (Milestone 5, optional)

Goal: "the same pages, the same breaks, the same headers and footers" as Excel for Windows would produce on the default printer for the configured paper size. This is **not** pixel identity, and the UI says so in the preview header: `Approximate. Fonts and printer margins can differ from Excel.`

Inputs per sheet:

- `<pageSetup paperSize orientation scale fitToWidth fitToHeight firstPageNumber useFirstPageNumber pageOrder blackAndWhite draft cellComments errors horizontalDpi verticalDpi/>`
- `<sheetPr><pageSetUpPr fitToPage/></sheetPr>`
- `<pageMargins left right top bottom header footer/>` (in inches)
- `<printOptions gridLines headings horizontalCentered verticalCentered/>`
- `<headerFooter differentFirst differentOddEven>` with `&L &C &R &P &N &D &T &F &A &"font,style" &nn &B &I &U` codes
- `<rowBreaks>`, `<colBreaks>` (manual breaks)
- Defined names `_xlnm.Print_Area` and `_xlnm.Print_Titles` (sheet-scoped)
- Column widths (`<col width>` in characters of the default font's max digit width), row heights (`ht` in points), default sizes, hidden rows and columns, merged cells, and cell styles (font, size, bold, italic, underline, fill, borders, alignment, wrap, number format → display text)

Algorithm (`core/print/paginate.js`):

1. Convert column widths to pixels as Excel does: `px = trunc(((256·width + trunc(128/MDW)) / 256) · MDW)`, where MDW is the maximum digit width of the workbook default font at 96 dpi (for Calibri 11, MDW = 7). Then convert to points (`× 72/96`). Compute MDW by measuring `0`–`9` in the metric-compatible fallback font on a canvas.
2. Determine the printable area: page size minus margins, minus repeated title rows and columns.
3. Apply the scale: either `scale/100`, or a fit-to-width/height scale chosen as the largest value (in 1% steps, between 10 and 400) that satisfies both constraints.
4. Place automatic breaks greedily, after the manual breaks. Respect `pageOrder` (down then over, or over then down).
5. Render each page as an absolutely positioned HTML page in a `@page { size: <paper> <orientation>; margin: 0 }` print stylesheet. The browser print dialog then prints those pages 1:1.

Fonts: Calibri → Carlito, Cambria → Caladea, Arial → Liberation Sans, Times New Roman → Liberation Serif, Courier New → Liberation Mono. Aptos (the Office default since 2023) has no metric-compatible open font. Fall back to Carlito, and warn: `This workbook uses Aptos. Line breaks may differ.`

Number-format display (`core/numfmt.js`) is shared with the grid: sections `pos;neg;zero;text`, `0 # ? . , %`, `E+`, quoted literals, `\` escapes, `_` and `*` (the space-fill approximation), colours `[Red]`, conditions `[>100]`, dates and times, `[h]:mm`, `AM/PM`, and locale `[$-409]`.

Fidelity tests are in §14.9. The milestone passes if 90% of fixture pages have identical page breaks to Excel's PDF export, and every header and footer token renders the same text.

---

## 12. Safeguards (runtime self-checks)

| ID | Safeguard |
|---|---|
| S-1 | Post-write self-check before every download (§10.6). |
| S-2 | Invariant check after load: the number of queries in Section1.m equals the number of Formula items in the metadata (ignoring `Section1/<Name>/<Step>` sub-items). When they differ, show a warning, and never fail. |
| S-3 | Every `connections.xml` Mashup connection's `Location` matches a section member. Orphans are listed under `Details`. |
| S-4 | Writeback refuses to proceed when the DataMashup structure was parsed with warnings (unknown version, trailing bytes). Message: `This workbook's query data uses a format Quoin does not write.` Reading still works. |
| S-5 | VBA writeback refuses for unknown code pages, locked projects, and projects whose dir stream had parse anomalies. |
| S-6 | Edits are kept in memory per item and survive switching between items. `beforeunload` warns when there are unsaved edits. |
| S-7 | Each worker run gets a monotonically increasing run ID. Late results from cancelled runs are dropped. |
| S-8 | All `QuoinError`s carry a `code` (for example, `zip.crc`), a `part`, and a short message. Unexpected exceptions are caught at the boundary and shown as `Something unexpected happened while reading <part>.`, with `Copy details`. Quoin never shows a stack trace in the UI. |
| S-9 | Main thread responsiveness: parsing over 5 MB happens in `parse-worker.js`. The UI shows the indeterminate bar and stays interactive, including cancel. |
| S-10 | Memory: release original bytes only after a download self-check succeeds. Never keep more than two full copies of the workbook in memory. |

---

## 13. Test fixtures

### 13.1 Fixture rules

- Fixtures are created in **real Excel** (365 for Windows, current channel; and Excel for Mac where noted). Record the version and build in `tests/fixtures/workbooks/README.md`.
- Each fixture has a sibling expected file in `tests/fixtures/expected/<name>.json` that contains the extracted queries (name and exact text), modules (name, type, and exact text), load targets, and for M runs the expected result (columns, types, and rows) taken from Excel's refreshed table.
- Fixtures contain synthetic data only. No real personal data.
- Fixtures over 2 MB are generated by a script in `tests/fixtures/generators/` from a smaller Excel-made seed, using Quoin's own ZIP writer to pad sheet data. They are not committed.

### 13.2 Fixture list

| ID | File | Contents |
|---|---|---|
| F-EMPTY | `plain.xlsx` | No queries, no VBA |
| F-PQ-1 | `pq_single.xlsx` | 1 query loaded to a table, from an in-workbook table |
| F-PQ-MULTI | `pq_multi.xlsx` | 6 queries: table loads, connection only, a function query, query groups, quoted names with spaces, Unicode names (`Ventes_été`, `売上`) |
| F-PQ-DM | `pq_datamodel.xlsx` | 2 queries loaded to the Data Model |
| F-PQ-CW | `pq_currentworkbook.xlsx` | 3 tables plus 2 named ranges, mixed types, dates, errors (`#N/A`, `#DIV/0!`), totals row, `date1904=false` |
| F-PQ-1904 | `pq_1904.xlsx` | Same as F-PQ-CW, with the 1904 date system |
| F-PQ-CSV | `pq_csv.xlsx` + `sales.csv` | `File.Contents` + `Csv.Document` + types; the CSV is the binding |
| F-PQ-WEB | `pq_web.xlsx` + `response.json` | `Web.Contents` + `Json.Document` |
| F-PQ-XL | `pq_excelworkbook.xlsx` + `source.xlsx` | `Excel.Workbook(File.Contents(...))` |
| F-PQ-TRANSFORMS | `pq_transforms.xlsx` | One query per Tier A table function family, each loaded to a sheet so that the cache is the oracle |
| F-PQ-JOIN | `pq_join.xlsx` | NestedJoin with all JoinKinds, then ExpandTableColumn |
| F-PQ-GROUP | `pq_group.xlsx` | Group with Sum/Count/All Rows, Pivot/Unpivot |
| F-PQ-ERRORS | `pq_errors.xlsx` | try/otherwise, error cells, RemoveRowsWithErrors |
| F-PQ-CRLF | `pq_comments.xlsx` | Queries with `//` and `/* */` comments containing `;`, `shared`, `in` |
| F-PQ-ATTR | `pq_attributes.xlsx` | Queries with descriptions (member attributes) |
| F-PQ-UNSUP | `pq_unsupported.xlsx` | `Sql.Database`, `Folder.Files`, `Web.Page` |
| F-PQ-ADDIN | `pq_addin2013.xlsx` | (If obtainable) Power Query 2013 add-in workbook |
| F-M-NUM | `m_numbers.xlsx` | `Number.ToText` and `Text.From` edge cases loaded to a sheet |
| F-M-ROUND | `m_rounding.xlsx` | Rounding of x.5 values via `Int64.Type`, `Number.Round`, and `Currency.Type` |
| F-M-CULTURE | `m_culture.xlsx` | Parsing `1.234,56` and `31/12/2026` with `de-DE`, `fr-FR`, `en-GB` |
| F-M-DATES | `m_dates.xlsx` | Date functions across leap years, week starts, and quarters |
| F-VBA-1 | `vba_basic.xlsm` | ThisWorkbook, Sheet1, Module1, Class1 |
| F-VBA-FORM | `vba_form.xlsm` | UserForm with controls and code |
| F-VBA-1250 | `vba_cp1250.xlsm` | Created on a Windows install with Central European locale (strings `Łódź`, `Příliš`) |
| F-VBA-932 | `vba_cp932.xlsm` | Japanese locale project with `売上` in strings |
| F-VBA-SIGNED | `vba_signed.xlsm` | Self-signed digital signature |
| F-VBA-LOCKED | `vba_locked.xlsm` | Locked for viewing with a password |
| F-VBA-UNLOCKED | `vba_unlocked.xlsm` | A protection password set, but "Lock project for viewing" unchecked |
| F-VBA-V4 | `vba_cfbv4.xlsm` | (If obtainable) a vbaProject.bin using 4096-byte sectors |
| F-MIXED | `mixed.xlsm` | 3 queries + 4 modules + charts + pivot table + conditional formatting + comments, used to prove preservation |
| F-MISNAMED | `macros_named.xlsx` | An `.xlsm` renamed to `.xlsx` |
| F-ENC | `encrypted.xlsx` | Password to open |
| F-XLS | `legacy.xls` | BIFF8 |
| F-XLSB | `binary.xlsb` | |
| F-STRICT | `strict.xlsx` | Strict Open XML |
| F-ODS | `sheet.ods` | |
| F-PRINT-* | `print_*.xlsx` | M5: A4/Letter/Legal, portrait/landscape, fit to 1 page wide, print titles, manual breaks, header/footer codes, gridlines, centered, Aptos vs Calibri. Each comes with Excel's PDF export (`print_*.pdf`) as the oracle. |

Synthetic malicious fixtures (generated by `tests/fixtures/generators/hostile.js`, never by Excel):

| ID | Contents |
|---|---|
| H-ZIPBOMB | A 10 KB zip expanding to 2 GB |
| H-RATIO | One entry with a 10,000:1 ratio at 50 MB |
| H-MANYENTRIES | 50,000 entries |
| H-TRAVERSAL | An entry named `../../evil.xml` |
| H-CRC | One flipped byte in a compressed stream |
| H-DUPE | `xl/workbook.xml` and `XL/Workbook.xml` |
| H-XXE | `xl/workbook.xml` with DOCTYPE and an external entity |
| H-BILLION | Billion-laughs entity expansion |
| H-XSS-NAMES | A query named `<img src=x onerror=alert(1)>`, a module named `"><script>`, and cell text `<b>x</b>` |
| H-DM-LEN | A DataMashup whose PackagePartsLength exceeds the buffer |
| H-DM-TRAIL | A DataMashup with 16 trailing bytes |
| H-CFB-LOOP | A FAT chain that loops |
| H-CFB-OOR | A sector index beyond the end of the file |
| H-OVBA-BAD | A compressed container with an invalid chunk signature |
| H-M-RECURSE | `shared Q = let f = (n) => @f(n+1) in f(0);` |
| H-M-HUGE | `List.Numbers(1, 100000000)` expanded to a table |
| H-PROTO | JSON with the keys `__proto__` and `constructor` |

---

## 14. Test plan

Every test has an ID, a level, and a pass condition. CI runs every automated test on every commit, in Chromium, Firefox, and WebKit.

### 14.1 Lint and static checks (`tests/lint/`)

| ID | Check | Pass |
|---|---|---|
| T-LINT-1 | No comments in shipped source. JS is checked with acorn `onComment`. CSS is checked with a tokenizer for `/*`. HTML/SVG are checked for `<!--`. `.webmanifest` must be valid JSON. | Zero findings in `index.html`, `sw.js`, `src/**`, `styles/**`, `public/*.svg` |
| T-LINT-2 | No runtime imports outside the repo (no `http:`/`https:` specifiers, and no bare module specifiers) | Zero findings |
| T-LINT-3 | Spacing values in CSS (`margin`, `padding`, `gap`, `inset`, `top/right/bottom/left` when not 0/auto/%) use `var(--s-*)` | Zero raw px values, except 1 px borders, 2 px focus outlines, and grid row and column sizes declared in `grid.css` tokens |
| T-LINT-4 | `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts(` with remote URLs | Allowed only in `sw.js` (same-origin) |
| T-LINT-5 | `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string `setTimeout`/`setInterval`, `on*=` attributes in HTML | Zero |
| T-LINT-6 | Colours in CSS come from tokens only (no hex outside `tokens.css`) | Zero |
| T-LINT-7 | `src/core/**` does not reference `document`, `window`, or `navigator` | Zero |
| T-LINT-8 | `localStorage` is used only with the key `quoin.theme` | Exactly one key |
| T-LINT-9 | Every user-facing string lives in `src/ui/strings.js` and contains no `!`, emoji, "please", "oops", or "sorry" | Zero |

All copy lives in `src/ui/strings.js`, keyed by ID (see §5).

### 14.2 Unit — container

| ID | Test |
|---|---|
| T-CRC-1 | CRC-32 of `""` = `0x00000000`; of `"123456789"` = `0xCBF43926` |
| T-ZIP-1 | Reads stored and deflated entries; names with UTF-8 and CP437 decode correctly |
| T-ZIP-2 | Data descriptor (bit 3) entries read correctly |
| T-ZIP-3 | ZIP64 EOCD is located and parsed (generated fixture) |
| T-ZIP-4 | Unsupported method 12 (bzip2) gives `zip.method` |
| T-ZIP-5 | Encrypted flag gives `zip.encrypted` |
| T-ZIP-6 | H-TRAVERSAL gives `zip.name`; H-DUPE gives `zip.duplicate` |
| T-ZIP-7 | H-CRC gives `zip.crc` naming the entry |
| T-ZIP-RT-1 | For every fixture, writing it unchanged produces entries with byte-identical names, raw data, and CRCs |
| T-ZIP-W-1 | A written ZIP is readable by Quoin, and by `unzip -t` / Python `zipfile.testzip()` in CI (dev-only check) |
| T-XML-1 | Round-trip of `connections.xml` preserves the declaration, namespaces, `mc:Ignorable`, and attribute order |
| T-XML-2 | UTF-16LE with BOM is decoded and re-encoded identically |
| T-DETECT-1..7 | F-ENC, F-XLS, F-XLSB, F-STRICT, F-ODS, a random PNG, and an empty file each give their specific refusal message |
| T-DETECT-8 | F-MISNAMED loads and shows the extension warning |

### 14.3 Unit — Power Query

| ID | Test |
|---|---|
| T-PQ-1 | Finds the DataMashup item by namespace when it is `item3.xml` and not `item1.xml` (generated variant of F-PQ-1) |
| T-PQ-2 | Extracts names and the exact expression text for all F-PQ-* fixtures, equal to the expected JSON |
| T-PQ-3 | Load badges for F-PQ-MULTI and F-PQ-DM match the expected values |
| T-PQ-4 | Query groups are reconstructed as in Excel |
| T-PQ-5 | H-DM-LEN gives `pq.length`; H-DM-TRAIL gives `pq.trailing`, and writeback is blocked (S-4) |
| T-PQ-RT-1 | `buildDataMashup(parseDataMashup(x))` is byte-identical for every fixture |
| T-PQ-RT-2 | Writeback with zero edits produces a customXml item byte-identical to the original |
| T-PQ-EDIT-1 | Editing query 2 of 6 changes only that member's span (diff of Section1.m = exactly that span) |
| T-PQ-EDIT-2 | Comments containing `;`, `shared`, and `in` elsewhere in the section are untouched (F-PQ-CRLF) |
| T-PQ-EDIT-3 | CRLF is preserved: the edited text with LF is written back as CRLF |
| T-PQ-EDIT-4 | Member attributes `[Description="…"]` are preserved (F-PQ-ATTR) |
| T-PQ-EDIT-5 | An edit that fails to parse blocks writeback, with line and column given |
| T-PQ-EDIT-6 | `refreshOnLoad="1"` is set only on the connections of edited queries when the option is on, and nothing else in `connections.xml` changes |
| T-PQ-EDIT-7 | Unicode query names (F-PQ-MULTI) survive the edit round trip |

### 14.4 Unit — M engine

Organize these under `tests/unit/m/`. There is one file per library module, and each Tier A function has at least the following:

- a documented example from the official function reference (re-typed by hand, with the source URL in the test name, not in a comment),
- a null-argument case,
- an optional-argument case,
- an error case with the exact `Reason` and the first sentence of `Message`.

Plus:

| ID | Test |
|---|---|
| T-M-LEX-1 | Every token kind; `#"a""b"` → `a"b`; `#(cr,lf)`; hex numbers; an unterminated string becomes an error token without throwing |
| T-M-LEX-2 | Lexing 1 MB of random bytes completes in under 500 ms without throwing (fuzz, 1,000 seeds) |
| T-M-PARSE-1 | Precedence table: each pair from §8.2 is checked by its AST shape |
| T-M-PARSE-2 | Every query in all fixtures parses |
| T-M-PARSE-3 | Error messages and spans for 20 broken snippets match the expected values |
| T-M-SEM-* | One test per bullet in §8.4 |
| T-M-LAZY-1 | `let a = error "x", b = 1 in b` = 1 |
| T-M-LAZY-2 | A list item that is an error is not evaluated by `List.Count` |
| T-M-REC-1 | `@` recursion: factorial(10) = 3628800 |
| T-M-CULT-1 | F-M-CULTURE results equal Excel's cache |
| T-M-NUM-1 | F-M-NUM results equal Excel's cache |
| T-M-ROUND-1 | F-M-ROUND results equal Excel's cache |
| T-M-DATE-1 | F-M-DATES results equal Excel's cache |
| T-M-CW-1 | `Excel.CurrentWorkbook()` on F-PQ-CW: row order, names, content columns, and cell kinds match the expected values |
| T-M-CW-2 | The 1904 date system (F-PQ-1904) shifts dates correctly |
| T-M-CONN-1 | `File.Contents` without a binding posts `need-binding`, then resumes with the bytes |
| T-M-CONN-2 | Skip → `DataSource.Error` with the path in the message |
| T-M-CONN-3 | `Web.Contents` with `RelativePath` and `Query` canonicalizes to a stable key |
| T-M-CONN-4 | `Sql.Database` → `Quoin.Unsupported` naming `Sql.Database`, with the span |
| T-M-ORACLE-1 | **For every query in every F-PQ-* fixture that is loaded to a sheet table and uses only supported functions, the run result equals the cached table (§8.9).** This is the main correctness test. |
| T-M-COVER-1 | `docs/m-coverage.md` is regenerated, and the diff is empty (coverage doc in sync) |

### 14.5 Unit — VBA

| ID | Test |
|---|---|
| T-OVBA-1 | Decompress the three [MS-OVBA] §3.2 vectors to their exact plaintexts |
| T-OVBA-2 | `decompress(compress(x)) == x` for: empty, 1 byte, 4095, 4096, 4097, 100 KB random, 100 KB repetitive, all fixture module sources |
| T-OVBA-3 | H-OVBA-BAD gives `ovba.chunk` |
| T-OVBA-4 | Compression output on fixtures is no more than 110% of Excel's compressed size |
| T-CFB-1 | Reads F-VBA-* trees (paths and sizes equal the expected values) |
| T-CFB-2 | H-CFB-LOOP gives `cfb.loop`; H-CFB-OOR gives `cfb.range` |
| T-CFB-RT-1 | `read(write(read(x)))` gives an identical tree and bytes for every vbaProject.bin |
| T-CFB-RB-1 | The written directory satisfies the red-black invariants (no red-red, equal black height) and the BST ordering of [MS-CFB] §2.6.4 |
| T-VBA-DIR-1 | The PROJECTVERSION quirk is handled; the code page, project name, and modules are extracted |
| T-VBA-DIR-RT | Re-serializing an unmodified dir gives identical decompressed bytes |
| T-VBA-1 | Module names, types, and exact source (with attribute lines) match the expected values for F-VBA-1 and F-VBA-FORM |
| T-VBA-2 | Attribute lines are hidden in the editor view and restored identically on writeback |
| T-VBA-3 | CP1250 source decodes and re-encodes to identical bytes (F-VBA-1250) |
| T-VBA-4 | CP932: an ASCII-only edit succeeds; an edit adding `漢` that is not in the original is blocked with the message |
| T-VBA-5 | Locked project (F-VBA-LOCKED) → read-only; writeback is impossible |
| T-VBA-6 | Unlocked password project (F-VBA-UNLOCKED) → editable; `DPB` and `CMG` are untouched |
| T-VBA-WB-1 | After an edit: `_VBA_PROJECT` = `CC 61 FF FF 00 00 00`, every module `MODULEOFFSET` = 0, there are no `__SRP_*` streams, the form storages are byte-identical, and re-reading gives the edited source |
| T-VBA-WB-2 | Signed fixture: the signature parts, relationships, and overrides are removed; nothing else in `[Content_Types].xml` changes |
| T-VBA-WB-3 | Editing VBA in F-MIXED leaves every non-VBA ZIP entry byte-identical |

### 14.6 Unit — export and compare

| ID | Test |
|---|---|
| T-EXP-1 | CSV: RFC 4180 quoting (quotes, commas, CR, LF), CRLF rows, the BOM option, null → empty, dates in ISO 8601 |
| T-EXP-2 | JSON: records, with dates as ISO strings, durations as ISO 8601 `P…`, binaries as an omitted field plus a warning, and nested tables as arrays |
| T-EXP-3 | New .xlsx: opens in Quoin; manual MX-6 in Excel shows correct types (numbers as numbers, dates with format 14, text as shared strings) |
| T-EXP-4 | Injection guard: `=1+1`, `+A1`, `-cmd`, `@SUM`, `\tX`, `\rX` are prefixed; the number −5 typed as number is not |
| T-EXP-5 | `.m` export equals the editor text with the original line endings; `.bas` equals the VBE export format, including attributes, in the project code page |
| T-EXP-6 | Zip bundle names are sanitized and unique (`Query.m`, `Query (2).m`) |
| T-CMP-1 | Equal tables → match; 1 changed cell → `Differs in 1 cell` with the coordinates |
| T-CMP-2 | Tolerance rules for numbers and datetimes (§8.9) at the boundaries |
| T-CMP-3 | A query using `DateTime.LocalNow` → compare is disabled with the note |

### 14.7 Security and privacy

| ID | Test | Pass |
|---|---|---|
| T-SEC-1 | Load H-XSS-NAMES in the E2E browser; run; open every panel | `window.__xss` stays undefined (the payloads set it); no `alert` dialog event; the DOM contains the literal text |
| T-SEC-2 | H-ZIPBOMB, H-RATIO, H-MANYENTRIES | Refused with a limit message within 2 s; peak JS heap under 300 MB |
| T-SEC-3 | H-XXE, H-BILLION | Refused with `xml.doctype`; no network request |
| T-SEC-4 | H-CFB-LOOP, H-CFB-OOR | Refused; the macros section shows `Could not read the VBA project.` while queries still load |
| T-SEC-5 | H-M-RECURSE, H-M-HUGE | Stopped with depth or row-cap messages; Cancel during H-M-HUGE terminates the worker in under 200 ms; the UI stays responsive (input latency under 100 ms) |
| T-SEC-6 | Search the built bundle for any VBA execution path | The VBA module exposes no evaluate/run APIs (a review checklist item plus a grep for `run`, `exec`, and `evaluate` in `core/vba/**`) |
| T-SEC-7 | H-PROTO JSON through `Json.Document` | `Object.prototype` is unchanged; the record has the fields `__proto__` and `constructor` |
| T-SEC-8 | Download names for `../a<b>.xlsm`, a 400-character name, and RTL override characters | Sanitized as specified |
| T-PRIV-1 | Playwright records all requests while loading the app, loading every fixture, running every runnable query, exporting everything, and downloading | Every request URL is same-origin and is one of the static asset paths in the SW manifest; zero requests after the initial asset load |
| T-PRIV-2 | Monkeypatch `fetch`, `XMLHttpRequest.prototype.open`, `navigator.sendBeacon`, and `WebSocket` to throw after app init | The full E2E suite still passes |
| T-PRIV-3 | After the full E2E run, inspect `localStorage`, `sessionStorage`, IndexedDB databases, cookies, and the Cache API | Only `quoin.theme` and the SW static cache exist; the SW cache contains only manifest assets |
| T-PRIV-4 | The SW `fetch` handler, given a cross-origin request or a `blob:` URL | Not intercepted or cached |
| T-PRIV-5 | CSP header and meta present; a violation report listener records zero violations during E2E | Zero |

### 14.8 End-to-end (Playwright, all three engines)

| ID | Scenario |
|---|---|
| T-E2E-1 | The empty state renders the mark, tagline, drop zone, and privacy line; there are no console errors |
| T-E2E-2 | Drag-and-drop F-MIXED → rail shows 3 queries and 4 modules; status `3 queries · 4 modules` |
| T-E2E-3 | Select a query → editor shows the exact text; Ctrl+Enter → grid shows the rows; status shows the row count and time; compare shows a match |
| T-E2E-4 | Step preview: clicking the second step shows the intermediate result |
| T-E2E-5 | Edit a query (add `Table.FirstN(…, 10)`) → edited dot; run → 10 rows; compare → differs; Download → the file downloads; re-open the downloaded file in Quoin → the edit is present; the other queries are unchanged |
| T-E2E-6 | Edit a VBA module → Download → re-open → the edit is present, and the attribute lines are absent in the view but present in the `.bas` export |
| T-E2E-7 | Signed VBA → Download is gated by the "I understand" checkbox |
| T-E2E-8 | F-PQ-CSV → run → binding dialog → choose `sales.csv` → result; `Sources` lists the mapping; clearing it causes the dialog to reappear on the next run |
| T-E2E-9 | Unsupported function → inline error naming the function, with the editor squiggle at the call |
| T-E2E-10 | Cancel a long run with Esc |
| T-E2E-11 | Export each format; downloaded file names and contents match golden files |
| T-E2E-12 | Revert an edited item → the dot clears; Download is disabled again when no edits remain |
| T-E2E-13 | `beforeunload` prompt appears only with unsaved edits |
| T-E2E-14 | Keyboard-only run of T-E2E-3 and T-E2E-5 (no mouse events) |
| T-E2E-15 | Offline: load once, go offline (`context.setOffline(true)`), reload → the app works, including fonts |
| T-E2E-16 | Theme toggle persists across a reload; system theme follows emulated `prefers-color-scheme` |
| T-E2E-17 | Mobile viewport 390×844: segmented control; run and download work |
| T-E2E-18 | A refused file (F-ENC) shows its message inline in the drop zone and keeps the drop zone usable |
| T-E2E-19 | Post-write self-check failure (inject a fault with the query flag `?selfcheck=fail`, which the app reads only when `location.hostname` is `localhost` or `127.0.0.1` and ignores everywhere else; T-LINT adds a check that this is the only query flag read) → nothing is downloaded and the message is shown |

### 14.9 Accessibility, visual, performance

| ID | Test | Pass |
|---|---|---|
| T-A11Y-1 | axe-core on the empty state, the workspace with a query, a VBA module, every dialog, and both themes | Zero violations |
| T-A11Y-2 | Focus visible on every interactive element (screenshot diff with forced `:focus-visible`) | Ring present |
| T-A11Y-3 | A script computes contrast for every token pair used (from a declared usage map in `tests/a11y/pairs.json`) | All pairs meet C-1 |
| T-A11Y-4 | `prefers-reduced-motion` → computed transition durations of 0 | Pass |
| T-A11Y-5 | Screen reader smoke test (manual, VoiceOver + NVDA): rail navigation, run, and result announcement | Checklist signed |
| T-VIS-1 | Screenshot baselines: empty state, drag-over, workspace (query), workspace (VBA), error state, download popover, binding dialog, settings, mobile; light and dark | Pixel diff ≤ 0.1% |
| T-VIS-2 | The favicon renders at 16, 32, and 180 px (screenshot of the `<link rel=icon>` rendered in a test page) | Baseline match |
| T-PERF-1 | Cold load (no cache) on simulated "Fast 3G", 4× CPU slowdown | Interactive in under 2.5 s; total transfer under 400 KB, fonts included |
| T-PERF-2 | Open a 20 MB F-MIXED-large (generated) | Queries and modules listed in under 2 s on a reference laptop (Chromium, M1/Ryzen 5) |
| T-PERF-3 | Grid with 1,000,000 × 12 synthetic rows | Scroll at ≥ 55 fps average across a 5-second scripted scroll |
| T-PERF-4 | Editor with a 10,000-line query: typing latency | 95th percentile keypress-to-paint under 16 ms |
| T-PERF-5 | Run F-PQ-TRANSFORMS (all queries) | Total under 3 s |

### 14.10 Manual verification in Excel (gate for releases)

Run these on Windows Excel 365 (current channel) and Excel for Mac, and record the results in `docs/observations.md` with the date and build number.

| ID | Check |
|---|---|
| MX-1 | Download F-MIXED with **no** edits → opens with no repair prompt; everything is identical (spot-check the pivot, chart, and conditional formatting) |
| MX-2 | Edit one query in F-PQ-MULTI → opens with no repair prompt; Data → Queries & Connections shows the edit; Refresh All succeeds; the table updates |
| MX-3 | Record permission behaviour after edit (privacy prompts, native query prompts) |
| MX-4 | Edit Module1 in F-VBA-1 → opens; VBE shows the edit; Debug → Compile succeeds; the macro runs; forms open |
| MX-5 | Same as MX-4 for F-VBA-1250 and F-VBA-FORM |
| MX-6 | New .xlsx export opens with correct cell types |
| MX-7 | F-VBA-SIGNED after an edit → Excel treats the project as unsigned (Trust Center behaviour noted) |
| MX-8 | `refreshOnLoad` → Excel refreshes on open |
| MX-9 | LibreOffice Calc opens the edited F-MIXED without errors (the queries are ignored by LibreOffice; this is a preservation sanity check only) |
| MX-10 | M5: print preview page breaks vs Excel PDF for each F-PRINT fixture |

---

## 15. Error codes

| Code | Message (strings.js) |
|---|---|
| `file.tooLarge` | `This file is larger than 200 MB.` |
| `file.notWorkbook` | `This is not an Excel workbook.` |
| `file.encrypted` | `This workbook is encrypted. Remove the password in Excel first.` |
| `file.xls` | `Legacy .xls files are not supported. Save as .xlsx or .xlsm in Excel.` |
| `file.xlsb` | `Binary workbooks (.xlsb) are not supported.` |
| `file.strict` | `Strict Open XML workbooks are not supported.` |
| `file.ods` | `OpenDocument spreadsheets are not supported.` |
| `zip.*` | `The file is damaged and could not be read.` (the details include the code and entry) |
| `limit.*` | `This file is too large or too deeply compressed to open safely.` |
| `xml.doctype` | `This file contains XML features Quoin does not open.` |
| `pq.none` | `No Power Query queries in this workbook.` (neutral info, not an error) |
| `pq.format` | `This workbook's query data uses a format Quoin does not write.` |
| `vba.none` | `No VBA in this workbook.` (neutral) |
| `vba.unreadable` | `Could not read the VBA project.` |
| `vba.locked` | `This VBA project is locked in Excel. Shown read-only.` |
| `vba.codepage` | `This character cannot be saved in code page {cp}.` |
| `m.parse` | `{message} Line {line}, column {col}.` |
| `m.unsupported` | `{name} is not available in Quoin.` |
| `m.offline` | `{name} is not available offline. Map it to a local file.` |
| `m.timeout` | `Stopped after {s} s.` |
| `m.rows` | `Stopped at {n} rows.` |
| `m.depth` | `Stopped: recursion is too deep.` |
| `write.selfcheck` | `The file could not be written safely. Nothing was downloaded.` |

---

## 16. Milestones and gates

| Milestone | Scope | Gate (all must pass) |
|---|---|---|
| **M0 — Foundations** | Tokens, base styles, empty state, mark/favicon, feature detection, CSP, SW, strings, lint suite | T-LINT-*, T-E2E-1, T-E2E-15, T-E2E-16, T-A11Y-1 (empty state), T-VIS-1 (empty), T-PRIV-1 (shell), T-PERF-1 |
| **M1 — Read** | ZIP/OPC/XML, detection, PQ extraction, VBA extraction, rail, read-only editor with highlighting | T-CRC, T-ZIP-*, T-XML-*, T-DETECT-*, T-PQ-1…5, T-PQ-RT-1, T-OVBA-1/3, T-CFB-1/2, T-VBA-DIR-1, T-VBA-1/3/5, T-SEC-1…4, T-E2E-2, T-E2E-18 |
| **M2 — Edit and write** | Editable editor, PQ writeback, VBA writeback, CFB writer, OVBA compressor, download with self-check, code exports | T-PQ-EDIT-*, T-PQ-RT-2, T-OVBA-2/4, T-CFB-RT-1, T-CFB-RB-1, T-VBA-2/4/6, T-VBA-WB-*, T-ZIP-RT-1, T-ZIP-W-1, T-EXP-5/6, T-E2E-5/6/7/12/13/19, **MX-1, MX-2, MX-3, MX-4, MX-5, MX-7, MX-8** |
| **M3 — Run** | Lexer, parser, evaluator, Tier A library, Excel.CurrentWorkbook, bindings, worker, grid, step preview, compare | T-M-*, T-CMP-*, T-SEC-5/7, T-E2E-3/4/8/9/10, T-PERF-2/3/5, **T-M-ORACLE-1** |
| **M4 — Export and polish** | Result exports, settings, mobile layout, full a11y/visual pass, Tier B | T-EXP-*, T-E2E-11/14/17, T-A11Y-*, T-VIS-*, T-PERF-4, T-PRIV-*, MX-6, MX-9 |
| **M5 — Print preview (optional)** | §11 | F-PRINT oracle: 90% of pages with identical breaks; header/footer text identical; MX-10 |

---

## 17. Out of scope for v1 (tracked for later)

- Renaming, adding, deleting, or duplicating queries.
- Adding, removing, or renaming VBA modules; editing UserForm layouts.
- Writing query results back into the workbook's cached tables.
- Network-enabled connectors (would require a separate, explicit "network mode" build with its own CSP, and is not planned).
- `.xlsb` support.
- Diff view between the original and edited code (a candidate for v1.1, and the cheapest high-value addition).
- Desktop packaging (the PWA install covers this).

---

## 18. Definition of done (per change)

A change is done when all of the following hold:

1. The relevant spec IDs are implemented as written, or this document was updated first in the same change, with the reason in `docs/decisions.md`.
2. Its tests exist and pass in Chromium, Firefox, and WebKit.
3. The lint suite passes. In particular: no comments, no raw colours or spacing, no unsafe DOM APIs, and no network calls.
4. No new runtime dependency.
5. Visual baselines are updated only intentionally, with before/after screenshots attached to the change.
6. User-facing copy is added to `strings.js` and follows §2.7.
7. The README is updated if behaviour, entry points, or limits changed.
8. For anything that touches writeback: the relevant MX checks are re-run in real Excel and recorded.

---

## 19. README outline (to be written in M0 and kept current)

1. What Quoin does (three sentences).
2. Privacy: what happens to your file (nothing leaves the tab), and what is stored (the theme only).
3. Running locally: `npm run serve` → `http://localhost:5173`. Explain why `file://` does not work.
4. Deploying: any static host with HTTPS. The required headers are in §3.2.
5. Supported files and the refusal list.
6. What "run" means: the M subset, source bindings, the link to `docs/m-coverage.md`.
7. Editing VBA: p-code is dropped, signatures are removed, and locked projects are read-only.
8. Known differences from Excel (from `docs/observations.md`).
9. Tests: how to run them, and how to add a fixture.

---

## 20. References

- [MS-QDEFF] Query Definition File Format — Microsoft Open Specifications.
- [MS-OVBA] Office VBA File Format Structure — Microsoft Open Specifications.
- [MS-CFB] Compound File Binary File Format — Microsoft Open Specifications.
- [ECMA-376] Office Open XML File Formats, Part 1 (SpreadsheetML) and Part 2 (OPC).
- [MS-OFFCRYPTO] Office Document Cryptography Structure (detection only).
- Power Query M Language Specification and M Function Reference — Microsoft Learn.
- APPNOTE.TXT — .ZIP File Format Specification (PKWARE).
- WCAG 2.2.
