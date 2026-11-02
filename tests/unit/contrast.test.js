import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './helpers.js';

const css = readFileSync(join(root, 'styles', 'tokens.css'), 'utf8');
const pairs = JSON.parse(readFileSync(join(root, 'tests', 'a11y', 'pairs.json'), 'utf8'));

function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let k = open; k < css.length; k++) {
    if (css[k] === '{') depth++;
    if (css[k] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, k);
    }
  }
  return '';
}

function tokens(text) {
  const out = {};
  for (const m of text.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const light = tokens(block(':root {'));
const dark = tokens(block(':root[data-theme="dark"]'));

for (const [theme, set] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg, min] of pairs[theme]) {
    test(`T-A11Y-3: ${theme} ${fg} on ${bg} meets ${min}:1`, () => {
      const r = ratio(set[fg], set[bg]);
      assert.ok(r >= min, `${set[fg]} on ${set[bg]} is ${r.toFixed(2)}:1`);
    });
  }
}

test('the media-query dark block matches the explicit dark theme tokens', () => {
  const auto = tokens(block('@media (prefers-color-scheme: dark)'));
  for (const k of Object.keys(dark)) assert.equal(auto[k], dark[k], k);
});
