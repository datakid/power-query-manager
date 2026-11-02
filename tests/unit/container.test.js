import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from '../../src/core/crc32.js';
import { base64Decode, base64Encode, decodeTextBytes, encodeTextBytes, equalBytes, u32, writeU32 } from '../../src/core/bytes.js';
import { readZip } from '../../src/core/zip-read.js';
import { writeZip, rawFromEntry } from '../../src/core/zip-write.js';
import { CP437_HIGH_LENGTH, decodeCp437 } from '../../src/core/cp437.js';
import { inflateRaw, deflateRaw } from '../../src/core/inflate.js';
import { parseXml, applyEdits, attributeEdit, textContentEdit, streamSheetCells, readSharedStrings, escapeAttr, decodeEntities } from '../../src/core/xml.js';
import { Package, resolveTarget, relationshipsPartFor } from '../../src/core/opc.js';
import { QuoinError } from '../../src/core/errors.js';
import * as h from '../fixtures/generators/hostile.js';
import { fixture } from './helpers.js';

const rejects = (fn, code) => assert.throws(fn, (e) => e instanceof QuoinError && e.code === code, `expected ${code}`);

test('crc32 matches known values', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('base64 round trips and rejects garbage', () => {
  for (let n = 0; n < 40; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
    assert.ok(equalBytes(base64Decode(base64Encode(b)), b));
    assert.equal(base64Encode(b), Buffer.from(b).toString('base64'));
  }
  assert.ok(equalBytes(base64Decode('YW\r\n I='), new TextEncoder().encode('ab')));
  assert.throws(() => base64Decode('@@@@'), RangeError);
  assert.throws(() => base64Decode('abc'), RangeError);
});

test('text codecs detect and preserve BOMs', () => {
  for (const [enc, bom] of [['utf-8', true], ['utf-8', false], ['utf-16le', true], ['utf-16be', true]]) {
    const text = 'héllo €𝄞 <x/>';
    const bytes = encodeTextBytes(text, enc, bom);
    const d = decodeTextBytes(bytes);
    assert.equal(d.text, text);
    assert.equal(d.encoding, enc);
    assert.equal(d.bom, bom);
  }
  const noBom16 = encodeTextBytes('<?xml version="1.0"?><a/>', 'utf-16le', false);
  assert.equal(decodeTextBytes(noBom16).encoding, 'utf-16le');
});

test('cp437 table has 128 high characters', () => {
  assert.equal(CP437_HIGH_LENGTH, 128);
  assert.equal(decodeCp437(Uint8Array.from([0x80, 0x41, 0xFF])), 'ÇA\u00A0');
});

test('inflate enforces maxBytes', async () => {
  const big = new Uint8Array(1 << 20);
  const packed = await deflateRaw(big);
  assert.ok(packed.length < 5000);
  await assert.rejects(() => inflateRaw(packed, { maxBytes: 1000 }), (e) => e.code === 'limit.entry');
  assert.equal((await inflateRaw(packed, { maxBytes: 1 << 20 })).length, 1 << 20);
});

test('T-ZIP-1: real Excel files read and every entry verifies', async () => {
  for (const f of ['ms_template_query.xlsx', 'pq_simple.xlsx', 'pq_vba_complex.xlsm', 'plain_table.xlsx', 'xw_macro01.xlsm']) {
    const z = readZip(fixture(f));
    assert.ok(z.entries.length > 5);
    for (const e of z.entries) {
      const data = await e.read();
      assert.equal(data.length, e.uncompressedSize);
    }
  }
});

test('T-ZIP-RT-1: raw copy preserves names, CRCs, methods and compressed bytes', async () => {
  const z = readZip(fixture('ms_template_query.xlsx'));
  const out = await writeZip(z.entries.map((e) => ({ name: e.name, raw: rawFromEntry(e) })));
  const z2 = readZip(out);
  assert.equal(z2.entries.length, z.entries.length);
  z.entries.forEach((e, i) => {
    const c = z2.entries[i];
    assert.equal(c.name, e.name);
    assert.equal(c.crc32, e.crc32);
    assert.equal(c.method, e.method);
    assert.ok(equalBytes(c.rawCompressed(), e.rawCompressed()));
  });
});

test('written ZIP is accepted by the system unzip', async () => {
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const z = readZip(fixture('pq_vba_complex.xlsm'));
  const out = await writeZip([...z.entries.map((e) => ({ name: e.name, raw: rawFromEntry(e) })), { name: 'extra/ünï.txt', data: new TextEncoder().encode('x'.repeat(5000)) }]);
  const dir = mkdtempSync(join(tmpdir(), 'q-'));
  writeFileSync(join(dir, 't.zip'), out);
  const r = execFileSync('unzip', ['-tq', join(dir, 't.zip')]).toString();
  assert.match(r, /No errors detected/);
});

test('T-ZIP-2/3/4/5: hostile archives are rejected with the right codes', async () => {
  rejects(() => readZip(h.zipTraversal()), 'zip.name');
  rejects(() => readZip(h.zipAbsolute()), 'zip.name');
  rejects(() => readZip(h.zipDuplicate()), 'zip.duplicate');
  rejects(() => readZip(h.zipEncrypted()), 'zip.encrypted');
  rejects(() => readZip(h.zipMethod()), 'zip.method');
  rejects(() => readZip(h.zipNoEocd()), 'zip.eocd');
  rejects(() => readZip(h.zipBomb()), 'limit.total');
  rejects(() => readZip(h.zipRatio()), 'limit.ratio');
  rejects(() => readZip(h.zipTooManyEntries()), 'limit.entries');
  const z = readZip(h.zipBadCrc());
  await assert.rejects(() => z.entries[0].read(), (e) => e.code === 'zip.crc');
});

test('T-SEC-2: bomb and ratio files are refused within 2 seconds', () => {
  const t0 = Date.now();
  assert.throws(() => readZip(h.zipBomb()));
  assert.throws(() => readZip(h.zipRatio()));
  assert.ok(Date.now() - t0 < 2000);
});

test('zip64 EOCD locator is honoured', () => {
  const base = h.rawZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
  const eocdAt = base.length - 22;
  const cdSize = u32(base, eocdAt + 12);
  const cdOff = u32(base, eocdAt + 16);
  const rec = new Uint8Array(56);
  writeU32(rec, 0, 0x06064b50);
  writeU32(rec, 4, 44);
  rec[32] = 1;
  writeU32(rec, 40, cdSize);
  writeU32(rec, 48, cdOff);
  const loc = new Uint8Array(20);
  writeU32(loc, 0, 0x07064b50);
  writeU32(loc, 8, eocdAt);
  writeU32(loc, 16, 1);
  const eocd = base.slice(eocdAt);
  eocd[10] = 0xFF;
  eocd[11] = 0xFF;
  writeU32(eocd, 12, 0xFFFFFFFF);
  writeU32(eocd, 16, 0xFFFFFFFF);
  const out = new Uint8Array(eocdAt + 56 + 20 + 22);
  out.set(base.subarray(0, eocdAt), 0);
  out.set(rec, eocdAt);
  out.set(loc, eocdAt + 56);
  out.set(eocd, eocdAt + 76);
  const z = readZip(out);
  assert.equal(z.entries.length, 1);
  assert.equal(z.entries[0].name, 'a.txt');
});

test('T-XML-1: minimal edits leave every other byte alone', () => {
  const src = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<r xmlns="urn:a" xmlns:mc="urn:mc" mc:Ignorable="x" z="9">\r\n  <a b="1" c=\'q\'/>\r\n  <d>old</d>\r\n</r>';
  const d = parseXml(src);
  const a = d.root.child('a');
  const out = applyEdits(src, [attributeEdit(a, 'b', '2&"'), textContentEdit(d.root.child('d'), 'n<w')]);
  assert.equal(out, src.replace('b="1"', 'b="2&amp;&quot;"').replace('>old<', '>n&lt;w<'));
  const again = parseXml(out);
  assert.equal(again.root.child('a').attr('b'), '2&"');
  assert.equal(again.root.child('d').text(), 'n<w');
});

test('XML reader handles entities, CDATA, namespaces and prefixes', () => {
  const d = parseXml('<p:r xmlns:p="urn:p" xmlns="urn:d"><x a="&lt;&#65;&#x42;"/><![CDATA[<raw>]]><p:y/></p:r>');
  assert.equal(d.root.ns, 'urn:p');
  assert.equal(d.root.child('x').ns, 'urn:d');
  assert.equal(d.root.child('x').attr('a'), '<AB');
  assert.equal(d.root.child('y').ns, 'urn:p');
  assert.equal(decodeEntities('&amp;&apos;'), "&'");
  assert.equal(escapeAttr('a"b', '"'), 'a&quot;b');
});

test('T-XML-2: DOCTYPE and ENTITY are rejected', () => {
  rejects(() => parseXml('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'), 'xml.doctype');
  rejects(() => parseXml('<a>&unknown;</a>'), 'xml.parse');
  rejects(() => parseXml('<a><b></a>'), 'xml.parse');
  rejects(() => parseXml('<a></a><b/>'), 'xml.parse');
  rejects(() => parseXml('<a b=1/>'), 'xml.parse');
});

test('sheet cell streaming reads values, shared strings and inline strings', () => {
  const sheet = '<worksheet xmlns="x"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="3"><v>1.5</v></c><c r="C1" t="inlineStr"><is><t>in</t><rPh><t>skip</t></rPh></is></c><c r="D1" t="b"><v>1</v></c><c r="E1" t="e"><v>#N/A</v></c><c r="F1"/></row></sheetData></worksheet>';
  const cells = [];
  streamSheetCells(sheet, (c) => cells.push([c.ref, c.type, c.style, c.value]));
  assert.deepEqual(cells, [['A1', 's', 0, '0'], ['B1', 'n', 3, '1.5'], ['C1', 'inlineStr', 0, 'in'], ['D1', 'b', 0, '1'], ['E1', 'e', 0, '#N/A'], ['F1', 'n', 0, null]]);
  assert.deepEqual(readSharedStrings('<sst xmlns="x"><si><t>a</t></si><si><r><t>b</t></r><r><t>c</t></r><rPh><t>z</t></rPh></si></sst>'), ['a', 'bc']);
});

test('OPC helpers resolve targets and relationship part names', () => {
  assert.equal(resolveTarget('xl/workbook.xml', 'worksheets/sheet1.xml'), 'xl/worksheets/sheet1.xml');
  assert.equal(resolveTarget('xl/worksheets/sheet1.xml', '../tables/table1.xml'), 'xl/tables/table1.xml');
  assert.equal(resolveTarget('xl/workbook.xml', '/customXml/item1.xml'), 'customXml/item1.xml');
  assert.equal(relationshipsPartFor('xl/workbook.xml'), 'xl/_rels/workbook.xml.rels');
  assert.equal(relationshipsPartFor(''), '_rels/.rels');
});

test('Package replaces, adds, removes and keeps untouched parts byte-identical', async () => {
  const z = readZip(fixture('ms_template_query.xlsx'));
  const pkg = new Package(z);
  pkg.set('xl/custom.txt', new TextEncoder().encode('hi'));
  pkg.remove('docProps/app.xml');
  const out = readZip(await pkg.write());
  assert.equal(out.entries[0].name, '[Content_Types].xml');
  assert.ok(out.has('xl/custom.txt'));
  assert.ok(!out.has('docProps/app.xml'));
  for (const e of z.entries) {
    if (e.name === 'docProps/app.xml') continue;
    assert.ok(equalBytes(out.get(e.name).rawCompressed(), e.rawCompressed()), e.name);
  }
  const clone = pkg.clone();
  clone.remove('xl/custom.txt');
  assert.ok(pkg.has('xl/custom.txt'));
});
