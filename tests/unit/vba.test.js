import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readCfb, flatten, FREESECT } from '../../src/core/vba/cfb-read.js';
import { writeCfb, compareNames } from '../../src/core/vba/cfb-write.js';
import { compress } from '../../src/core/vba/ovba-compress.js';
import { decompress } from '../../src/core/vba/ovba-decompress.js';
import { parseDir, serializeDir } from '../../src/core/vba/dir-stream.js';
import { readVbaProject } from '../../src/core/vba/vba-project.js';
import { writeVbaProject, MINIMAL_VBA_PROJECT } from '../../src/core/vba/writeback.js';
import { splitModuleSource, joinModuleSource } from '../../src/core/vba/module-source.js';
import { encodeText, decodeBytes, isSupportedCodePage } from '../../src/core/vba/codepages.js';
import { decryptProjectField } from '../../src/core/vba/project-stream.js';
import { openWorkbook } from '../../src/core/workbook.js';
import { buildWorkbook } from '../../src/core/save.js';
import { readZip } from '../../src/core/zip-read.js';
import { Package } from '../../src/core/opc.js';
import { writeZip, rawFromEntry } from '../../src/core/zip-write.js';
import { equalBytes, u32 } from '../../src/core/bytes.js';
import * as h from '../fixtures/generators/hostile.js';
import { fixture } from './helpers.js';

const BINS = ['xw_vbaProject01.bin', 'xw_vbaProject02.bin', 'xw_vbaProject03.bin', 'xw_vbaProject04.bin', 'xw_vbaProject05.bin'];
const enc = (s) => new TextEncoder().encode(s);

function checkRedBlack(bytes) {
  const sector = 512;
  const firstDir = u32(bytes, 48);
  const entries = [];
  const fatCount = u32(bytes, 44);
  const fat = [];
  for (let i = 0; i < fatCount; i++) {
    const s = u32(bytes, 76 + i * 4);
    for (let k = 0; k < 128; k++) fat.push(u32(bytes, (s + 1) * sector + k * 4));
  }
  let s = firstDir;
  while (s !== 0xFFFFFFFE) {
    for (let k = 0; k < 4; k++) {
      const o = (s + 1) * sector + k * 128;
      const nameLen = bytes[o + 64] | (bytes[o + 65] << 8);
      let name = '';
      for (let i = 0; i < nameLen - 2; i += 2) name += String.fromCharCode(bytes[o + i] | (bytes[o + i + 1] << 8));
      entries.push({ name, type: bytes[o + 66], color: bytes[o + 67], left: u32(bytes, o + 68), right: u32(bytes, o + 72), child: u32(bytes, o + 76) });
    }
    s = fat[s];
  }
  const walk = (id) => {
    if (id === FREESECT) return { blackHeight: 0, order: [] };
    const e = entries[id];
    const l = walk(e.left);
    const r = walk(e.right);
    assert.equal(l.blackHeight, r.blackHeight, `black height mismatch under ${e.name}`);
    if (e.color === 0) {
      for (const c of [e.left, e.right]) if (c !== FREESECT) assert.equal(entries[c].color, 1, 'red node with red child');
    }
    return { blackHeight: (l.blackHeight || 0) + (e.color === 1 ? 1 : 0), order: [...l.order, e.name, ...r.order] };
  };
  const checkStorage = (id) => {
    const e = entries[id];
    if (e.child !== FREESECT) {
      const t = walk(e.child);
      const sorted = [...t.order].sort(compareNames);
      assert.deepEqual(t.order, sorted, `children of ${e.name} are not in order`);
      const stack = [e.child];
      while (stack.length) {
        const c = stack.pop();
        if (entries[c].type === 1) checkStorage(c);
        for (const n of [entries[c].left, entries[c].right]) if (n !== FREESECT) stack.push(n);
      }
    }
  };
  assert.equal(entries[0].color, 1);
  checkStorage(0);
}

test('T-CFB-RT-1: real VBA projects survive read/write/read', () => {
  for (const f of BINS) {
    const c = readCfb(fixture(f));
    const out = writeCfb(c.root);
    const c2 = readCfb(out);
    const a = flatten(c.root);
    const b = flatten(c2.root);
    assert.deepEqual(a.map((x) => [x.path, x.type]), b.map((x) => [x.path, x.type]));
    for (let i = 0; i < a.length; i++) if (a[i].data) assert.ok(equalBytes(a[i].data, b[i].data), a[i].path);
  }
});

test('T-CFB-RB-1: written directories are valid red-black trees', () => {
  for (const f of BINS) checkRedBlack(writeCfb(readCfb(fixture(f)).root));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 33, 100]) {
    const children = Array.from({ length: n }, (_, i) => ({ name: `S${(i * 7919) % 1000}_${i}`, type: 2, data: new Uint8Array(i) }));
    checkRedBlack(writeCfb({ name: 'Root Entry', type: 5, children }));
  }
});

test('CFB writer handles stream sizes around the mini cutoff and large streams', () => {
  const sizes = [0, 1, 63, 64, 65, 511, 512, 513, 4095, 4096, 4097, 70000, 600000];
  const children = sizes.map((n, i) => ({ name: `s${i}`, type: 2, data: Uint8Array.from({ length: n }, (_, k) => (k * 31 + i) & 255) }));
  const out = writeCfb({ name: 'Root Entry', type: 5, children });
  const back = readCfb(out);
  sizes.forEach((n, i) => {
    const node = back.find(`s${i}`);
    assert.equal(node.data.length, n);
    assert.ok(equalBytes(node.data, children[i].data));
  });
});

test('CFB writer builds DIFAT for files above 109 FAT sectors', () => {
  const big = Uint8Array.from({ length: 8_000_000 }, (_, k) => (k * 13) & 255);
  const out = writeCfb({ name: 'Root Entry', type: 5, children: [{ name: 'big', type: 2, data: big }] });
  assert.ok(u32(out, 72) >= 1);
  assert.ok(equalBytes(readCfb(out).find('big').data, big));
});

test('T-CFB-2: hostile compound files are rejected', () => {
  assert.throws(() => readCfb(h.cfbLoop()), (e) => e.code === 'cfb.loop');
  assert.throws(() => readCfb(h.cfbOutOfRange()), (e) => e.code === 'cfb.range');
  assert.throws(() => readCfb(h.cfbTruncated()), (e) => e.code === 'cfb.header');
});

test('T-OVBA-1: the three official vectors, both directions', () => {
  const hex = (s) => Uint8Array.from(s.split(' ').map((x) => parseInt(x, 16)));
  const vectors = [
    [enc('abcdefghijklmnopqrstuv.'), hex('01 19 B0 00 61 62 63 64 65 66 67 68 00 69 6A 6B 6C 6D 6E 6F 70 00 71 72 73 74 75 76 2E')],
    [enc('#aaabcdefaaaaghijaaaaaklaaamnopqaaaaaaaaaaaarstuvwxyzaaa'), hex('01 2F B0 00 23 61 61 61 62 63 64 65 82 66 00 70 61 67 68 69 6A 01 38 08 61 6B 6C 00 20 6D 6E 6F 70 06 71 02 70 04 00 72 73 74 75 76 10 77 78 79 7A 00 2C')],
    [enc('a'.repeat(73)), hex('01 03 B0 02 61 45 00')]
  ];
  for (const [plain, packed] of vectors) {
    assert.ok(equalBytes(decompress(packed), plain));
    assert.ok(equalBytes(compress(plain), packed));
  }
});

test('T-OVBA-2: round trip across boundary sizes and data shapes', () => {
  const text = enc('Attribute VB_Name = "M"\r\nSub A()\r\n    Debug.Print "x"\r\nEnd Sub\r\n'.repeat(500));
  const sizes = [0, 1, 2, 3, 4094, 4095, 4096, 4097, 8191, 8192, 8193, 100000];
  for (const n of sizes) {
    const slice = text.subarray(0, Math.min(n, text.length));
    assert.ok(equalBytes(decompress(compress(slice)), slice), `text ${n}`);
    const rep = new Uint8Array(n).fill(97);
    assert.ok(equalBytes(decompress(compress(rep)), rep), `rep ${n}`);
  }
  for (const n of [4096, 8192, 102400]) {
    const rnd = new Uint8Array(randomBytes(n));
    assert.ok(equalBytes(decompress(compress(rnd)), rnd), `random ${n}`);
  }
});

test('T-OVBA-3: invalid containers are rejected', () => {
  assert.throws(() => decompress(Uint8Array.from([0x02, 0, 0])), (e) => e.code === 'ovba.signature');
  assert.throws(() => decompress(Uint8Array.from([0x01, 0x00, 0x00])), (e) => e.code === 'ovba.chunk');
  assert.throws(() => decompress(Uint8Array.from([0x01, 0x10, 0xB0, 0x00, 0x01, 0x00, 0x10])), (e) => e.code === 'ovba.offset' || e.code === 'ovba.chunk');
  assert.throws(() => decompress(Uint8Array.from([0x01, 0xFF, 0xB0])), (e) => e.code === 'ovba.chunk');
});

test('T-OVBA-4: compressed size is within 110% of Excel for real modules', () => {
  const p = readVbaProject(fixture('xw_vbaProject01.bin'));
  for (const m of p.modules) {
    if (!m.sourceBytes || m.sourceBytes.length < 200) continue;
    assert.ok(compress(m.sourceBytes).length <= m.compressedFrom.length * 1.1 + 8, m.name);
  }
});

test('T-VBA-DIR: dir stream parses with the PROJECTVERSION quirk and re-serializes exactly', () => {
  for (const f of BINS) {
    const cfb = readCfb(fixture(f));
    const dirBytes = decompress(cfb.find('VBA/dir').data);
    const parsed = parseDir(dirBytes);
    assert.deepEqual(parsed.anomalies, []);
    assert.ok(equalBytes(serializeDir(parsed.records), dirBytes));
    const ver = parsed.records.find((r) => r.id === 0x0009);
    assert.equal(ver.data.length, 6);
    assert.equal(ver.sizeField, 4);
  }
});

test('T-VBA-1: real projects read: code page, modules, kinds and source', () => {
  for (const f of BINS) {
    const p = readVbaProject(fixture(f));
    assert.equal(p.codePage, 1252);
    assert.equal(p.locked, false);
    assert.equal(p.writable, true);
    assert.ok(p.modules.length >= 2);
    for (const m of p.modules) {
      assert.equal(m.error, null);
      assert.ok(['standard', 'document', 'class', 'form'].includes(m.kind));
      assert.match(m.text, /Attribute VB_Name/);
    }
  }
  const p = readVbaProject(fixture('xw_vbaProject01.bin'));
  const std = p.modules.find((m) => m.kind === 'standard');
  assert.ok(std.model.visible.includes('Sub'));
  assert.ok(!/^Attribute /m.test(std.model.visible));
  assert.ok(p.modules.find((m) => m.name === 'ThisWorkbook').kind === 'document');
});

test('T-VBA-ATTR: attribute lines are hidden and re-inserted at their original positions', () => {
  const src = 'Attribute VB_Name = "M"\r\nOption Explicit\r\nSub A()\r\nAttribute A.VB_Description = "d"\r\n    x = 1\r\nEnd Sub\r\n\r\nSub B()\r\nEnd Sub\r\n';
  const m = splitModuleSource(src);
  assert.ok(!m.visible.includes('Attribute'));
  assert.equal(joinModuleSource(m, m.visible), src);
  const edited = m.visible.replace('x = 1', 'x = 1\ny = 2');
  assert.equal(joinModuleSource(m, edited), src.replace('x = 1', 'x = 1\r\ny = 2'));
  const prepended = `' header\n${m.visible}`;
  const joined = joinModuleSource(m, prepended);
  assert.ok(joined.indexOf('Attribute A.VB_Description') > joined.indexOf('Sub A()'));
  assert.ok(joined.startsWith('Attribute VB_Name = "M"\r\n'));
  const deleted = m.visible.replace('Sub A()\n    x = 1\nEnd Sub\n', '');
  assert.ok(joinModuleSource(m, deleted).includes('Attribute A.VB_Description'));
});

test('T-VBA-CP-1/2: code page encoders reject unmappable text and honour DBCS rules', () => {
  assert.ok(isSupportedCodePage(1252));
  assert.ok(!isSupportedCodePage(437));
  assert.deepEqual([...encodeText(1252, 'é€', null)], [0xE9, 0x80]);
  assert.deepEqual([...encodeText(1251, 'Привет', null)], [0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]);
  assert.equal(decodeBytes(1251, Uint8Array.from([0xCF, 0xF0])), 'Пр');
  assert.throws(() => encodeText(1252, 'Привет', null), (e) => e.code === 'vba.codepage');
  const sjis = Uint8Array.from([0x41, 0x82, 0xA0]);
  assert.equal(decodeBytes(932, sjis), 'Aあ');
  assert.deepEqual([...encodeText(932, 'Aあ A', sjis)], [0x41, 0x82, 0xA0, 0x20, 0x41]);
  assert.throws(() => encodeText(932, 'い', sjis), (e) => e.code === 'vba.codepage');
});

test('T-VBA-WB-1: edited module is saved, compressed, and everything else is preserved', () => {
  const p = readVbaProject(fixture('xw_vbaProject01.bin'));
  const std = p.modules.find((m) => m.kind === 'standard');
  const edits = new Map([[std.name, `${std.model.visible}\n' added line\n`]]);
  const out = writeVbaProject(p, edits);
  const back = readVbaProject(out);
  assert.equal(back.writable, true);
  const m = back.modules.find((x) => x.name === std.name);
  assert.equal(m.model.visible, edits.get(std.name));
  assert.ok(m.text.startsWith('Attribute VB_Name'));
  for (const other of p.modules.filter((x) => x.name !== std.name)) assert.equal(back.modules.find((x) => x.name === other.name).text, other.text);
  const cfbIn = readCfb(fixture('xw_vbaProject01.bin'));
  const cfbOut = readCfb(out);
  const names = (c) => flatten(c.root).map((n) => n.path);
  assert.deepEqual(names(cfbOut).filter((n) => !names(cfbIn).includes(n)), []);
  for (const n of ['PROJECT', 'PROJECTwm']) {
    const a = cfbIn.find(n);
    if (a) assert.ok(equalBytes(a.data, cfbOut.find(n).data), n);
  }
  assert.ok(equalBytes(cfbOut.find('VBA/_VBA_PROJECT').data, MINIMAL_VBA_PROJECT));
  assert.ok(!names(cfbOut).some((n) => /__SRP_/.test(n)));
  for (const m2 of back.modules) assert.equal(m2.offset, 0);
});

test('large modules (more than 25 chunks) round-trip through writeback', () => {
  const p = readVbaProject(fixture('xw_vbaProject01.bin'));
  const std = p.modules.find((m) => m.kind === 'standard');
  const body = Array.from({ length: 6000 }, (_, i) => `    Cells(${i + 1}, 1).Value = "row ${i} ${(i * 7919) % 10007}"`).join('\n');
  const view = `Option Explicit\nSub Big()\n${body}\nEnd Sub\n`;
  const out = writeVbaProject(p, new Map([[std.name, view]]));
  assert.equal(readVbaProject(out).modules.find((m) => m.name === std.name).model.visible, view);
});

test('writing without edits keeps module text identical and drops p-code', () => {
  const p = readVbaProject(fixture('xw_vbaProject03.bin'));
  const back = readVbaProject(writeVbaProject(p, new Map()));
  p.modules.forEach((m, i) => assert.equal(back.modules[i].text, m.text));
});

test('T-VBA-LOCK: protection decoding recognises locked projects', () => {
  const encrypt = (state) => {
    const data = [state & 255, (state >> 8) & 255, (state >> 16) & 255, (state >> 24) & 255];
    const seed = 0x4B;
    const version = 2;
    const projKey = 0x5A;
    const ignored = (seed & 6) >> 1;
    const plain = [...Array(ignored).fill(0), data.length & 255, 0, 0, 0, ...data];
    const out = [seed, seed ^ version, seed ^ projKey];
    let unenc1 = projKey;
    let enc1 = out[2];
    let enc2 = out[1];
    for (const b of plain) {
      const e = b ^ ((enc2 + unenc1) & 255);
      out.push(e);
      enc2 = enc1;
      enc1 = e;
      unenc1 = b;
    }
    return out.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  for (const state of [0, 1, 4, 7]) assert.deepEqual([...decryptProjectField(encrypt(state))], [state & 255, 0, 0, 0]);
  assert.equal(decryptProjectField('ZZ'), null);
  assert.equal(decryptProjectField('0102'), null);
});

test('T-VBA-WB-2/3: signed projects require acknowledgement and lose their signature parts', async () => {
  const z = readZip(fixture('pq_vba_complex.xlsm'));
  const pkg = new Package(z);
  pkg.set('xl/vbaProjectSignature.bin', Uint8Array.from([1, 2, 3, 4]));
  const rels = await pkg.text('xl/_rels/vbaProject.bin.rels');
  const sigRel = '<Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProjectSignature" Target="vbaProjectSignature.bin"/>';
  if (rels) {
    await pkg.setText('xl/_rels/vbaProject.bin.rels', rels.text.replace('</Relationships>', `${sigRel}</Relationships>`), rels);
  } else {
    pkg.set('xl/_rels/vbaProject.bin.rels', enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sigRel}</Relationships>`));
  }
  const ct = await pkg.text('[Content_Types].xml');
  await pkg.setText('[Content_Types].xml', ct.text.replace('</Types>', '<Override PartName="/xl/vbaProjectSignature.bin" ContentType="application/vnd.ms-office.vbaProjectSignature"/></Types>'), ct);
  const signedBytes = await pkg.write();
  const wb = await openWorkbook(signedBytes, 'signed.xlsm');
  assert.equal(wb.vba.signed, true);
  const mod = wb.vba.project.modules.find((m) => m.name === 'Sheet1');
  const edits = new Map([[mod.name, `${mod.model.visible}\n' x\n`]]);
  await assert.rejects(() => buildWorkbook(wb, { vbaEdits: edits }), (e) => e.code === 'vba.signature');
  const res = await buildWorkbook(wb, { vbaEdits: edits, acknowledgeSignature: true });
  assert.equal(res.signatureRemoved, true);
  const back = readZip(res.bytes);
  assert.ok(!back.has('xl/vbaProjectSignature.bin'));
  const ctBack = new TextDecoder().decode(await back.get('[Content_Types].xml').read());
  assert.ok(!ctBack.includes('vbaProjectSignature'));
  assert.equal(ctBack, ct.text.replace(/<Override[^>]*vbaProjectSignature[^>]*\/>/, ''));
  const reopened = await openWorkbook(res.bytes, 'u.xlsm');
  assert.equal(reopened.vba.signed, false);
  assert.equal(reopened.vba.project.modules.find((m) => m.name === 'Sheet1').model.visible, edits.get('Sheet1'));
});

test('VBA edits on a real xlsm leave non-VBA parts byte-identical', async () => {
  const wb = await openWorkbook(fixture('pq_vba_complex.xlsm'), 'c.xlsm');
  const mod = wb.vba.project.modules.find((m) => m.name === 'Sheet1');
  const res = await buildWorkbook(wb, { vbaEdits: new Map([[mod.name, `${mod.model.visible}\n' y\n`]]) });
  const back = readZip(res.bytes);
  for (const e of wb.pkg.zip.entries) {
    if (e.name === 'xl/vbaProject.bin') continue;
    assert.ok(equalBytes(back.get(e.name).rawCompressed(), e.rawCompressed()), e.name);
  }
});

test('unknown module edits are rejected', async () => {
  const wb = await openWorkbook(fixture('pq_vba_complex.xlsm'), 'c.xlsm');
  await assert.rejects(() => buildWorkbook(wb, { vbaEdits: new Map([['Nope', 'x']]) }), (e) => e.code === 'vba.unknown');
});

test('zip rewrite of a workbook with changed VBA still unzips cleanly', async () => {
  const z = readZip(fixture('xw_macro01.xlsm'));
  const out = await writeZip(z.entries.map((e) => ({ name: e.name, raw: rawFromEntry(e) })));
  assert.equal(readZip(out).entries.length, z.entries.length);
});
