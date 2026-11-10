import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModuleText } from '../../src/core/vba/validate.js';
import { DEFAULT_LIMITS } from '../../src/core/limits.js';

const check = (text, extra = {}) => validateModuleText({ text, codePage: 1252, ...extra });

test('T-E-04: clean text has no problems', () => {
  assert.deepEqual(check('Option Explicit\r\nSub A()\r\nEnd Sub\r\n'), []);
});

test('T-E-04: a NUL is reported with its line and column', () => {
  const p = check('a\nbc\u0000d');
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].code, p[0].line, p[0].col], ['vba.nul', 2, 3]);
});

test('T-E-04: a lone surrogate is reported, a valid pair is not a surrogate problem', () => {
  assert.equal(check('x\uD800y')[0].code, 'vba.surrogate');
  const pair = check('a\u{1F600}', { codePage: 65001 });
  assert.deepEqual(pair, []);
});

test('T-E-04: a character outside the code page names the character, line, column and page', () => {
  const p = check("Sub A()\n    x = 1 ' arrow \u2192 here\nEnd Sub");
  assert.equal(p.length, 1);
  assert.equal(p[0].code, 'vba.encoding');
  assert.equal(p[0].char, '\u2192');
  assert.deepEqual([p[0].line, p[0].col, p[0].cp], [2, 19, 1252]);
  assert.equal(check('price \u20AC 5').length, 0);
  assert.equal(check('caf\u00E9').length, 0);
});

test('T-E-04: only the first unencodable character on a line is reported', () => {
  assert.equal(check('\u2192 \u2190 \u2191').length, 1);
});

test('T-E-04: a line longer than 1023 characters is reported with its length', () => {
  const ok = check('a'.repeat(1023));
  assert.deepEqual(ok, []);
  const p = check(`ok\n${'a'.repeat(1024)}`);
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].code, p[0].line, p[0].n, p[0].max], ['vba.lineLength', 2, 1024, 1023]);
});

test('T-E-04: an Attribute line typed into the visible text is reported', () => {
  const p = check('Sub A()\n  Attribute VB_Name = "x"\nEnd Sub');
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].code, p[0].line], ['vba.attribute', 2]);
  assert.deepEqual(check('Attributes = 2'), []);
});

test('T-E-04: a module over the size limit is reported once', () => {
  const limits = { ...DEFAULT_LIMITS, maxModuleBytes: 100 };
  const p = check('a\n'.repeat(60), { limits });
  assert.deepEqual(p.map((x) => x.code), ['vba.tooLarge']);
});

test('T-E-04: offsets point at the offending character across CRLF', () => {
  const text = 'a\r\nb \u2192';
  const [p] = check(text);
  assert.equal(text.slice(p.start, p.end), '\u2192');
});
