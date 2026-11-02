import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tableToDelimited } from '../../src/core/export/csv.js';
import { tableToJson, valueToJson } from '../../src/core/export/json.js';
import { tableToXlsx } from '../../src/core/export/xlsx.js';
import { sanitizeFileName, zipFiles, queryFile, moduleFile } from '../../src/core/export/files.js';
import { sameCell, compareWithCache } from '../../src/core/compare/cache-compare.js';
import { readZip } from '../../src/core/zip-read.js';
import { openWorkbook } from '../../src/core/workbook.js';
import { readUsedGrid } from '../../src/core/cells.js';
import { runOnce } from '../../src/core/m/engine.js';
import { baseOptions } from './helpers.js';

function table(body) {
  const r = runOnce({ ...baseOptions, sectionText: `section Section1;\r\n\r\nshared Q = ${body};`, queryName: 'Q' });
  assert.equal(r.status, 'ok');
  return r.value;
}

const text = (bytes) => new TextDecoder().decode(bytes);

test('CSV: quoting, nulls, dates and the injection guard', () => {
  const t = table('#table({"a,b","c"}, {{"x""y", null}, {"=SUM(A1)", #date(2020,1,2)}, {"line#(lf)break", 1.5}, {" pad", true}})');
  assert.equal(text(tableToDelimited(t)), '"a,b",c\r\n"x""y",\r\n\'=SUM(A1),2020-01-02\r\n"line\nbreak",1.5\r\n" pad",true\r\n');
  assert.equal(text(tableToDelimited(t, { guard: false })).includes("'=SUM"), false);
  assert.deepEqual([...tableToDelimited(t, { bom: true }).subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.equal(text(tableToDelimited(t, { delimiter: '\t' })).split('\r\n')[0], '"a,b"\tc'.replace('"a,b"', 'a,b'));
});

test('CSV: error cells export as Error and durations as text', () => {
  const t = table('Table.TransformColumnTypes(#table({"A","D"}, {{"x", #duration(1,2,3,4)}}), {{"A", type number}})');
  assert.equal(text(tableToDelimited(t)), 'A,D\r\nError,1.02:03:04\r\n');
});

test('JSON: records keep types, order and nested structures', () => {
  const t = table('#table({"n","t","d","l","r"}, {{1, "a", #datetime(2020,1,2,3,4,5), {1,2}, [k=1]}})');
  assert.equal(text(tableToJson(t)), '[{"n":1,"t":"a","d":"2020-01-02T03:04:05","l":[1,2],"r":{"k":1}}]');
  assert.equal(text(valueToJson(table('#table({"a"},{{1}})'))), '[{"a":1}]');
});

test('XLSX: a new workbook round-trips values, dates and booleans through our reader', async () => {
  const t = table('#table({"Name","Qty","When","Ok","Gap"}, {{"x", 2.5, #datetime(2020,1,2,12,0,0), true, null}, {"<&>", -1, #date(2021,3,4), false, null}})');
  const bytes = await tableToXlsx(t);
  assert.ok(readZip(bytes).has('xl/styles.xml'));
  const wb = await openWorkbook(bytes, 'out.xlsx');
  const grid = await readUsedGrid(wb, 'Result');
  assert.deepEqual(grid[0].map((c) => c.v), ['Name', 'Qty', 'When', 'Ok', 'Gap']);
  assert.deepEqual(grid[1].slice(0, 2).map((c) => c.v), ['x', 2.5]);
  assert.equal(grid[1][2].t, 'dt');
  assert.equal(grid[1][2].v, 43832.5);
  assert.equal(grid[1][3].v, true);
  assert.equal(grid[2][0].v, '<&>');
  assert.equal(grid[2][2].v, 44259);
});

test('XLSX: openpyxl reads the file we wrote', { skip: spawnSync('python3', ['-c', 'import openpyxl']).status !== 0 }, async () => {
  const t = table('#table({"A","B"}, {{"x", 1}, {"y", 2.5}})');
  const file = join(mkdtempSync(join(tmpdir(), 'q-')), 'o.xlsx');
  writeFileSync(file, await tableToXlsx(t));
  const r = spawnSync('python3', ['-c', 'import sys, openpyxl\nws=openpyxl.load_workbook(sys.argv[1]).active\nprint([[c.value for c in row] for row in ws.iter_rows()])', file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "[['A', 'B'], ['x', 1], ['y', 2.5]]");
});

test('file names are sanitised and made unique inside zips', async () => {
  assert.equal(sanitizeFileName('a/b:c*?.m', '.m'), 'a_b_c__.m');
  assert.equal(sanitizeFileName('..hidden', '.m'), 'hidden.m');
  assert.equal(sanitizeFileName('', '.csv'), 'file.csv');
  assert.equal(sanitizeFileName('Report.csv', '.csv'), 'Report.csv');
  assert.ok(sanitizeFileName('x'.repeat(300), '.bas').length <= 120);
  const zip = await zipFiles([{ name: 'a.m', data: new Uint8Array(1) }, { name: 'A.m', data: new Uint8Array(1) }]);
  assert.deepEqual(readZip(zip).entries.map((e) => e.name), ['a.m', 'A (2).m']);
});

test('code files use CRLF and the project code page', () => {
  assert.equal(text(queryFile('Q', 'let\n a = 1\nin\n a').data), 'let\r\n a = 1\r\nin\r\n a');
  const std = moduleFile({ name: 'Module1', kind: 'standard' }, 'Attribute VB_Name = "Module1"\nSub A()\nEnd Sub\n', 1252);
  assert.equal(std.name, 'Module1.bas');
  assert.equal(text(std.data), 'Attribute VB_Name = "Module1"\r\nSub A()\r\nEnd Sub\r\n');
  const cls = moduleFile({ name: 'C', kind: 'class' }, 'Attribute VB_Name = "C"\n', 1252);
  assert.ok(text(cls.data).startsWith('VERSION 1.0 CLASS\r\nBEGIN\r\n'));
  assert.equal(cls.name, 'C.cls');
  const accented = moduleFile({ name: 'M', kind: 'standard' }, "' café\n", 1252);
  assert.equal(accented.data[5], 0xE9);
  assert.equal(moduleFile({ name: 'F', kind: 'form' }, 'x', 1252).name, 'F.frm');
});

test('cache comparison tolerates float noise and one-second time drift', () => {
  assert.ok(sameCell(0.1 + 0.2, { t: 'n', v: 0.3 }));
  assert.ok(!sameCell(1, { t: 'n', v: 2 }));
  assert.ok(sameCell(null, null));
  assert.ok(!sameCell('', null));
  assert.ok(sameCell('a', { t: 's', v: 'a' }));
  assert.ok(!sameCell('a', { t: 's', v: 'A' }));
  const t = table('#table({"A","B"}, {{1, "x"}, {2, "y"}})');
  const cached = { columns: ['A', 'B'], rows: [[{ t: 'n', v: 1 }, { t: 's', v: 'x' }], [{ t: 'n', v: 2 }, { t: 's', v: 'z' }]] };
  const r = compareWithCache(t, cached);
  assert.equal(r.matches, false);
  assert.deepEqual(r.diffs, [[1, 1]]);
  assert.equal(compareWithCache(t, { columns: ['A'], rows: [] }).reason, 'columns');
  assert.equal(compareWithCache(t, { columns: ['A', 'B'], rows: [] }).reason, 'rows');
});
