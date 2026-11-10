import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERRORS, errorMessage, S } from '../../src/ui/strings.js';
import { root } from './helpers.js';

const sources = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') && !p.endsWith('strings.js')) sources.push(readFileSync(p, 'utf8'));
  }
};
walk(join(root, 'src'));
const all = sources.join('\n');

test('T-E-11: every message names what happened and what to do or what was kept, without banned words', () => {
  for (const [code, text] of Object.entries(ERRORS)) {
    if (/^\{\w+\}$/.test(text)) continue;
    assert.ok(text.length > 10, code);
    assert.equal(/!/.test(text), false, code);
    assert.equal(/\b(please|oops|sorry)\b/i.test(text), false, code);
  }
});

test('T-E-11: no key in the error table is unused', () => {
  const unused = Object.keys(ERRORS).filter((k) => !all.includes(`'${k}'`) && !all.includes(`"${k}"`));
  assert.deepEqual(unused, []);
});

test('T-E-11: an unknown code gets the generic message, never the code', () => {
  assert.equal(errorMessage('zip.nothing'), S.readFailed);
  assert.equal(errorMessage(undefined), S.readFailed);
});

test('T-E-11: placeholders in a message are filled from the values given', () => {
  assert.match(errorMessage('vba.encoding', { line: 3, col: 4, char: 'x', cp: 1252 }), /Line 3, column 4: x cannot be saved in code page 1252/);
  assert.equal(/\{/.test(errorMessage('m.timeout', { s: 30 })), false);
});
