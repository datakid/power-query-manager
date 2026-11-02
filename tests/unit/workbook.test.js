import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkbook } from '../../src/core/workbook.js';
import { DEFAULT_LIMITS } from '../../src/core/limits.js';
import { readTable, parseRange, colToIndex, indexToCol, parseCellRef, listCurrentWorkbookSources } from '../../src/core/cells.js';
import { classifyFormat, serialToParts } from '../../src/core/numfmt.js';
import { buildSnapshot, buildBindingWorkbook } from '../../src/core/snapshot.js';
import { runQuery, serializeValue } from '../../src/core/m/engine.js';
import * as h from '../fixtures/generators/hostile.js';
import { fixture, plain, baseOptions } from './helpers.js';

const open = (bytes, name = 'x.xlsx') => openWorkbook(bytes, name);

test('T-FMT-*: unsupported and non-workbook files are classified with specific codes', async () => {
  const cases = [
    [h.xlsbLike(), 'file.xlsb'],
    [h.odsLike(), 'file.ods'],
    [h.xlsLike(), 'file.xls'],
    [h.encryptedOffice(), 'file.encrypted'],
    [h.strictWorkbook(), 'file.strict'],
    [h.notAWorkbook(), 'file.notWorkbook'],
    [h.zipNoEocd(), 'file.notWorkbook']
  ];
  for (const [bytes, code] of cases) {
    await assert.rejects(async () => open(await bytes), (e) => e.code === code, code);
  }
  await assert.rejects(() => open(fixture('binary.xlsb'), 'b.xlsb'), (e) => e.code === 'file.xlsb');
});

test('T-SEC-1: a workbook with a DOCTYPE part is refused with xml.doctype', async () => {
  await assert.rejects(async () => open(await h.xmlDoctype()), (e) => e.code === 'xml.doctype');
});

test('oversized input is refused before parsing', async () => {
  await assert.rejects(() => openWorkbook(new Uint8Array(100), 'x', { ...DEFAULT_LIMITS, maxFileBytes: 10 }), (e) => e.code === 'file.tooLarge');
});

test('cell reference helpers', () => {
  assert.equal(colToIndex('A'), 0);
  assert.equal(colToIndex('AA'), 26);
  assert.equal(indexToCol(701), 'ZZ');
  assert.deepEqual(parseCellRef('$B$3'), { col: 1, row: 2 });
  assert.deepEqual(parseRange('A1:C4'), { r1: 0, c1: 0, r2: 3, c2: 2 });
  assert.equal(parseRange('nonsense'), null);
});

test('number-format classification for dates, durations and plain numbers', () => {
  assert.equal(classifyFormat(14), 'datetime');
  assert.equal(classifyFormat(0), 'number');
  assert.equal(classifyFormat(164, 'yyyy-mm-dd'), 'datetime');
  assert.equal(classifyFormat(164, '#,##0.00'), 'number');
  assert.equal(classifyFormat(164, '0.0%'), 'number');
  assert.equal(classifyFormat(164, '"day" 0'), 'number');
  assert.equal(classifyFormat(164, '[h]:mm:ss'), 'duration');
  assert.equal(classifyFormat(164, '[$-409]d-mmm;@'), 'datetime');
  assert.equal(classifyFormat(164, '0.00E+00'), 'number');
  assert.deepEqual(serialToParts(43831, false), { year: 2020, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  assert.equal(serialToParts(1, true).year, 1904);
});

test('real tables read with typed cells', async () => {
  const wb = await open(fixture('pq_simple.xlsx'));
  const t = wb.tables.find((x) => x.tableType === 'queryTable') || wb.tables[0];
  const data = await readTable(wb, t);
  assert.ok(data.columns.length > 1);
  assert.ok(data.rows.length >= 2);
  assert.ok(data.rows.some((r) => r.some((c) => c && c.t === 'n')));
  assert.ok(data.rows.some((r) => r.some((c) => c && c.t === 's')));
});

test('current-workbook sources list tables and workbook-level names', async () => {
  const wb = await open(fixture('pq_vba_complex.xlsm'));
  const sources = listCurrentWorkbookSources(wb);
  assert.ok(sources.some((s) => s.kind === 'table'));
  assert.ok(sources.some((s) => s.name === 'InputText' && s.kind === 'name'));
});

test('T-RUN-1: real queries evaluate and agree with the results cached in the workbook', async () => {
  for (const f of ['pq_simple.xlsx', 'pq_vba_complex.xlsm']) {
    const wb = await open(fixture(f), f);
    const snapshot = await buildSnapshot(wb);
    for (const q of wb.queries) {
      if (q.load.kind !== 'table') continue;
      const r = await runQuery({ ...baseOptions, sectionText: wb.mashup.section.text, queryName: q.name, snapshot });
      assert.equal(r.status, 'ok', `${f}:${q.name} ${JSON.stringify(r.error || r.code || r.status)}`);
      assert.equal(r.result.kind, 'table');
      const cachedTable = wb.tables.find((t) => t.displayName === q.load.tableName);
      const cached = await readTable(wb, cachedTable);
      const got = plain(r.result.value);
      assert.deepEqual(got.columns, cached.columns, `${q.name} columns`);
      assert.equal(got.rows.length, cached.rows.length, `${q.name} row count`);
      const volatile = got.columns.map((c, i) => got.rows.some((row) => typeof row[i] === 'string' && row[i].startsWith('datetime:2026')));
      got.rows.forEach((row, ri) => row.forEach((v, ci) => {
        if (volatile[ci]) return;
        const c = cached.rows[ri][ci];
        const cv = c === null ? null : c.v;
        if (typeof v === 'string' && v.startsWith('date')) return;
        assert.equal(v, cv, `${q.name} r${ri} c${ci}`);
      }));
    }
  }
});

test('function queries are reported as functions', async () => {
  const wb = await open(fixture('pq_vba_complex.xlsm'));
  const snapshot = await buildSnapshot(wb);
  const r = await runQuery({ ...baseOptions, sectionText: wb.mashup.section.text, queryName: 'fGetNamedRange', snapshot });
  assert.equal(r.status, 'ok');
  assert.equal(r.result.kind, 'function');
  assert.equal(r.result.arity, 1);
});

test('need-binding round trip: File.Contents asks for the file and then continues', async () => {
  const section = 'section Section1;\r\n\r\nshared Q = Table.PromoteHeaders(Csv.Document(File.Contents("C:\\data\\x.csv")));';
  const asked = [];
  const r = await runQuery({ ...baseOptions, sectionText: section, queryName: 'Q' }, async (kind, key) => {
    asked.push([kind, key]);
    return { bytes: new TextEncoder().encode('a,b\r\n1,2\r\n') };
  });
  assert.deepEqual(asked, [['file', 'C:\\data\\x.csv']]);
  assert.equal(r.status, 'ok');
  assert.deepEqual(plain(r.result.value), { columns: ['a', 'b'], rows: [['1', '2']] });
  const none = await runQuery({ ...baseOptions, sectionText: section, queryName: 'Q' }, async () => null);
  assert.equal(none.status, 'error');
});

test('Excel.Workbook reads a bound workbook through the binding snapshot', async () => {
  const other = await open(fixture('plain_table.xlsx'));
  const data = await buildBindingWorkbook(other);
  assert.ok(data.items.some((i) => i.kind === 'Sheet'));
  const section = 'section Section1;\r\n\r\nshared Q = Excel.Workbook(File.Contents("other.xlsx"), true){0}[Data];';
  const r = await runQuery({ ...baseOptions, sectionText: section, queryName: 'Q', bindings: new Map([['other.xlsx', { bytes: new Uint8Array(0), workbook: data }]]) });
  assert.equal(r.status, 'ok');
  assert.equal(r.result.kind, 'table');
});

test('serialization marks specials and nested values', () => {
  const v = serializeValue(NaN, 0, { maxRows: 5 });
  assert.deepEqual(v, { k: 'number', special: 'NaN' });
});
