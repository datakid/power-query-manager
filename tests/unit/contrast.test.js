import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './helpers.js';
import { cssBlock, colourTokens, contrastProblems, ratio } from './contrast-lib.js';

const css = readFileSync(join(root, 'styles', 'tokens.css'), 'utf8');
const pairs = JSON.parse(readFileSync(join(root, 'tests', 'a11y', 'pairs.json'), 'utf8'));

const lightBlock = cssBlock(css, ':root {');
const darkBlock = cssBlock(css, ':root[data-theme="dark"]');
const light = colourTokens(lightBlock).hex;
const dark = colourTokens(darkBlock).hex;

for (const [theme, set] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg, min] of pairs[theme]) {
    test(`T-A11Y-3: ${theme} ${fg} on ${bg} meets ${min}:1`, () => {
      assert.ok(set[fg] && set[bg], `${fg} or ${bg} is not a plain hex token in the ${theme} block`);
      const r = ratio(set[fg], set[bg]);
      assert.ok(r >= min, `${set[fg]} on ${set[bg]} is ${r.toFixed(2)}:1`);
    });
  }
}

test('T-B-21: every token named in pairs.json exists, every colour token is covered or exempt, nothing is not plain hex', () => {
  assert.deepEqual(contrastProblems({ light: lightBlock, dark: darkBlock, pairs }), []);
});

test('the media-query dark block matches the explicit dark theme tokens', () => {
  const auto = colourTokens(cssBlock(css, '@media (prefers-color-scheme: dark)')).hex;
  for (const k of Object.keys(dark)) assert.equal(auto[k], dark[k], k);
});

const MINI_LIGHT = '--ink: #111111; --ground: #FFFFFF;';
const MINI_DARK = '--ink: #EEEEEE; --ground: #000000;';
const MINI_PAIRS = { light: [['--ink', '--ground', 4.5]], dark: [['--ink', '--ground', 4.5]] };

test('T-B-21: the checker passes a complete palette', () => {
  assert.deepEqual(contrastProblems({ light: MINI_LIGHT, dark: MINI_DARK, pairs: MINI_PAIRS }), []);
});

test('T-B-21: the checker reports a token that no pair covers', () => {
  const problems = contrastProblems({ light: `${MINI_LIGHT} --extra: #123456;`, dark: `${MINI_DARK} --extra: #654321;`, pairs: MINI_PAIRS });
  assert.deepEqual(problems, ['uncovered:--extra']);
});

test('T-B-21: the checker reports a pair whose token is missing from a theme', () => {
  const problems = contrastProblems({ light: MINI_LIGHT, dark: '--ink: #EEEEEE;', pairs: MINI_PAIRS });
  assert.deepEqual(problems, ['missing:dark:--ground']);
});

test('T-B-21: dropping a pair makes its tokens uncovered instead of greener', () => {
  const problems = contrastProblems({ light: `${MINI_LIGHT} --accent: #336699;`, dark: `${MINI_DARK} --accent: #99CCFF;`, pairs: { light: [['--ink', '--ground', 4.5]], dark: [['--ink', '--ground', 4.5]] } });
  assert.deepEqual(problems, ['uncovered:--accent']);
});

test('T-B-21: shorthand hex is read, other colour syntax is rejected unless exempt with a reason', () => {
  assert.deepEqual(contrastProblems({ light: '--ink: #111; --ground: #fff;', dark: MINI_DARK, pairs: MINI_PAIRS }), []);
  const bad = contrastProblems({ light: `${MINI_LIGHT} --veil: rgb(0 0 0 / .4);`, dark: MINI_DARK, pairs: MINI_PAIRS });
  assert.deepEqual(bad, ['not-plain-hex:light:--veil=rgb(0 0 0 / .4)', 'uncovered:--veil']);
  const ok = contrastProblems({ light: `${MINI_LIGHT} --veil: rgb(0 0 0 / .4);`, dark: MINI_DARK, pairs: { ...MINI_PAIRS, exempt: { '--veil': 'overlay scrim, not text' } } });
  assert.deepEqual(ok, []);
});

test('T-B-21: an exempt entry needs a reason and must name a real token that is not also paired', () => {
  const pairsWith = (exempt) => ({ ...MINI_PAIRS, exempt });
  assert.deepEqual(contrastProblems({ light: MINI_LIGHT, dark: MINI_DARK, pairs: pairsWith({ '--ghost': 'nothing' }) }), ['exempt-unknown:--ghost']);
  assert.deepEqual(contrastProblems({ light: MINI_LIGHT, dark: MINI_DARK, pairs: pairsWith({ '--ink': '' }) }), ['exempt-but-paired:--ink', 'exempt-without-reason:--ink']);
});
