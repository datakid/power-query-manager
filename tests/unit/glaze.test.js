import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './helpers.js';
import { cssBlock, colourTokens, ratio } from './contrast-lib.js';

const css = readFileSync(join(root, 'styles', 'tokens.css'), 'utf8');
const themes = {
  light: colourTokens(cssBlock(css, ':root {')).hex,
  dark: colourTokens(cssBlock(css, ':root[data-theme="dark"]')).hex
};

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function oklchChroma(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, bb);
}

for (const [theme, set] of Object.entries(themes)) {
  test(`T-I-08: no ${theme} colour token has OKLCH chroma above 0.12`, () => {
    const loud = Object.entries(set).filter(([, v]) => oklchChroma(v) > 0.12).map(([k, v]) => `${k} ${v}`);
    assert.deepEqual(loud, []);
  });
}

test('T-I-08: the old palette names resolve nowhere', () => {
  for (const name of ['sodium', 'cobalt', 'patina', 'minium', 'heather', 'flax', 'lichen', 'clay', 'readout-alert', 'marker']) {
    assert.equal(new RegExp(`--${name}\\b`).test(css), false, name);
  }
});

const svg = (name) => readFileSync(join(root, 'public', name), 'utf8');
const attr = (text, re) => (text.match(re) || [])[1];

test('T-I-09: the favicon ring reaches 3:1 on its own ground in both colour schemes', () => {
  const text = svg('favicon.svg');
  const lightRing = attr(text, /\.r\{stroke:(#[0-9A-Fa-f]{6})\}/);
  const darkRing = attr(text, /prefers-color-scheme:\s*dark\)\{\.r\{stroke:(#[0-9A-Fa-f]{6})\}/);
  assert.ok(lightRing && darkRing);
  assert.ok(ratio(lightRing, themes.light['--ground']) >= 3);
  assert.ok(ratio(darkRing, themes.dark['--ground']) >= 3);
});

test('T-I-09: the maskable icon ring reaches 3:1 on its readout ground', () => {
  const text = svg('icon-maskable.svg');
  const ground = attr(text, /<rect width="128" height="128" fill="(#[0-9A-Fa-f]{6})"/);
  const ring = attr(text, /stroke="(#[0-9A-Fa-f]{6})"/);
  assert.ok(ratio(ring, ground) >= 3);
});

test('T-I-09: the dark mark ring reaches 3:1 on the dark ground and the light mark ring on the light ground', () => {
  const dark = svg('mark-dark.svg');
  const light = svg('mark.svg');
  assert.ok(ratio(attr(dark, /stroke="(#[0-9A-Fa-f]{6})"/), themes.dark['--ground']) >= 3);
  assert.ok(ratio(attr(light, /color="(#[0-9A-Fa-f]{6})"/), themes.light['--ground']) >= 3);
});
