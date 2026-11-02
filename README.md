# quoin

The working parts of a workbook.

Quoin opens an Excel `.xlsx` or `.xlsm` file in your browser and shows its Power Query queries and VBA macros. You can edit them, run the queries, compare the result with what Excel last loaded, and download a workbook that differs from the original only in the parts you changed.

## Privacy

Your file never leaves the tab. Quoin makes no network requests after the page and its assets load, sets a Content Security Policy that forbids them, and stores one thing: your theme choice, under the key `quoin.theme` in local storage. There are no cookies, no analytics, and no databases.

## Running locally

```
npm install
npm run serve
```

Then open `http://localhost:5173`. The app needs an origin because it uses a module worker and a service worker, so opening `index.html` from `file://` does not work.

## Deploying

`npm run build` writes the site to `dist/` and refreshes `asset-manifest.json`, which the service worker uses to cache the app for offline use. Publish the contents of `dist/` on any static host that serves over HTTPS, and turn on gzip or brotli: the first load is about 160 KB compressed and about 490 KB raw.

The repository root is not the site root. Hosts that default to a folder named `public` will serve only the fonts and icons and answer 404 at `/`, so set the output directory to `dist`.

- **Vercel:** `vercel.json` already sets the build command, the output directory and the security headers.
- **Netlify or Cloudflare Pages:** build command `npm run build`, publish directory `dist`. The headers in `_headers` use their format.
- **Anything else:** send the headers listed in `vercel.json`. Browsers ignore `frame-ancestors` in a meta tag, so it must come from the host.

Remove the old prototype files (`js/`, `vendor/`, and any fonts in `public/fonts/` other than the Atkinson Hyperlegible Next and Commit Mono files). Everything under `public/` is cached by the service worker, so leftovers are downloaded for nothing.

## Supported files

Opens `.xlsx`, `.xlsm`, `.xltx`, `.xltm`. Refuses, with a specific message: `.xls`, `.xlsb`, OpenDocument, Strict Open XML, password-protected workbooks, and anything that is not a workbook. Refuses archives that look like zip bombs (more than 20,000 entries, 1 GB inflated, 200 MB file size, or an implausible compression ratio) and XML that declares a DOCTYPE or entities.

## What "run" means

Queries run in a worker with a purpose-built interpreter for the M language: lexer, parser, lazy evaluator and a library of 500+ functions. See `docs/m-coverage.md` for the list. Sources that need the outside world are never fetched. `Excel.CurrentWorkbook` reads the open workbook. `File.Contents` and `Web.Contents` stop the run and ask you to choose a local file; the mapping is listed under the result and lasts for the tab's lifetime. Database and web connectors raise an error that names the function.

Results are compared with the table Excel last loaded for that query. Queries that depend on the clock or on random numbers are marked and not compared.

## Editing VBA

VBA is shown and edited, never run. Writing a module drops the compiled p-code and the caches in the project, so Excel recompiles from source on open. A digital signature on the project is removed after you confirm it. A project that is locked for viewing, uses an unsupported code page, or does not parse cleanly is shown read-only.

## What changes in a downloaded file

Only the parts you edited, and nothing else. Untouched parts are copied as their original compressed bytes. After writing, Quoin reads its own output back and checks every edit and every untouched part before offering the download. If the check fails, nothing is downloaded. Queries you edited get `refreshOnLoad` set unless you turn that off, because the cached table keeps its old values until Excel refreshes.

## Known differences from Excel

See `docs/observations.md`. In short: this build has not been run against real Excel. The list of checks to run there is in that file.

## Tests

```
npm test             lint, unit, and browser tests
npm run test:unit    node --test, no browser needed
npm run test:lint    no comments, no remote imports, tokens-only CSS, strings rules
npm run test:browser Playwright (Chromium)
npm run fixtures     regenerate the synthetic fixtures
```

To add a fixture, put the workbook under `tests/fixtures/` and describe where it came from in `tests/fixtures/workbooks/README.md`. Prefer workbooks saved by real Excel.

## Layout

```
index.html, sw.js, manifest.webmanifest, _headers
src/core        pure logic: zip, xml, opc, cfb, ovba, power query, m engine, exports
src/ui          editor, grid, dialogs, strings
src/app         session, workspace, runner, main
src/workers     the M worker
styles          tokens and component styles
tests           unit, e2e, a11y, lint, fixtures
docs            the spec, decisions, observations, generated M coverage
```
