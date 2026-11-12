import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultStore, cellsOf } from '../../src/core/wb/result-store.js';

const table = (rows, cols = 2) => ({ columns: Array.from({ length: cols }, (_, i) => `c${i}`), rowCount: rows });

test('T-WB-08: least recently used results are evicted first once the count limit is hit', () => {
  const s = new ResultStore({ maxResults: 3, maxCells: 1e9 });
  const a = s.add({ value: 1 }).id;
  const b = s.add({ value: 2 }).id;
  const c = s.add({ value: 3 }).id;
  s.get(a);
  const d = s.add({ value: 4 });
  assert.deepEqual(d.evicted, [b]);
  assert.deepEqual(s.ids().sort(), [a, c, d.id].sort());
});

test('T-WB-08: pinned results are evicted last', () => {
  const s = new ResultStore({ maxResults: 3, maxCells: 1e9 });
  const a = s.add({ value: 1 }).id;
  s.pin(a);
  const b = s.add({ value: 2 }).id;
  const c = s.add({ value: 3 }).id;
  const out = [];
  for (let i = 0; i < 8; i++) out.push(...s.add({ value: i }).evicted);
  assert.ok(s.has(a));
  assert.ok(!out.includes(a));
  assert.ok(!s.has(b) && !s.has(c));
});

test('T-WB-08: two pinned results survive eight more runs and both still read back', () => {
  const s = new ResultStore({ maxResults: 4, maxCells: 1e9 });
  const p1 = s.add({ value: 'one' }).id;
  const p2 = s.add({ value: 'two' }).id;
  s.pin(p1);
  s.pin(p2);
  for (let i = 0; i < 8; i++) s.add({ value: i });
  assert.equal(s.get(p1).value, 'one');
  assert.equal(s.get(p2).value, 'two');
  assert.equal(s.size, 4);
});

test('T-WB-08: pinned results are evicted, oldest first, only when nothing else can go', () => {
  const s = new ResultStore({ maxResults: 2, maxCells: 1e9 });
  const a = s.add({ value: 1 }).id;
  s.pin(a);
  const b = s.add({ value: 2 }).id;
  s.pin(b);
  const c = s.add({ value: 3 });
  assert.deepEqual(c.evicted, [a]);
  assert.deepEqual(s.ids(), [b, c.id]);
});

test('T-WB-08: step results of one evaluation share a group and go together', () => {
  const s = new ResultStore({ maxResults: 5, maxCells: 1e9 });
  const g = s.newGroup();
  const steps = [1, 2, 3].map((v) => s.add({ value: v, group: g }).id);
  const other = s.add({ value: 'x' }).id;
  const next = s.add({ value: 'y' });
  const z = s.add({ value: 'z' });
  assert.deepEqual(next.evicted, []);
  assert.deepEqual(z.evicted.sort(), [...steps].sort());
  assert.ok(s.has(other));
});

test('T-WB-08: a group keeps its pinned member when the rest is evicted', () => {
  const s = new ResultStore({ maxResults: 4, maxCells: 1e9 });
  const g = s.newGroup();
  const ids = [1, 2, 3].map((v) => s.add({ value: v, group: g }).id);
  s.pin(ids[1]);
  s.add({ value: 'a' });
  const r = s.add({ value: 'b' });
  assert.deepEqual(r.evicted.sort(), [ids[0], ids[2]].sort());
  assert.ok(s.has(ids[1]));
});

test('T-WB-08: the cell budget evicts too, and the newest result is never evicted by its own arrival', () => {
  const s = new ResultStore({ maxResults: 32, maxCells: 100 });
  const a = s.add({ value: table(20, 2) }).id;
  const b = s.add({ value: table(20, 2) }).id;
  const c = s.add({ value: table(20, 2) });
  assert.deepEqual(c.evicted, [a]);
  const huge = s.add({ value: table(1000, 2) });
  assert.deepEqual(huge.evicted.sort(), [b, c.id].sort());
  assert.deepEqual(s.ids(), [huge.id]);
});

test('T-WB-08: release removes one result, clear removes all, unknown ids are refused', () => {
  const s = new ResultStore();
  const a = s.add({ value: 1 }).id;
  const b = s.add({ value: 2 }).id;
  assert.equal(s.release(a), true);
  assert.equal(s.release(a), false);
  assert.equal(s.pin('nope'), false);
  assert.deepEqual(s.clear(), [b]);
  assert.equal(s.size, 0);
});

test('T-WB-08: ids are unique and the defaults are 32 results and six million cells', () => {
  const s = new ResultStore();
  assert.equal(s.maxResults, 32);
  assert.equal(s.maxCells, 6000000);
  const ids = new Set();
  for (let i = 0; i < 40; i++) ids.add(s.add({ value: i }).id);
  assert.equal(ids.size, 40);
  assert.equal(s.size, 32);
});

test('T-WB-08: cells are estimated from rows times columns, one for anything else', () => {
  assert.equal(cellsOf(table(10, 3)), 30);
  assert.equal(cellsOf(table(0, 3)), 1);
  assert.equal(cellsOf('text'), 1);
  assert.equal(cellsOf(null), 1);
});
