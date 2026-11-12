import test from 'node:test';
import assert from 'node:assert/strict';
import { stepsOf } from '../../src/core/wb/steps.js';

const UI = 'let\n    Source = Excel.CurrentWorkbook(){[Name="T"]}[Content],\n    #"Changed Type" = Table.TransformColumnTypes(Source,{{"A", type text}}),\n    #"Filtered Rows" = Table.SelectRows(#"Changed Type", each [A] <> null),\n    #"Sorted Rows" = Table.Sort(#"Filtered Rows",{{"A", Order.Ascending}})\nin\n    #"Sorted Rows"';

test('T-WB-02: UI-generated M has linear steps, kinds, quoted names and a body reference', () => {
  const m = stepsOf(UI);
  assert.equal(m.shape, 'let');
  assert.deepEqual(m.steps.map((s) => s.name), ['Source', 'Changed Type', 'Filtered Rows', 'Sorted Rows']);
  assert.deepEqual(m.steps.map((s) => s.quotedName), ['Source', '#"Changed Type"', '#"Filtered Rows"', '#"Sorted Rows"']);
  assert.deepEqual(m.steps.map((s) => s.kind), ['source', 'types', 'filter', 'sort']);
  assert.deepEqual(m.steps.map((s) => s.linear), [false, true, true, true]);
  assert.deepEqual(m.steps.map((s) => s.call), ['Excel.CurrentWorkbook', 'Table.TransformColumnTypes', 'Table.SelectRows', 'Table.Sort']);
  assert.deepEqual(m.steps[2].inputs, ['Changed Type']);
  assert.equal(m.body.ref, 'Sorted Rows');
});

test('T-WB-02: a step that reads two steps, or reads its predecessor twice, is not linear', () => {
  const t = 'let A = 1, B = 2, C = Table.NestedJoin(A, {"k"}, B, {"k"}, "j", JoinKind.Inner), D = Table.Combine({C, C}) in D';
  const m = stepsOf(t);
  assert.deepEqual(m.steps.map((s) => s.linear), [false, false, false, false]);
  assert.deepEqual(m.steps[2].inputs, ['A', 'B']);
  assert.equal(m.steps[2].kind, 'merge');
  assert.equal(m.steps[3].kind, 'append');
});

test('T-WB-02: a forward reference is reported on the step that makes it', () => {
  const m = stepsOf('let A = B, B = 1 in A');
  assert.deepEqual(m.steps[0].forward, ['B']);
  assert.deepEqual(m.steps[0].inputs, []);
});

test('T-WB-02: comments before a step belong to it, a comment on the same line after it too', () => {
  const t = 'let\n  // first\n  A = 1, // about A\n  // second\n  /* inline */ B = A + 1 // about B\nin\n  B';
  const m = stepsOf(t);
  const [a, b] = m.steps;
  assert.equal(t.slice(a.parts.coreStart, a.parts.coreEnd), '// first\n  A = 1');
  assert.equal(t.slice(a.parts.trailStart, a.parts.trailEnd), ' // about A');
  assert.equal(t.slice(b.parts.coreStart, b.parts.coreEnd), '// second\n  /* inline */ B = A + 1');
  assert.equal(t.slice(b.parts.trailStart, b.parts.trailEnd), ' // about B');
});

test('T-WB-02: CRLF line endings are handled', () => {
  const m = stepsOf(UI.replace(/\n/g, '\r\n'));
  assert.equal(m.steps.length, 4);
  assert.deepEqual(m.steps.map((s) => s.linear), [false, true, true, true]);
});

test('T-WB-02: a body that is not a step name has no reference', () => {
  const m = stepsOf('let A = {1, 2} in List.Sum(A)');
  assert.equal(m.body.ref, null);
  assert.equal(m.steps[0].kind, 'custom');
});

test('T-WB-02: a nested let inside a step is not flattened and does not leak its names', () => {
  const m = stepsOf('let A = 1, B = let A = 2, C = A in C, D = A + B in D');
  assert.deepEqual(m.steps.map((s) => s.name), ['A', 'B', 'D']);
  assert.deepEqual(m.steps[1].inputs, []);
  assert.deepEqual(m.steps[2].inputs, ['A', 'B']);
});

test('T-WB-02: queries a step refers to are listed when the member names are given', () => {
  const m = stepsOf('let Source = Sales, Joined = Table.NestedJoin(Source, {"k"}, Other, {"k"}, "j", JoinKind.Inner) in Joined', 0, { members: new Set(['Sales', 'Other']) });
  assert.deepEqual(m.steps[0].queries, ['Sales']);
  assert.deepEqual(m.steps[1].queries, ['Other']);
  assert.equal(m.steps[0].kind, 'custom');
});

test('T-WB-02: function queries are shown, not run', () => {
  assert.equal(stepsOf('(x) => x + 1').shape, 'function');
  const fl = stepsOf('(x as number) => let y = x + 1 in y');
  assert.equal(fl.shape, 'function-let');
  assert.deepEqual(fl.steps.map((s) => s.name), ['y']);
  assert.deepEqual(fl.params.map((p) => p.name), ['x']);
});

test('T-WB-02: a plain expression has no steps and a broken query reports its error', () => {
  assert.equal(stepsOf('1 + 2').shape, 'expression');
  const bad = stepsOf('let A = in A');
  assert.equal(bad.shape, 'invalid');
  assert.ok(bad.error.message);
});

test('T-WB-02: a bypassed step is recognised and the next step is linear against the step before it', () => {
  const t = 'let\n  Source = 1,\n  A = Table.X(Source),\n  B = Table.Y(Source)\nin\n  B';
  const m = stepsOf(t);
  assert.equal(m.steps[1].bypassed, true);
  assert.equal(m.steps[2].prev, 0);
  assert.equal(m.steps[2].linear, true);
});

test('T-WB-02: a step that reads an earlier step through each is not mistaken for a reference to a field', () => {
  const m = stepsOf('let Amount = 1, F = Table.SelectRows(Source, each [Amount] > 1), Source = 2 in F');
  assert.deepEqual(m.steps[1].inputs, []);
  assert.deepEqual(m.steps[1].forward, ['Source']);
});
