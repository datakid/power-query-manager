import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coverageDocument } from '../../src/core/m/coverage.js';
import { LIB } from '../../src/core/m/library/index.js';
import { root } from './helpers.js';

test('T-M-COVER-1: docs/m-coverage.md is in sync with the library', () => {
  assert.equal(readFileSync(join(root, 'docs', 'm-coverage.md'), 'utf8'), coverageDocument());
});

test('every Tier A name listed in the spec exists in the library', () => {
  const spec = readFileSync(join(root, 'docs', 'QUOIN_SPEC.md'), 'utf8');
  const start = spec.indexOf('**Tier A**');
  const end = spec.indexOf('**Tier B:**');
  assert.ok(start > 0 && end > start);
  const names = [...spec.slice(start, end).matchAll(/`([A-Z][A-Za-z0-9]*\.[A-Za-z0-9.]+|#[a-z]+)`/g)].map((m) => m[1]);
  const missing = names.filter((n) => !LIB.has(n) && n !== '#shared' && n !== 'Quoin.Unsupported');
  assert.deepEqual(missing, []);
});
