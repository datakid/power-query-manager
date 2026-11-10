import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapCodeLines, splitCodeText, HANG_COLUMNS } from '../../src/core/print/code-lines.js';

const wrap = (text, columns = 20, tabWidth = 4) => wrapCodeLines({ lines: splitCodeText(text), columns, tabWidth });

test('T-P-11: a line of exactly the column count is not wrapped', () => {
  const r = wrap('a'.repeat(20));
  assert.deepEqual(r, [{ number: 1, text: 'a'.repeat(20), continued: false }]);
});

test('T-P-11: one character more wraps once and marks the continuation', () => {
  const r = wrap('a'.repeat(21));
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.continued), [false, true]);
  assert.deepEqual(r.map((x) => x.number), [1, 1]);
  assert.equal(r.map((x) => x.text).join(''), 'a'.repeat(21));
});

test('T-P-11: a 5,000 character token is hard-broken and loses nothing', () => {
  const r = wrap('x'.repeat(5000), 80);
  assert.equal(r.map((x) => x.text).join('').length, 5000);
  assert.ok(r[0].text.length <= 80);
  assert.ok(r.slice(1).every((x) => x.text.length <= 80 - HANG_COLUMNS));
  assert.ok(r.slice(1).every((x) => x.continued));
});

test('T-P-11: it breaks after a space or operator in the last fifth of the line when there is one', () => {
  const r = wrap('alpha beta gamma delta epsilon', 20);
  assert.equal(r[0].text, 'alpha beta gamma ');
  assert.equal(r.map((x) => x.text).join(''), 'alpha beta gamma delta epsilon');
  const op = wrap('abcdefghijklmnop+qrstuvwxyz', 20);
  assert.equal(op[0].text, 'abcdefghijklmnop+');
});

test('T-P-11: tabs expand to the next tab stop', () => {
  assert.equal(wrap('\tx')[0].text, '    x');
  assert.equal(wrap('ab\tx')[0].text, 'ab  x');
  assert.equal(wrap('\tx', 20, 2)[0].text, '  x');
});

test('T-P-11: CRLF, CR and LF all split lines, and numbers stay true across wraps', () => {
  assert.deepEqual(splitCodeText('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
  const r = wrap(`${'a'.repeat(30)}\nsecond`);
  assert.deepEqual(r.map((x) => x.number), [1, 1, 2]);
});

test('T-P-11: an empty file has no lines and an empty line is kept', () => {
  assert.deepEqual(wrap(''), []);
  assert.deepEqual(wrap('a\n\nb').map((x) => x.text), ['a', '', 'b']);
});
