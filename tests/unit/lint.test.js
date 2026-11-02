import test from 'node:test';
import assert from 'node:assert/strict';
import { runAll } from '../lint/checks.js';

test('T-LINT: the shipped source passes every lint rule', () => {
  const findings = runAll();
  assert.deepEqual(findings.map((f) => `${f.rule} ${f.file}:${f.line} ${f.msg}`), []);
});
