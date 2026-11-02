# Generated fixtures

These files are produced by `npm run fixtures` (`tests/fixtures/generators/build.js`) from the Excel-saved workbooks in `../external`. They are synthetic: no Excel build produced them, and they should be replaced by Excel-authored files when possible.

| File | Made from | Purpose |
| --- | --- | --- |
| `mixed.xlsm` | `pq_vba_complex.xlsm` with the VBA project of `xw_vbaProject05.bin` | Three queries and three modules |
| `signed.xlsm` | `mixed.xlsm` plus signature parts | Signature gating |
| `encrypted.xlsx` | A compound file with `EncryptionInfo` and `EncryptedPackage` | Refusal message |
| `csv-query.xlsx` | `pq_simple.xlsx` plus a `Sales` query using `File.Contents` | Source bindings |
| `unsupported.xlsx` | `pq_simple.xlsx` plus a `Sql.Database` query | Unsupported function error |
| `long-run.xlsx` | `pq_simple.xlsx` plus a very slow query | Cancel |
| `big-grid.xlsx` | `pq_simple.xlsx` plus a 1,000,000 by 12 query | Grid performance |
| `sales.csv` | Hand written | CSV binding |
