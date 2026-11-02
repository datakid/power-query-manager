import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip } from '../../src/core/zip-read.js';
import { Package } from '../../src/core/opc.js';
import { parseXml } from '../../src/core/xml.js';
import { base64Decode, base64Encode, equalBytes, concat, le32, writeU32 } from '../../src/core/bytes.js';
import { parseDataMashup, buildDataMashup, readSection } from '../../src/core/pq/datamashup.js';
import { splitSection, rebuildSection, dominantEol, toViewText } from '../../src/core/pq/section.js';
import { parseMetadata, decodeEntryValue } from '../../src/core/pq/metadata.js';
import { parseConnectionString } from '../../src/core/pq/connections.js';
import { openWorkbook } from '../../src/core/workbook.js';
import { buildWorkbook } from '../../src/core/save.js';
import { checkSection } from '../../src/core/m/engine.js';
import { QuoinError } from '../../src/core/errors.js';
import { fixture } from './helpers.js';

const FILES = ['ms_template_query.xlsx', 'pq_simple.xlsx', 'pq_vba_complex.xlsm'];

async function rawMashup(file) {
  const pkg = new Package(readZip(fixture(file)));
  const t = await pkg.text('customXml/item1.xml');
  return { pkg, t, bytes: base64Decode(parseXml(t.text).root.text()) };
}

test('T-PQ-1: real DataMashup parses with version 0 and no warnings', async () => {
  for (const f of FILES) {
    const { bytes } = await rawMashup(f);
    const dm = parseDataMashup(bytes);
    assert.equal(dm.version, 0);
    assert.deepEqual(dm.warnings, []);
    assert.ok(dm.packageParts.has('Formulas/Section1.m'));
    assert.ok(dm.packageParts.has('Config/Package.xml'));
  }
});

test('T-PQ-RT-1: unedited DataMashup rebuilds byte-identically', async () => {
  for (const f of FILES) {
    const { bytes } = await rawMashup(f);
    const dm = parseDataMashup(bytes);
    assert.ok(equalBytes(await buildDataMashup(dm), bytes), f);
  }
});

test('item1.xml is UTF-16 with BOM and survives decode/encode', async () => {
  for (const f of FILES) {
    const { t } = await rawMashup(f);
    assert.equal(t.encoding, 'utf-16le');
    assert.equal(t.bom, true);
  }
});

test('T-PQ-4/5: bad length, trailing bytes and version are reported', async () => {
  const { bytes } = await rawMashup('pq_simple.xlsx');
  const over = bytes.slice();
  writeU32(over, 4, 0x7FFFFFFF);
  assert.throws(() => parseDataMashup(over), (e) => e instanceof QuoinError && e.code === 'pq.length');
  assert.deepEqual(parseDataMashup(concat([bytes, new Uint8Array([1, 2, 3])])).warnings, ['pq.trailing']);
  const ver = bytes.slice();
  writeU32(ver, 0, 1);
  assert.deepEqual(parseDataMashup(ver).warnings, ['pq.version']);
  assert.throws(() => parseDataMashup(bytes.subarray(0, 5)), (e) => e.code === 'pq.length');
});

test('T-SEC-3: a DataMashup with trailing bytes opens for reading but cannot be written', async () => {
  const { pkg, t } = await rawMashup('pq_simple.xlsx');
  const dmBytes = base64Decode(parseXml(t.text).root.text());
  const tampered = concat([dmBytes, new Uint8Array([9, 9])]);
  const doc = parseXml(t.text);
  const text = t.text.slice(0, doc.root.openEnd) + base64Encode(tampered) + t.text.slice(doc.root.closeStart);
  await pkg.setText('customXml/item1.xml', text, t);
  const wb = await openWorkbook(await pkg.write(), 'x.xlsx');
  assert.equal(wb.queries.length, 1);
  assert.ok(wb.warnings.some((w) => w.code === 'pq.trailing'));
  const q = wb.queries[0];
  await assert.rejects(() => buildWorkbook(wb, { queryEdits: new Map([[q.name, `${q.original}\n// x`]]) }), (e) => e.code === 'pq.format');
});

test('section splitter handles attributes, quoted names, comments and strings', () => {
  const text = 'section Section1;\r\n\r\n[ Description = "a;b" ] shared #"Top ; N" = let\r\n  x = "semi;colon" // ; shared\r\nin\r\n  x;\r\n\r\n/* c ; */ shared Q2 = {1, 2};\r\n\r\nQ3 = 3;';
  const r = splitSection(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.members.map((m) => [m.name, m.shared]), [['Top ; N', true], ['Q2', true], ['Q3', false]]);
  assert.equal(text.slice(r.members[1].exprStart, r.members[1].exprEnd), '{1, 2}');
  assert.ok(text.slice(r.members[0].start, r.members[0].end).startsWith('[ Description'));
});

test('T-PQ-SEC-3/4/5: editing one member leaves every other byte untouched and keeps EOL', async () => {
  const { bytes } = await rawMashup('pq_vba_complex.xlsm');
  const dm = parseDataMashup(bytes);
  const sec = await readSection(dm);
  const r = splitSection(sec.text);
  const target = r.members.find((m) => m.name === 'RawInput');
  const view = toViewText(sec.text.slice(target.exprStart, target.exprEnd));
  const out = rebuildSection(sec.text, r.members, new Map([['RawInput', `${view}\n// tail`]]));
  assert.equal(out.slice(0, target.exprStart), sec.text.slice(0, target.exprStart));
  assert.equal(out.slice(target.exprEnd + '\r\n// tail\r\n'.length), sec.text.slice(target.exprEnd));
  assert.ok(out.includes('\r\n// tail'));
  assert.equal(dominantEol('a\r\nb\r\nc\nd'), '\r\n');
  assert.equal(dominantEol('a\nb\nc\r\nd'), '\n');
  assert.equal(dominantEol('abc'), null);
});

test('metadata entries decode by type prefix', async () => {
  assert.deepEqual(decodeEntryValue('l1'), { kind: 'long', value: 1, raw: 'l1' });
  assert.equal(decodeEntryValue('sBg==').value, 'Bg==');
  assert.equal(decodeEntryValue('b1').value, true);
  assert.equal(decodeEntryValue('zzz').kind, 'unknown');
  const { bytes } = await rawMashup('pq_vba_complex.xlsm');
  const meta = parseMetadata(parseDataMashup(bytes).metadata.xml);
  assert.deepEqual([...meta.items.keys()].sort(), ['FinalTable', 'RawInput', 'fGetNamedRange']);
});

test('connection strings parse quoted and unquoted values', () => {
  const m = parseConnectionString('Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location="My ""Q""; x";Extended Properties=""');
  assert.equal(m.get('provider'), 'Microsoft.Mashup.OleDb.1');
  assert.equal(m.get('location'), 'My "Q"; x');
  assert.equal(m.get('data source'), '$Workbook$');
});

test('T-PQ-2: load badges come from connections, queryTables and metadata', async () => {
  const wb = await openWorkbook(fixture('pq_vba_complex.xlsm'), 'c.xlsm');
  const byName = Object.fromEntries(wb.queries.map((q) => [q.name, q.load]));
  assert.equal(byName.fGetNamedRange.kind, 'connection');
  assert.equal(byName.RawInput.kind, 'table');
  assert.equal(byName.FinalTable.kind, 'table');
  assert.match(byName.RawInput.ref, /^[A-Z]+\d+(:[A-Z]+\d+)?$/);
  const simple = await openWorkbook(fixture('pq_simple.xlsx'), 's.xlsx');
  assert.equal(simple.queries[0].load.kind, 'table');
  assert.deepEqual(simple.warnings, []);
});

test('plain workbook without queries opens cleanly', async () => {
  const wb = await openWorkbook(fixture('plain_table.xlsx'), 'p.xlsx');
  assert.equal(wb.queries.length, 0);
  assert.equal(wb.mashup, null);
  assert.ok(wb.tables.length >= 1);
});

test('T-PQ-WB-1/2: query edit changes only the mashup item and connections, and reopens', async () => {
  const wb = await openWorkbook(fixture('pq_vba_complex.xlsm'), 'c.xlsm');
  const q = wb.queries.find((x) => x.name === 'RawInput');
  const edited = q.original.replace('Source = ', '// edited\n    Source = ');
  const res = await buildWorkbook(wb, { queryEdits: new Map([[q.name, edited]]), checkSection });
  assert.equal(res.queriesChanged, 1);
  const back = await openWorkbook(res.bytes, 'c2.xlsm');
  assert.equal(back.queries.find((x) => x.name === 'RawInput').original, edited);
  for (const other of ['fGetNamedRange', 'FinalTable']) assert.equal(back.queries.find((x) => x.name === other).original, wb.queries.find((x) => x.name === other).original);
  const changed = [];
  for (const e of wb.pkg.zip.entries) {
    const n = back.pkg.zip.get(e.name);
    if (!n || !equalBytes(n.rawCompressed(), e.rawCompressed())) changed.push(e.name);
  }
  assert.deepEqual(changed.sort(), ['customXml/item1.xml', 'xl/connections.xml']);
  const conns = back.connections.list;
  const raw = conns.find((c) => c.location === 'RawInput');
  assert.equal(raw.refreshOnLoad, true);
  assert.equal(conns.find((c) => c.location === 'FinalTable').refreshOnLoad, wb.connections.list.find((c) => c.location === 'FinalTable').refreshOnLoad);
});

test('S-1: saving without edits keeps every part byte-identical', async () => {
  for (const f of ['pq_simple.xlsx', 'pq_vba_complex.xlsm', 'plain_table.xlsx']) {
    const wb = await openWorkbook(fixture(f), f);
    const res = await buildWorkbook(wb, {});
    const back = readZip(res.bytes);
    for (const e of wb.pkg.zip.entries) assert.ok(equalBytes(back.get(e.name).rawCompressed(), e.rawCompressed()), `${f}:${e.name}`);
  }
});

test('refreshOnLoad can be switched off', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 's.xlsx');
  const q = wb.queries[0];
  const res = await buildWorkbook(wb, { queryEdits: new Map([[q.name, `${q.original}\n// note`]]), refreshOnLoad: false, checkSection });
  const back = await openWorkbook(res.bytes, 's2.xlsx');
  assert.equal(back.connections.list.find((c) => c.location === q.name).refreshOnLoad, wb.connections.list.find((c) => c.location === q.name).refreshOnLoad);
  assert.ok(equalBytes(back.pkg.zip.get('xl/connections.xml').rawCompressed(), wb.pkg.zip.get('xl/connections.xml').rawCompressed()));
});

test('whitespace-only differences at the ends of a query are not edits', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 's.xlsx');
  const q = wb.queries[0];
  const res = await buildWorkbook(wb, { queryEdits: new Map([[q.name, `\n\n${q.original}  \n`]]), checkSection });
  assert.equal(res.queriesChanged, 0);
});

test('T-PQ-SEC-5: a query that does not parse is refused before anything is written', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 's.xlsx');
  const q = wb.queries[0];
  await assert.rejects(() => buildWorkbook(wb, { queryEdits: new Map([[q.name, 'let a = in']]), checkSection }), (e) => e.code === 'm.parse' && /Line \d+, column \d+/.test(e.message));
});

test('unknown query edits are rejected', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 's.xlsx');
  await assert.rejects(() => buildWorkbook(wb, { queryEdits: new Map([['Nope', '1']]) }), (e) => e.code === 'pq.unknown');
});

test('suggested file name keeps the base and adds a marker', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 'My Report.xlsx');
  const res = await buildWorkbook(wb, {});
  assert.equal(res.name, 'My Report (edited).xlsx');
});

test('empty and extra inputs to metadata parse do not throw', () => {
  assert.deepEqual(parseMetadata('').groups, []);
  assert.equal(le32(5).length, 4);
});
