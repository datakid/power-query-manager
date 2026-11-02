import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedFileName, extensionFor, sanitizeFileName } from '../../src/core/filename.js';

const CASES = [
  ['xlsx', false, 'xlsx'],
  ['xlsx', true, 'xlsm'],
  ['xlsm', false, 'xlsm'],
  ['xlsm', true, 'xlsm'],
  ['xltx', false, 'xltx'],
  ['xltx', true, 'xltm'],
  ['xltm', false, 'xltm'],
  ['xltm', true, 'xltm']
];

for (const [format, hasVba, expected] of CASES) {
  test(`T-B-01: ${format} with vba=${hasVba} is saved as .${expected}`, () => {
    assert.equal(extensionFor(format, hasVba), expected);
    const wb = { fileName: `book.${format}`, format, vba: hasVba ? {} : null };
    assert.equal(suggestedFileName(wb), `book (edited).${expected}`);
  });
}

test('T-B-01: a macro-enabled template keeps its template extension', () => {
  assert.equal(suggestedFileName({ fileName: 'Budget.xltm', format: 'xltm', vba: { project: {} } }), 'Budget (edited).xltm');
});

test('T-B-01: an unknown format keeps the original extension', () => {
  assert.equal(suggestedFileName({ fileName: 'a.b.zip', format: 'other', vba: null }), 'a.b (edited).zip');
});

const hasLoneSurrogate = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

test('T-B-02: truncation never leaves half a surrogate pair', () => {
  const name = `${'a'.repeat(114)}\u{20000}${'b'.repeat(20)}`;
  const out = sanitizeFileName(name, '.xlsx');
  assert.equal(hasLoneSurrogate(out), false);
  assert.ok(out.endsWith('.xlsx'));
  assert.ok([...out].length <= 120);
});

test('T-B-02: truncation inside a run of astral characters is clean', () => {
  const out = sanitizeFileName('\u{20000}'.repeat(200), '.m');
  assert.equal(hasLoneSurrogate(out), false);
  assert.ok([...out].length <= 120);
});

test('T-B-02: trailing dots and spaces are removed', () => {
  assert.equal(sanitizeFileName('  ....  ', '.csv'), 'file.csv');
  assert.equal(sanitizeFileName('report. . ', '.csv'), 'report.csv');
  const cut = `${'a'.repeat(114)} . . .`;
  const out = sanitizeFileName(cut, '.xlsx');
  assert.equal(out.replace(/\.xlsx$/, '').endsWith(' '), false);
  assert.equal(out.replace(/\.xlsx$/, '').endsWith('.'), false);
});

test('T-B-02: Windows reserved device names are prefixed', () => {
  for (const n of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9', 'CON.backup']) {
    const out = sanitizeFileName(n, '.xlsx');
    assert.ok(out.startsWith('_'), `${n} -> ${out}`);
    assert.ok(out.endsWith('.xlsx'));
  }
  assert.equal(sanitizeFileName('CONSOLE', '.xlsx'), 'CONSOLE.xlsx');
  assert.equal(sanitizeFileName('COM10', '.xlsx'), 'COM10.xlsx');
});

test('T-B-02: the extension is stripped case-insensitively', () => {
  assert.equal(sanitizeFileName('report.XLSX', '.xlsx'), 'report.xlsx');
});

test('T-B-02: a 400-character name fits and keeps the extension', () => {
  const out = sanitizeFileName('n'.repeat(400), '.xlsm');
  assert.ok(out.endsWith('.xlsm'));
  assert.ok([...out].length <= 120);
});

test('T-B-02: a name of only banned characters is never empty', () => {
  assert.equal(sanitizeFileName('???', '.m'), '___.m');
  assert.equal(sanitizeFileName('', '.m'), 'file.m');
});

test('T-B-02: the existing behaviour is kept', () => {
  assert.equal(sanitizeFileName('a/b:c*?.m', '.m'), 'a_b_c__.m');
  assert.equal(sanitizeFileName('..hidden', '.m'), 'hidden.m');
  assert.equal(sanitizeFileName('Report.csv', '.csv'), 'Report.csv');
});
