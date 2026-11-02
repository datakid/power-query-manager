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
