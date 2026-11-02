import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkbook } from '../../src/core/workbook.js';
import { buildWorkbook } from '../../src/core/save.js';
import { fixture } from './helpers.js';

test('T-B-04: a self-check failure rejects the save and returns no bytes', async () => {
  const wb = await openWorkbook(fixture('pq_simple.xlsx'), 'pq_simple.xlsx');
  wb.queries[0].original = `${wb.queries[0].original}\n// tampered after open`;
  let result;
  await assert.rejects(
    async () => {
      result = await buildWorkbook(wb, {});
    },
    (e) => e.code === 'write.selfcheck'
  );
  assert.equal(result, undefined);
});

test('T-B-05: the service worker does not take over open tabs on install', async () => {
  const { readFileSync } = await import('node:fs');
  const { root } = await import('./helpers.js');
  const text = readFileSync(`${root}/sw.js`, 'utf8');
  assert.equal(/skipWaiting/.test(text), false);
  assert.equal(/clients\.claim\(\)/.test(text), true);
});
