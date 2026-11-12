import test from 'node:test';
import assert from 'node:assert/strict';
import { match, rank } from '../../src/core/wb/fuzzy.js';

const names = (query, list) => rank(query, list).map((r) => r.item);
const picked = (text, ranges) => ranges.map(([s, e]) => text.slice(s, e));

test('T-WB-05: sc ranks Sales_Clean above Discount', () => {
  const ranked = names('sc', ['Discount', 'Sales_Clean', 'Scores']);
  assert.ok(ranked.indexOf('Sales_Clean') < ranked.indexOf('Discount'));
  assert.ok(match('sc', 'Sales_Clean').score > match('sc', 'Discount').score);
});

test('T-WB-05: no subsequence, no match; empty query matches everything with no ranges', () => {
  assert.equal(match('xyz', 'Sales'), null);
  assert.equal(match('sales', 'sal'), null);
  assert.deepEqual(match('', 'anything'), { score: 0, ranges: [] });
});

test('T-WB-05: a quoted step name is matched by its word starts', () => {
  const text = '#"Changed Type"';
  const hit = match('ct', text);
  assert.deepEqual(picked(text, hit.ranges), ['C', 'T']);
  assert.deepEqual(names('ct', ['Contact', '#"Changed Type"', 'Archive']).slice(0, 2), ['#"Changed Type"', 'Contact']);
});

test('T-WB-05: camel humps and boundaries beat scattered letters', () => {
  assert.deepEqual(names('gnr', ['Magnificent_Orange', 'GetNamedRange']).slice(0, 1), ['GetNamedRange']);
  assert.deepEqual(names('fy', ['Flyer', 'fiscal_year']).slice(0, 1), ['fiscal_year']);
});

test('T-WB-05: consecutive runs score higher and exact case gets a bonus', () => {
  assert.ok(match('sal', 'Sales').score > match('sal', 'Sxaxl').score);
  assert.ok(match('Sales', 'Sales').score > match('sales', 'Sales').score);
  assert.deepEqual(picked('Sales_Raw', match('sal', 'Sales_Raw').ranges), ['Sal']);
});

test('T-WB-05: diacritics do not matter and ranges point into the original text', () => {
  const hit = match('cafe', 'Café Noir');
  assert.ok(hit);
  assert.deepEqual(picked('Café Noir', hit.ranges), ['Café']);
  assert.ok(match('cafe', 'Cafe'));
});

test('T-WB-05: CJK and right-to-left names match', () => {
  const cjk = match('销售', '销售汇总');
  assert.deepEqual(cjk.ranges, [[0, 2]]);
  assert.ok(match('汇', '销售汇总'));
  const rtl = match('مب', 'مبيعات');
  assert.deepEqual(rtl.ranges, [[0, 2]]);
  assert.ok(match('한', '한국어'));
});

test('T-WB-05: ties break by shorter text, then by original order', () => {
  const r = rank('a', ['aaa', 'a', 'ab', 'a ']);
  assert.deepEqual(r.map((x) => x.item), ['a', 'ab', 'a ', 'aaa']);
  const same = rank('x', ['x1', 'x2', 'x3']);
  assert.deepEqual(same.map((x) => x.item), ['x1', 'x2', 'x3']);
});

test('T-WB-05: rank takes a key function and a limit', () => {
  const items = [{ n: 'Sales' }, { n: 'Stock' }, { n: 'Service' }];
  const r = rank('s', items, (x) => x.n, 2);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => typeof x.item.n === 'string'));
});

test('T-WB-05: ranking is deterministic', () => {
  const list = ['Sales_Clean', 'Sales_Raw', 'Sales_Returns', 'SalesYear', 'fx_SalesYear'];
  assert.deepEqual(rank('sales', list).map((r) => r.item), rank('sales', list).map((r) => r.item));
});

test('T-WB-05: ten thousand items are ranked in under 30 ms', () => {
  const items = [];
  for (let i = 0; i < 10000; i++) items.push(`${['Sales', 'Stock', 'Region', 'Product', 'Margin'][i % 5]}_${['Raw', 'Clean', 'Summary', 'By_Month'][i % 4]}_${i}`);
  rank('sc', items, (x) => x, 50);
  const t0 = performance.now();
  const r = rank('sc', items, (x) => x, 50);
  const ms = performance.now() - t0;
  assert.ok(r.length === 50);
  assert.ok(ms < 30, `took ${ms.toFixed(1)} ms`);
});
