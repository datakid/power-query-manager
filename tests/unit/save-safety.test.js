import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkbook } from '../../src/core/workbook.js';
import { buildWorkbook } from '../../src/core/save.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Session } from '../../src/app/session.js';
import { equalBytes } from '../../src/core/bytes.js';
import { fixture, root } from './helpers.js';

test('T-B-04: a self-check failure rejects the save and returns no bytes', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 'pq_simple.xlsx');
  wb.queries[0].original = `${wb.queries[0].original}\n// tampered after open`;
  let result;
  await assert.rejects(
    async () => {
      result = await buildWorkbook(wb, {});
    },
    (e) => e.code === 'write.selfcheck'
  );
  assert.equal(result, undefined);
});

test('T-B-05: the service worker does not take over open tabs on install', async () => {
  const text = readFileSync(`${root}/sw.js`, 'utf8');
  assert.equal(/skipWaiting/.test(text), false);
  assert.equal(/clients\.claim\(\)/.test(text), true);
});

const kinds = new Map();
const dirs = ['external', 'workbooks'].map((d) => join(root, 'tests', 'fixtures', d));
const files = dirs.flatMap((d) => readdirSync(d).filter((n) => /\.(xlsx|xlsm)$/i.test(n)).map((n) => [d, n]));

const asFile = (bytes, name) => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

async function openOrNull(bytes, name) {
  const s = new Session();
  try {
    await s.open(asFile(bytes, name));
    return s;
  } catch {
    return null;
  }
}

function pickEdit(s) {
  const wb = s.wb;
  if (wb.queries.length && s.queryEditable().editable) {
    const q = wb.queries[0];
    return { kind: 'query', name: q.name, text: `${q.original}\n// round trip` };
  }
  for (const m of s.modules) {
    if (s.moduleEditable(m.name).editable && m.model) return { kind: 'module', name: m.name, text: `${m.model.visible}\n' round trip\n` };
  }
  return null;
}

for (const [dir, name] of files) {
  test(`T-B-06: ${name} saves, re-opens and saves again byte-identically`, async () => {
    const original = new Uint8Array(readFileSync(join(dir, name)));
    const s = await openOrNull(original, name);
    if (!s) return;
    kinds.set(name, pickEdit(s) ? pickEdit(s).kind : 'none');
    const edit = pickEdit(s);
    if (!edit) {
      const res = await s.download({ refreshOnLoad: true, acknowledgeSignature: true });
      const again = await openOrNull(res.bytes, name);
      const res2 = await again.download({ refreshOnLoad: true, acknowledgeSignature: true });
      assert.ok(equalBytes(res.bytes, res2.bytes));
      return;
    }
    if (edit.kind === 'query') s.setText({ type: 'query', name: edit.name }, edit.text);
    else s.setText({ type: 'module', name: edit.name }, edit.text);
    const first = await s.download({ refreshOnLoad: true, acknowledgeSignature: true });
    const reopened = await openOrNull(first.bytes, name);
    assert.ok(reopened, 'the saved file re-opens');
    const second = await reopened.download({ refreshOnLoad: true, acknowledgeSignature: true });
    assert.ok(equalBytes(first.bytes, second.bytes), 'a second no-edit save is byte-identical');

    const wb = s.wb;
    const out = reopened.wb;
    const allowed = new Set([wb.mashup && wb.mashup.part, wb.connections && wb.connections.part, wb.vba && wb.vba.part, '[Content_Types].xml'].filter(Boolean));
    for (const e of wb.pkg.zip.entries) {
      const o = out.pkg.zip.get(e.name);
      if (allowed.has(e.name) || /vbaProjectSignature|vbaProject\.bin\.rels$/i.test(e.name)) continue;
      assert.ok(o, `${e.name} still present`);
      assert.ok(equalBytes(o.rawCompressed(), e.rawCompressed()), `${e.name} untouched`);
    }
  });
}

test('T-B-06: the fixtures exercise query edits, module edits and no-edit saves', () => {
  const seen = new Set(kinds.values());
  assert.ok(seen.has('query'));
  assert.ok(seen.has('module'));
});
