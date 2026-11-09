# Observations

This file records what has been observed, and what is still waiting to be observed in real Excel.

## Checked in this build

These were checked against files saved by real Excel (see `tests/fixtures/external/NOTICE.md`) and against independent tools.

- The DataMashup binary of three Excel-saved workbooks parses, and rebuilds byte-identically when nothing is edited. `customXml/item1.xml` is UTF-16 little-endian with a byte order mark in all three.
- The permission-bindings and metadata sections are copied unchanged on write.
- Excel-saved `vbaProject.bin` files read: code page 1252, project protection decrypts to state 0, module offsets and names read correctly.
- Our OVBA compressor reproduces the three worked examples from MS-OVBA section 3.2 byte for byte, and `oletools` decompresses what we write.
- Rewritten VBA projects are read back by `oletools` (olevba) with the edited source, and `olefile` opens every compound file we write.
- Saved workbooks are accepted by Python's `zipfile`, `unzip -t`, `openpyxl`, and LibreOffice (headless conversion).
- Queries from three Excel-authored workbooks run against the workbook's own data and agree with the tables Excel cached (apart from time-dependent columns).
- A new `.xlsx` written by the exporter is read back by our own reader and by `openpyxl`.

## Waiting for real Excel

None of the manual checks in spec section 14.10 has been run.

| ID | Status |
| --- | --- |
| MX-1 | Not run |
| MX-2 | Not run |
| MX-3 | Not run. Writes `PermissionBindings` unchanged. If Excel rejects an edited file, write length 0 and test again |
| MX-4 | Not run |
| MX-5 | Not run |
| MX-6 | Not run |
| MX-7 | Not run |
| MX-8 | Not run |
| MX-9 | LibreOffice opens an edited workbook (headless conversion succeeds). Not compared visually |
| MX-10 | Chromium on Linux: the PDF produced from the preview has the preview's page count and the A4 landscape and Letter portrait media boxes (T-P-14b). Not run: a physical printer, Firefox, WebKit |

## Behaviour chosen from documentation, not yet observed

Each of these should be confirmed in Excel and then recorded here with the build number.

- Rounding: `Number.Round` and `Int64.From` use `ToEven` by default.
- Number to text: shortest round-trip digits, with scientific notation from 1E+15 and below 1E-05, and `-0` printed as `0`.
- Text from dates uses the run culture's short date and long time patterns.
- `Excel.CurrentWorkbook`: order is tables in sheet order, then workbook-level names. Date-formatted cells come back as `datetime`, time-only and elapsed formats as `duration`. Error cells become error values.
- `Excel.Workbook`: a sheet's data starts at A1 and runs to the last used row and column.
- `Csv.Document`: empty unquoted fields are `null`.
- `Table.PromoteHeaders`: duplicate headers get `.1`, `.2` suffixes.
- `Table.Join`: right outer joins list rows in the right table's order; duplicate column names raise an error.
- Query groups: read from the `QueryGroups` entry of the `AllFormulas` item as JSON. The real encoding has not been seen, so groups may be missing.
- Project protection: a project counts as locked when the decrypted protection state has the user or VBE bit set. Projects with a password but no view lock may be shown read-only.
- Load badges come from `FillEnabled`, `FillToDataModelEnabled`, `LoadedToAnalysisServices`, the connection's `Location`, and the query table link.
- `refreshOnLoad` is set on the connection of each edited query.
- `List.Mode` returns the first of several equally frequent values.
- `Text.Proper` capitalises after any character that is not a letter, digit or apostrophe.

## Known gaps

- Print: paper and orientation depend on the `page` property, which is checked in Chromium only.
- The data model (`xl/model`) is never read.
- Firefox and WebKit have not been run: their browser downloads are blocked in the build sandbox.
- Locked and DBCS code page projects have no real fixtures; their rules are covered by unit tests with synthetic input only.

## What a browser can and cannot do when printing

Possible, reliably: paper size and orientation through `@page`; forced breaks; keeping an element off a break; repeating a `<thead>` on every page in Chromium, Firefox and WebKit; printing colours when background graphics are on (`print-color-adjust: exact` asks for it, it does not guarantee it).

Not possible from a page, in any browser: reading or setting the printer, tray, duplex or copies; knowing the paper or orientation the user picked in the dialog; a footer row repeated at the bottom of every page; page numbers through CSS margin boxes; knowing the page count before printing; starting the dialog without a user gesture. quoin answers the repeated bottom rows and the page numbers by building the pages itself (decision 22).

## Print matrix (Chromium on Linux, headless)

| Check | Result |
| --- | --- |
| Page count matches the preview | 40 of 40 pages at A4 landscape, 20 of 20 at Letter portrait (T-P-14b) |
| `@page size` honoured | A4 landscape 841.9 by 595.3 pt and Letter 612 by 792 pt media boxes |
| Repeated bottom rows sit at the bottom of the page | Within 2 px of the foot on the last, short page (T-P-05b) |
| Repeated header | Real `<thead>`; also drawn by quoin on every page |
| Background graphics | Requested with `printBackground`; the user's dialog decides in a real browser |
| Printed on paper | Not run |
| Firefox and WebKit | Not run |
