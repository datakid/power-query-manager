# Third-party fixtures

These files are test inputs only and are not shipped with the app.

| File | Source | Licence |
| --- | --- | --- |
| `ms_template_query.xlsx` | Decoded from `src/workbookTemplate.ts` in github.com/microsoft/connected-workbooks | MIT |
| `pq_simple.xlsx`, `pq_vba_complex.xlsm`, `plain_table.xlsx`, `binary.xlsb` | github.com/ewc3labs/excel-power-query-editor, `test/fixtures` | MIT |
| `xw_*.xlsm`, `xw_vbaProject*.bin` | github.com/jmcnamara/XlsxWriter, `xlsxwriter/test/comparison/xlsx_files` | BSD 2-Clause |

The files from `ewc3labs/excel-power-query-editor` were re-zipped by that project's tooling (stored entries, 1980 dates). Their DataMashup and VBA payloads are as saved by Excel.
