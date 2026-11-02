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
| MX-10 | Not applicable: print preview is not built |

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

- Print preview is not built.
- The data model (`xl/model`) is never read.
- Firefox and WebKit have not been run.
- Locked and DBCS code page projects have no real fixtures; their rules are covered by unit tests with synthetic input only.
