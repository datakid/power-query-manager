import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../../../src/core/zip-read.js';
import { Package } from '../../../src/core/opc.js';
import { parseXml, applyEdits, textContentEdit } from '../../../src/core/xml.js';
import { base64Decode, base64Encode, concat, le32, utf8Encode } from '../../../src/core/bytes.js';
import { parseDataMashup, readSection } from '../../../src/core/pq/datamashup.js';
import { splitSection } from '../../../src/core/pq/section.js';
import * as h from './hostile.js';

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, '..', 'external');
const out = join(here, '..', 'workbooks');
mkdirSync(out, { recursive: true });
const load = (name) => new Uint8Array(readFileSync(join(ext, name)));

export async function addQuery(bytes, name, expression) {
  const pkg = new Package(readZip(bytes));
  const t = await pkg.text('customXml/item1.xml');
  const doc = parseXml(t.text);
  const dm = parseDataMashup(base64Decode(doc.root.text()));
  const section = await readSection(dm);
  const first = splitSection(section.text).members.find((m) => m.shared);
  const newSection = `${section.text}\r\n\r\nshared ${name} = ${expression};`;
  let xml = dm.metadata.xml;
  const bom = xml.charCodeAt(0) === 0xFEFF;
  const mark = xml.indexOf(`Section1/${first.name}`);
  const at = xml.lastIndexOf('<Item>', mark);
  const end = xml.indexOf('</Item>', mark) + '</Item>'.length;
  const item = xml.slice(at, end);
  const clone = item.split(`Section1/${first.name}`).join(`Section1/${name}`).replace(/Type="FillEnabled" Value="l1"/, 'Type="FillEnabled" Value="l0"');
  xml = xml.slice(0, end) + clone + xml.slice(end);
  const xmlBytes = utf8Encode(`${bom ? '\uFEFF' : ''}${xml}`);
  const metadata = concat([le32(0), le32(xmlBytes.length), xmlBytes, le32(dm.metadata.content.length), dm.metadata.content]);
  const { writeZip } = await import('../../../src/core/zip-write.js');
  const { rawFromEntry } = await import('../../../src/core/zip-write.js');
  const entries = dm.packageParts.entries.map((e) => (e.name === 'Formulas/Section1.m' ? { name: e.name, data: utf8Encode(`${section.bom ? '\uFEFF' : ''}${newSection}`) } : { name: e.name, raw: rawFromEntry(e) }));
  const packageBytes = await writeZip(entries);
  const mashup = concat([le32(0), le32(packageBytes.length), packageBytes, le32(dm.raw.permissions.length), dm.raw.permissions, le32(metadata.length), metadata, le32(dm.permissionBindings.length), dm.permissionBindings]);
  const text = applyEdits(t.text, [textContentEdit(doc.root, base64Encode(mashup))]);
  await pkg.setText('customXml/item1.xml', text, t);
  return pkg.write();
}

export async function withSignature(bytes) {
  const pkg = new Package(readZip(bytes));
  pkg.set('xl/vbaProjectSignature.bin', Uint8Array.from([1, 2, 3, 4]));
  const relsName = 'xl/_rels/vbaProject.bin.rels';
  const rel = '<Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProjectSignature" Target="vbaProjectSignature.bin"/>';
  const rels = await pkg.text(relsName);
  if (rels) await pkg.setText(relsName, rels.text.replace('</Relationships>', `${rel}</Relationships>`), rels);
  else pkg.set(relsName, utf8Encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`));
  const ct = await pkg.text('[Content_Types].xml');
  await pkg.setText('[Content_Types].xml', ct.text.replace('</Types>', '<Override PartName="/xl/vbaProjectSignature.bin" ContentType="application/vnd.ms-office.vbaProjectSignature"/></Types>'), ct);
  return pkg.write();
}

export async function withVbaProject(bytes, bin) {
  const pkg = new Package(readZip(bytes));
  pkg.set('xl/vbaProject.bin', bin);
  return pkg.write();
}

export async function buildAll() {
  const complex = load('pq_vba_complex.xlsm');
  const files = {};
  files['mixed.xlsm'] = await withVbaProject(complex, load('xw_vbaProject05.bin'));
  files['signed.xlsm'] = await withSignature(files['mixed.xlsm']);
  files['encrypted.xlsx'] = h.encryptedOffice();
  files['csv-query.xlsx'] = await addQuery(load('pq_simple.xlsx'), 'Sales', 'let\r\n    Source = Csv.Document(File.Contents("C:\\data\\sales.csv"), [Delimiter=",", Encoding=65001]),\r\n    Promoted = Table.PromoteHeaders(Source),\r\n    Typed = Table.TransformColumnTypes(Promoted, {{"Units", Int64.Type}, {"Price", type number}})\r\nin\r\n    Typed');
  files['unsupported.xlsx'] = await addQuery(load('pq_simple.xlsx'), 'FromSql', 'Sql.Database("server", "db")');
  files['long-run.xlsx'] = await addQuery(load('pq_simple.xlsx'), 'Slow', 'List.Accumulate({1..100000}, 0, (s, c) => s + List.Sum({1..c}))');
  files['big-grid.xlsx'] = await addQuery(load('pq_simple.xlsx'), 'Big', 'let\r\n    Ids = List.Numbers(0, 1000000),\r\n    Cols = {Ids, Ids, Ids, Ids, Ids, Ids, Ids, Ids, Ids, Ids, Ids, Ids}\r\nin\r\n    Table.FromColumns(Cols, {"A","B","C","D","E","F","G","H","I","J","K","L"})');
  for (const [name, data] of Object.entries(files)) writeFileSync(join(out, name), data);
  writeFileSync(join(out, 'sales.csv'), 'Region,Units,Price\r\nNorth,10,2.5\r\nSouth,4,3.75\r\n"East, Coast",7,1.2\r\n');
  return Object.keys(files);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildAll().then((n) => console.log(n.join('\n')));
