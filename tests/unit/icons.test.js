import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './helpers.js';
import { decodePng } from './png.js';

const pub = (n) => join(root, 'public', n);
const png = (n) => decodePng(readFileSync(pub(n)));
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-192.png': 192, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180 };

for (const [name, size] of Object.entries(SIZES)) {
  test(`T-B-22: ${name} is ${size} by ${size}`, () => {
    const img = png(name);
    assert.equal(img.width, size);
    assert.equal(img.height, size);
  });
}

for (const name of ['icon-maskable-192.png', 'icon-maskable-512.png']) {
  test(`T-B-22: ${name} fills every corner and edge midpoint with the ink ground`, () => {
    const img = png(name);
    const last = img.width - 1;
    const mid = Math.floor(img.width / 2);
    for (const [x, y] of [[0, 0], [last, 0], [0, last], [last, last], [mid, 0], [mid, last], [0, mid], [last, mid]]) {
      const p = img.pixel(x, y);
      assert.equal(p.a, 255, `alpha at ${x},${y}`);
      assert.equal(hex(p), '#111413', `colour at ${x},${y}`);
    }
  });

  test(`T-B-22: ${name} keeps the artwork inside the circular safe zone`, () => {
    const img = png(name);
    const c = (img.width - 1) / 2;
    const safe = img.width * 0.4;
    let outside = 0;
    for (let y = 0; y < img.width; y += 2) {
      for (let x = 0; x < img.width; x += 2) {
        if (Math.hypot(x - c, y - c) <= safe) continue;
        if (hex(img.pixel(x, y)) !== '#111413') outside++;
      }
    }
    assert.equal(outside, 0);
  });
}

test('T-B-22: the apple touch icon is opaque and the any icons show the mark', () => {
  const apple = png('apple-touch-icon.png');
  for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179], [90, 90]]) assert.equal(apple.pixel(x, y).a, 255);
  for (const name of ['icon-192.png', 'icon-512.png']) {
    const img = png(name);
    const mid = Math.floor(img.width / 2);
    let sodium = 0;
    for (let y = mid; y < img.width; y++) for (let x = mid; x < img.width; x++) if (hex(img.pixel(x, y)) === '#FFC21F') sodium++;
    assert.ok(sodium > 50, `${name} has a sodium block`);
  }
});

test('T-B-22: the manifest lists any and maskable icons separately and the files exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  const purposes = new Set(manifest.icons.map((i) => i.purpose));
  assert.deepEqual([...purposes].sort(), ['any', 'maskable']);
  for (const i of manifest.icons) {
    assert.equal(existsSync(join(root, i.src)), true, i.src);
    assert.equal(i.purpose === 'maskable', i.src.includes('maskable'));
  }
});

for (const name of ['favicon.svg', 'mark.svg', 'mark-dark.svg', 'icon-maskable.svg']) {
  test(`T-I-07: ${name} parses, has no script, no external reference and no comment`, () => {
    const text = readFileSync(pub(name), 'utf8');
    assert.ok(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(text));
    assert.ok(/<\/svg>\s*$/.test(text));
    assert.equal(/<script/i.test(text), false);
    assert.equal(/<!--/.test(text), false);
    assert.equal(/(?:href|xlink:href)\s*=/.test(text), false);
    assert.equal(/url\(\s*['"]?https?:/i.test(text), false);
    assert.equal(/<image/i.test(text), false);
    const opens = (text.match(/<(?!\/|\?|!)[a-zA-Z]/g) || []).length;
    const closes = (text.match(/<\/[a-zA-Z]+>|\/>/g) || []).length;
    assert.equal(opens, closes);
  });
}

test('T-I-07: only the favicon carries a style element, and it follows the colour scheme', () => {
  assert.equal(/<style/.test(readFileSync(pub('favicon.svg'), 'utf8')), true);
  assert.equal(/prefers-color-scheme: dark/.test(readFileSync(pub('favicon.svg'), 'utf8')), true);
  for (const name of ['mark.svg', 'mark-dark.svg', 'icon-maskable.svg']) assert.equal(/<style/.test(readFileSync(pub(name), 'utf8')), false, name);
});
