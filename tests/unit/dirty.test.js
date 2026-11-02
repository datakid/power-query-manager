import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Session } from '../../src/app/session.js';
import { changedQueryEdits } from '../../src/core/pq/writeback.js';
import { normalizeQueryText } from '../../src/core/pq/section.js';
import { fixture, root } from './helpers.js';

const fileOf = (name) => {
  const bytes = fixture(name);
  return { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

test('T-B-03: a trailing newline is not a change in the session or in the writer', async () => {
  const s = new Session();
  const wb = await s.open(fileOf('pq_simple.xlsx'));
  const q = wb.queries[0];
  const item = { type: 'query', name: q.name };
  s.setText(item, `${q.original}\n`);
  assert.equal(s.editCount, 0);
  s.setText(item, `\n\n${q.original}  \r\n`);
  assert.equal(s.editCount, 0);
  assert.equal(changedQueryEdits(wb, new Map([[q.name, `${q.original}\n`]])).size, 0);
  assert.equal(changedQueryEdits(wb, new Map([[q.name, `  ${q.original}\t\n`]])).size, 0);
});

test('T-B-03: a real change is a change in both places', async () => {
  const s = new Session();
  const wb = await s.open(fileOf('pq_simple.xlsx'));
  const q = wb.queries[0];
  s.setText({ type: 'query', name: q.name }, `${q.original}\n// note\n`);
  assert.equal(s.editCount, 1);
  assert.equal(changedQueryEdits(wb, s.queryEdits).size, 1);
});

test('T-B-03: normalizeQueryText trims both ends and nothing else', () => {
  assert.equal(normalizeQueryText('  \n a  b \r\n'), 'a  b');
  assert.equal(normalizeQueryText(''), '');
});

test('T-B-03: the query-text trimming expression exists in exactly one source file', () => {
  const hits = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js') && /replace\(\/\^\\s\+\/, ''\)\.replace\(\/\\s\+\$\/, ''\)/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(root.length + 1).split('\\').join('/'));
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(hits, ['src/core/pq/section.js']);
});
