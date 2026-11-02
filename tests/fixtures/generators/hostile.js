import { writeZip } from '../../../src/core/zip-write.js';
import { writeU16, writeU32, utf8Encode, concat, le32, base64Encode } from '../../../src/core/bytes.js';
import { crc32 } from '../../../src/core/crc32.js';
import { writeCfb } from '../../../src/core/vba/cfb-write.js';
import { CFB_SIGNATURE } from '../../../src/core/vba/cfb-read.js';
import { readZip } from '../../../src/core/zip-read.js';
import { Package } from '../../../src/core/opc.js';
import { parseXml, applyEdits, textContentEdit } from '../../../src/core/xml.js';

const enc = (s) => utf8Encode(s);

export function rawZip(entries, { eocdPatch } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.name);
    const data = e.data || new Uint8Array(0);
    const method = e.method === undefined ? 0 : e.method;
    const stored = e.compressed || data;
    const local = new Uint8Array(30);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, e.flags || 0);
    writeU16(local, 8, method);
    writeU32(local, 14, e.crc === undefined ? crc32(data) : e.crc);
    writeU32(local, 18, stored.length);
    writeU32(local, 22, e.size === undefined ? data.length : e.size);
    writeU16(local, 26, name.length);
    parts.push(local, name, stored);
    const c = new Uint8Array(46);
    writeU32(c, 0, 0x02014b50);
    writeU16(c, 4, 20);
    writeU16(c, 6, 20);
    writeU16(c, 8, e.flags || 0);
    writeU16(c, 10, method);
    writeU32(c, 16, e.crc === undefined ? crc32(data) : e.crc);
    writeU32(c, 20, stored.length);
    writeU32(c, 24, e.size === undefined ? data.length : e.size);
    writeU16(c, 28, name.length);
    writeU32(c, 42, offset);
    central.push(c, name);
    offset += 30 + name.length + stored.length;
  }
  const cd = concat(central);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, entries.length);
  writeU16(eocd, 10, entries.length);
  writeU32(eocd, 12, cd.length);
  writeU32(eocd, 16, offset);
  if (eocdPatch) eocdPatch(eocd);
  return concat([...parts, cd, eocd]);
}

export const zipTraversal = () => rawZip([{ name: '../evil.txt', data: enc('x') }]);
export const zipAbsolute = () => rawZip([{ name: '/etc/passwd', data: enc('x') }]);
export const zipDuplicate = () => rawZip([{ name: 'a.txt', data: enc('1') }, { name: 'A.TXT', data: enc('2') }]);
export const zipEncrypted = () => rawZip([{ name: 'a.txt', data: enc('1'), flags: 1 }]);
export const zipMethod = () => rawZip([{ name: 'a.txt', data: enc('1'), method: 12 }]);
export const zipBadCrc = () => rawZip([{ name: 'a.txt', data: enc('hello'), crc: 123 }]);
export const zipNoEocd = () => enc('PK\u0003\u0004 truncated');
export const zipBomb = () => rawZip(Array.from({ length: 3 }, (_, i) => ({ name: `f${i}.bin`, data: new Uint8Array(0), compressed: new Uint8Array(2 * 1024 * 1024), size: 400 * 1024 * 1024, method: 8 })));
export const zipRatio = () => rawZip([{ name: 'x.bin', data: new Uint8Array(0), compressed: new Uint8Array(100), size: 50 * 1024 * 1024, method: 8 }]);
export const zipTooManyEntries = (n = 20001) => rawZip(Array.from({ length: n }, (_, i) => ({ name: `e${i}`, data: new Uint8Array(0) })));

export async function wrapAsWorkbook(parts) {
  const entries = [
    { name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>') },
    { name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets/></workbook>') },
    ...parts
  ];
  return writeZip(entries);
}

export const xmlDoctype = () => wrapAsWorkbook([{ name: 'xl/evil.xml', data: enc('<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><r>&lol2;</r>') }]).then(async (bytes) => {
  const pkg = new Package(readZip(bytes));
  const wbText = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE workbook [<!ENTITY a "aaaa">]><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>';
  pkg.set('xl/workbook.xml', enc(wbText));
  return pkg.write();
});

export async function strictWorkbook() {
  const bytes = await wrapAsWorkbook([]);
  const pkg = new Package(readZip(bytes));
  pkg.set('xl/workbook.xml', enc('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"><sheets/></workbook>'));
  return pkg.write();
}

export const xlsbLike = () => wrapAsWorkbook([{ name: 'xl/workbook.bin', data: enc('bin') }]);

export function odsLike() {
  return writeZip([
    { name: 'mimetype', data: enc('application/vnd.oasis.opendocument.spreadsheet') },
    { name: 'content.xml', data: enc('<office:document-content/>') }
  ]);
}

export function xlsLike() {
  return writeCfb({ name: 'Root Entry', type: 5, children: [{ name: 'Workbook', type: 2, data: new Uint8Array(100) }] });
}

export function encryptedOffice() {
  return writeCfb({ name: 'Root Entry', type: 5, children: [{ name: 'EncryptionInfo', type: 2, data: new Uint8Array(64) }, { name: 'EncryptedPackage', type: 2, data: new Uint8Array(64) }] });
}

export const notAWorkbook = () => enc('just some text, not a workbook');

export function cfbLoop() {
  const good = writeCfb({ name: 'Root Entry', type: 5, children: [{ name: 'A', type: 2, data: new Uint8Array(5000) }] });
  const out = good.slice();
  const fatStart = 512 * 1;
  void fatStart;
  const dirOffset = 512 * (1 + 1 + 1);
  void dirOffset;
  for (let s = 0; s < 40; s++) {
    const o = 512 + s * 512;
    if (o + 4 > out.length) break;
  }
  const fatSector = 0;
  const fatOff = (fatSector + 1) * 512;
  const entryCount = 128;
  for (let i = 0; i < entryCount; i++) {
    const v = out[fatOff + i * 4] | (out[fatOff + i * 4 + 1] << 8) | (out[fatOff + i * 4 + 2] << 16) | (out[fatOff + i * 4 + 3] << 24);
    if (v === 2 && i >= 1) {
      writeU32(out, fatOff + i * 4, i);
      return out;
    }
  }
  for (let i = 1; i < entryCount; i++) {
    const v = out[fatOff + i * 4] | (out[fatOff + i * 4 + 1] << 8) | (out[fatOff + i * 4 + 2] << 16) | (out[fatOff + i * 4 + 3] << 24);
    if (v !== 0xFFFFFFFF && v !== 0xFFFFFFFD && v !== 0xFFFFFFFE) {
      writeU32(out, fatOff + i * 4, i);
      return out;
    }
  }
  return out;
}

export function cfbOutOfRange() {
  const good = writeCfb({ name: 'Root Entry', type: 5, children: [{ name: 'A', type: 2, data: new Uint8Array(5000) }] });
  const out = good.slice();
  writeU32(out, 48, 0x00FFFFF0);
  return out;
}

export function cfbTruncated() {
  return CFB_SIGNATURE.slice();
}

export { enc, base64Encode, le32, parseXml, applyEdits, textContentEdit };
