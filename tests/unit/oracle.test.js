import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkbook } from '../../src/core/workbook.js';
import { buildWorkbook } from '../../src/core/save.js';
import { readVbaProject } from '../../src/core/vba/vba-project.js';
import { writeVbaProject } from '../../src/core/vba/writeback.js';
import { compress } from '../../src/core/vba/ovba-compress.js';
import { checkSection } from '../../src/core/m/engine.js';
import { fixture } from './helpers.js';

const py = spawnSync('python3', ['-c', 'import olefile, oletools.olevba, openpyxl']);
const havePython = py.status === 0;
const haveSoffice = spawnSync('soffice', ['--version']).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'quoin-oracle-'));

function python(script, ...args) {
  const r = spawnSync('python3', ['-c', script, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('oracle: oletools decompresses what our OVBA compressor writes', { skip: !havePython }, () => {
  const rnd = (n, seed) => {
    let s = seed;
    return Uint8Array.from({ length: n }, () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 24));
  };
  const text = new TextEncoder().encode('Sub X()\r\n    MsgBox "hi"\r\nEnd Sub\r\n'.repeat(900));
  const inputs = [new Uint8Array(0), text.subarray(0, 1), text.subarray(0, 4095), text.subarray(0, 4096), text.subarray(0, 4097), text, rnd(8192, 5), new Uint8Array(50000).fill(65)];
  inputs.forEach((b, i) => {
    writeFileSync(join(dir, `o${i}.in`), b);
    writeFileSync(join(dir, `o${i}.cmp`), compress(b));
  });
  const out = python(`
import sys
from oletools.olevba import decompress_stream
d=sys.argv[1]
bad=0
for i in range(${inputs.length}):
    exp=open(f'{d}/o{i}.in','rb').read()
    got=bytes(decompress_stream(bytearray(open(f'{d}/o{i}.cmp','rb').read())))
    if got!=exp: bad+=1
print(bad)
`, dir);
  assert.equal(out.trim(), '0');
});

test('oracle: olevba extracts edited source from a rewritten project', { skip: !havePython }, () => {
  const bytes = fixture('xw_vbaProject01.bin');
  const p = readVbaProject(bytes);
  const std = p.modules.find((m) => m.kind === 'standard');
  const marker = `' quoin-marker-${std.name}`;
  const out = writeVbaProject(p, new Map([[std.name, `${std.model.visible}\n${marker}\n`]]));
  const file = join(dir, 'rewritten.bin');
  writeFileSync(file, out);
  const res = python(`
import sys
from oletools.olevba import VBA_Parser
vp=VBA_Parser(sys.argv[1])
for (_f,_s,name,code) in vp.extract_macros():
    print(name+'::'+code.replace('\\r','').replace('\\n','|'))
`, file);
  assert.match(res, new RegExp(`quoin-marker-${std.name}`));
  for (const m of p.modules) assert.ok(res.includes(`${m.name}`), m.name);
});

test('oracle: olefile opens every compound file we write', { skip: !havePython }, () => {
  const p = readVbaProject(fixture('xw_vbaProject05.bin'));
  const file = join(dir, 'p5.bin');
  writeFileSync(file, writeVbaProject(p, new Map()));
  const out = python(`
import sys, olefile
o=olefile.OleFileIO(sys.argv[1])
names=['/'.join(x) for x in o.listdir(streams=True)]
print(len(names), o.exists('VBA/dir'), o.exists('VBA/_VBA_PROJECT'))
`, file);
  assert.match(out.trim(), /^\d+ True True$/);
});

test('oracle: Python zipfile and openpyxl accept saved workbooks', { skip: !havePython }, async () => {
  const wb = await openWorkbook(fixture('pq_vba_complex.xlsm'), 'c.xlsm');
  const q = wb.queries.find((x) => x.name === 'RawInput');
  const mod = wb.vba.project.modules.find((m) => m.name === 'Sheet1');
  const res = await buildWorkbook(wb, { queryEdits: new Map([[q.name, `${q.original}\n// edited`]]), vbaEdits: new Map([[mod.name, `${mod.model.visible}\n' v\n`]]), checkSection });
  const file = join(dir, 'saved.xlsm');
  writeFileSync(file, res.bytes);
  const out = python(`
import sys, zipfile, openpyxl, base64, struct, io, re
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
raw=z.read('customXml/item1.xml').decode('utf-16')
b=base64.b64decode(re.search(r'<DataMashup[^>]*>(.*)</DataMashup>',raw,re.S).group(1))
n1=struct.unpack_from('<I',b,4)[0]
pz=zipfile.ZipFile(io.BytesIO(b[8:8+n1]))
sec=pz.read('Formulas/Section1.m').decode()
wb=openpyxl.load_workbook(sys.argv[1], keep_vba=True)
print('// edited' in sec, len(wb.sheetnames))
`, file);
  assert.match(out.trim(), /^True \d+$/);
});

test('oracle: LibreOffice opens a saved workbook and exports its cells', { skip: !(havePython && haveSoffice), timeout: 180000 }, async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 's.xlsx');
  const q = wb.queries[0];
  const res = await buildWorkbook(wb, { queryEdits: new Map([[q.name, `${q.original}\n// lo`]]), checkSection });
  const file = join(dir, 'lo.xlsx');
  writeFileSync(file, res.bytes);
  const outDir = join(dir, 'lo-out');
  const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'csv', '--outdir', outDir, file], { encoding: 'utf8', timeout: 150000 });
  assert.equal(r.status, 0, r.stderr);
  const csv = readdirSync(outDir).find((f) => f.endsWith('.csv'));
  assert.ok(csv);
  assert.ok(readFileSync(join(outDir, csv), 'utf8').length > 10);
});
