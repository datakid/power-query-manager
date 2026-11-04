import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffStats } from '../../src/core/diff.js';

const kinds = (d) => d.map((l) => `${l.kind[0]}:${l.text}`);

test('T-E-03: empty against empty is empty', () => {
  assert.deepEqual(diffLines('', ''), []);
});

test('T-E-03: identical text is all unchanged with line numbers on both sides', () => {
  const d = diffLines('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(kinds(d), ['s:a', 's:b', 's:c']);
  assert.deepEqual(d.map((l) => [l.a, l.b]), [[1, 1], [2, 2], [3, 3]]);
});

test('T-E-03: all new and all removed', () => {
  assert.deepEqual(kinds(diffLines('', 'x\ny')), ['a:x', 'a:y']);
  assert.deepEqual(kinds(diffLines('x\ny', '')), ['d:x', 'd:y']);
  assert.deepEqual(diffStats(diffLines('', 'x\ny')), { added: 2, removed: 0 });
});

test('T-E-03: interleaved changes keep order and numbering', () => {
  const d = diffLines('one\ntwo\nthree\nfour', 'one\n2\nthree\nfour\nfive');
  assert.deepEqual(kinds(d), ['s:one', 'd:two', 'a:2', 's:three', 's:four', 'a:five']);
  assert.deepEqual(d.find((l) => l.text === 'two'), { kind: 'del', a: 2, text: 'two' });
  assert.deepEqual(d.find((l) => l.text === '2'), { kind: 'add', b: 2, text: '2' });
  assert.deepEqual(d.find((l) => l.text === 'four'), { kind: 'same', a: 4, b: 4, text: 'four' });
  assert.deepEqual(diffStats(d), { added: 2, removed: 1 });
});

test('T-E-03: CRLF against LF is not a change', () => {
  const d = diffLines('a\r\nb\r\nc', 'a\nb\nc');
  assert.deepEqual(kinds(d), ['s:a', 's:b', 's:c']);
  assert.deepEqual(kinds(diffLines('a\rb', 'a\nb')), ['s:a', 's:b']);
});

test('T-E-03: a moved block shows as a delete and an add, never as unchanged', () => {
  const d = diffLines('a\nb\nc\nd', 'c\nd\na\nb');
  assert.equal(d.filter((l) => l.kind === 'same').length, 2);
  assert.equal(diffStats(d).added, 2);
  assert.equal(diffStats(d).removed, 2);
});

test('T-E-03: a large pair of inputs still returns', () => {
  const a = Array.from({ length: 1500 }, (_, i) => `line ${i}`).join('\n');
  const b = Array.from({ length: 1500 }, (_, i) => (i % 100 === 0 ? `changed ${i}` : `line ${i}`)).join('\n');
  const d = diffLines(a, b);
  assert.equal(diffStats(d).added, 15);
  assert.equal(diffStats(d).removed, 15);
});
