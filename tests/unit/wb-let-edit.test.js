import test from 'node:test';
import assert from 'node:assert/strict';
import { stepsOf } from '../../src/core/wb/steps.js';
import { canMove, moveStep, insertStepAfter, renameStep, deleteStep, bypassStep, unbypassStep, duplicateStep } from '../../src/core/wb/let-edit.js';

const LINEAR_NAMES = ['Source', 'Step B', 'Step C', 'Step D', 'Step E'];

function chain({ eol, notes, nonLinear }) {
  const q = (n) => (/^[A-Za-z_]+$/.test(n) ? n : `#"${n}"`);
  const exprs = [
    'Table.FromRows({{1, 2}, {3, 4}})',
    `Table.Sort(${q('Source')}, {"A"})`,
    `Table.SelectRows(${q('Step B')}, each [A] > 1)`,
    nonLinear ? `Table.NestedJoin(${q('Step C')}, {"k"}, Source, {"k"}, "j", JoinKind.Inner)` : `Table.Distinct(${q('Step C')})`,
    `Table.FirstN(${q('Step D')}, 5)`
  ];
  const lines = exprs.map((e, i) => {
    const lead = notes ? `  // about ${LINEAR_NAMES[i]}${eol}` : '';
    const trail = notes ? ` // done ${i}` : '';
    return `${lead}  ${q(LINEAR_NAMES[i])} = ${e}${i < exprs.length - 1 ? ',' : ''}${trail}`;
  });
  return `let${eol}${lines.join(eol)}${eol}in${eol}  ${q('Step E')}`;
}

function applyChanges(text, changes) {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.start - a.start)) out = out.slice(0, c.start) + c.insert + out.slice(c.end);
  return out;
}

function sound(orig, res, label) {
  assert.equal(res.ok, true, label);
  assert.equal(applyChanges(orig, res.changes), res.text, `${label}: changes reproduce the text`);
  for (let i = 1; i < res.changes.length; i++) assert.ok(res.changes[i].start >= res.changes[i - 1].end, `${label}: changes do not overlap`);
  const m = stepsOf(res.text, 0);
  assert.equal(m.shape, 'let', `${label}: re-parses`);
  const names = new Set(m.steps.map((s) => s.name));
  assert.equal(names.size, m.steps.length, `${label}: step names are unique`);
  for (const s of m.steps) {
    assert.deepEqual(s.forward, [], `${label}: ${s.name} has no forward reference`);
    for (const r of s.refs) assert.ok(names.has(r.name), `${label}: ${s.name} reads a known step`);
  }
  if (m.body.ref !== null) assert.ok(names.has(m.body.ref), `${label}: the body reads a known step`);
  return m;
}

const variants = [];
for (const eol of ['\n', '\r\n']) for (const notes of [false, true]) for (const nonLinear of [false, true]) variants.push({ eol, notes, nonLinear, label: `${eol === '\n' ? 'LF' : 'CRLF'} ${notes ? 'comments' : 'plain'} ${nonLinear ? 'non-linear' : 'linear'}` });

for (const v of variants) {
  test(`T-WB-03: every operation keeps the query sound — ${v.label}`, () => {
    const text = chain(v);
    const n = LINEAR_NAMES.length;
    let succeeded = 0;
    const tried = (label, res) => {
      if (res.ok) {
        succeeded++;
        sound(text, res, label);
      } else {
        assert.ok(typeof res.reason === 'string' && res.reason.length > 0, `${label}: a refusal gives a reason`);
        assert.equal(res.text, text, `${label}: a refusal changes nothing`);
        assert.deepEqual(res.changes, []);
      }
    };
    for (let from = 0; from < n; from++) for (let to = 0; to < n; to++) {
      if (from === to) continue;
      tried(`move ${from}->${to}`, moveStep(text, from, to, { rewire: true }));
      tried(`move ${from}->${to} plain`, moveStep(text, from, to));
    }
    for (let i = 0; i < n; i++) {
      tried(`insert after ${i}`, insertStepAfter(text, i, 'New Step', `Table.FirstN(${LINEAR_NAMES[i] === 'Source' ? 'Source' : `#"${LINEAR_NAMES[i]}"`}, 3)`, { rewire: true }));
      tried(`insert after ${i} unwired`, insertStepAfter(text, i, 'New Step', 'Table.FromRows({})'));
      tried(`rename ${i}`, renameStep(text, i, 'Renamed Step'));
      tried(`delete ${i}`, deleteStep(text, i));
      tried(`bypass ${i}`, bypassStep(text, i));
      tried(`duplicate ${i}`, duplicateStep(text, i));
    }
    assert.ok(succeeded > 20, `${v.label}: ${succeeded} operations succeeded`);
  });
}

test('T-WB-03: comments travel with the step they belong to when it moves', () => {
  const text = chain({ eol: '\n', notes: true, nonLinear: false });
  const res = moveStep(text, 4, 3, { rewire: true });
  assert.equal(res.ok, true);
  const m = stepsOf(res.text, 0);
  assert.deepEqual(m.steps.map((s) => s.name), ['Source', 'Step B', 'Step C', 'Step E', 'Step D']);
  const e = m.steps[3];
  assert.match(res.text.slice(e.parts.coreStart, e.parts.coreEnd), /^\/\/ about Step E\n {2}#?"?Step E/);
  assert.equal(res.text.slice(e.parts.trailStart, e.parts.trailEnd), ' // done 4');
  assert.equal(m.body.ref, 'Step D');
});

test('T-WB-03: moving the last step up moves the comma, not the formatting', () => {
  const text = 'let\n  A = 1,\n  B = A,\n  C = B\nin\n  C';
  const res = moveStep(text, 2, 1, { rewire: true });
  assert.equal(res.text, 'let\n  A = 1,\n  C = A,\n  B = C\nin\n  B');
});

test('T-WB-03: a plain move of independent steps changes only the swapped text', () => {
  const text = 'let\n  A = 1,\n  B = 2,\n  C = A + B\nin\n  C';
  const swapped = moveStep(text, 1, 0);
  assert.equal(swapped.text, 'let\n  B = 2,\n  A = 1,\n  C = A + B\nin\n  C');
  const ok = moveStep('let\n  Z = 0,\n  A = 1,\n  B = 2,\n  C = A + B\nin\n  C', 2, 1);
  assert.equal(ok.ok, true);
  assert.equal(ok.text, 'let\n  Z = 0,\n  B = 2,\n  A = 1,\n  C = A + B\nin\n  C');
  assert.equal(canMove(stepsOf('let\n  Z = 0,\n  A = 1,\n  B = 2,\n  C = A + B\nin\n  C', 0), 2, 1).mode, 'plain');
});

test('T-WB-03: a refusal names the blocking step', () => {
  const text = 'let\n  A = 1,\n  B = A + 1,\n  C = A + B\nin\n  C';
  const r = moveStep(text, 2, 1, { rewire: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /"C"/);
  const d = deleteStep(text, 1);
  assert.equal(d.ok, false);
  assert.match(d.reason, /"C"/);
});

test('T-WB-03: the source stays first and cannot be bypassed or deleted while read', () => {
  const text = chain({ eol: '\n', notes: false, nonLinear: false });
  assert.equal(moveStep(text, 0, 2, { rewire: true }).ok, false);
  assert.equal(moveStep(text, 2, 0, { rewire: true }).ok, false);
  assert.equal(bypassStep(text, 0).ok, false);
  assert.equal(deleteStep(text, 0).ok, false);
});

test('T-WB-03: rename rewrites the definition, every reader and the body, quoting as needed', () => {
  const text = 'let\n  A = 1,\n  B = A + A,\n  C = let A = 2 in A + B\nin\n  A';
  const res = renameStep(text, 0, 'My Source');
  assert.equal(res.text, 'let\n  #"My Source" = 1,\n  B = #"My Source" + #"My Source",\n  C = let A = 2 in A + B\nin\n  #"My Source"');
  assert.equal(res.changes.length, 4);
  assert.equal(renameStep(text, 0, 'B').ok, false);
  assert.equal(renameStep(text, 1, 'Plain_Name').text.includes('Plain_Name = A + A'), true);
});

test('T-WB-03: bypass then un-bypass restores the exact text', () => {
  for (const eol of ['\n', '\r\n']) {
    const text = chain({ eol, notes: true, nonLinear: false });
    for (const i of [1, 2, 3, 4]) {
      const b = bypassStep(text, i);
      assert.equal(b.ok, true, `bypass ${i}`);
      const m = stepsOf(b.text, 0);
      assert.equal(m.steps[i].bypassed, true, `step ${i} reports as bypassed`);
      const u = unbypassStep(b.text, i);
      assert.equal(u.ok, true, `unbypass ${i}`);
      assert.equal(u.text, text, `restored ${i}`);
    }
  }
});

test('T-WB-03: bypassing the last step points the body at its input', () => {
  const text = 'let\n  A = 1,\n  B = Table.X(A),\n  C = Table.Y(B)\nin\n  C';
  const b = bypassStep(text, 2);
  assert.equal(b.text, 'let\n  A = 1,\n  B = Table.X(A),\n  C = Table.Y(B)\nin\n  B');
  assert.equal(unbypassStep(b.text, 2).text, text);
});

test('T-WB-03: duplicate adds a copy that reads the original, without copying comments', () => {
  const text = 'let\n  A = 1,\n  // keep\n  B = Table.X(A), // note\n  C = Table.Y(B)\nin\n  C';
  const res = duplicateStep(text, 1);
  assert.equal(res.text, 'let\n  A = 1,\n  // keep\n  B = Table.X(A), // note\n  #"B (2)" = Table.X(B),\n  C = Table.Y(#"B (2)")\nin\n  C');
  const again = duplicateStep(res.text, 1);
  assert.equal(again.ok, true);
  assert.ok(stepsOf(again.text, 0).steps.some((s) => s.name === 'B (3)'));
});

test('T-WB-03: insert after the last step rewires the body, and rejects duplicate names', () => {
  const text = 'let\n  A = 1,\n  B = Table.X(A)\nin\n  B';
  const res = insertStepAfter(text, 1, 'Top', 'Table.FirstN(B, 3)', { rewire: true });
  assert.equal(res.text, 'let\n  A = 1,\n  B = Table.X(A),\n  Top = Table.FirstN(B, 3)\nin\n  Top');
  assert.equal(insertStepAfter(text, 1, 'A', '1').ok, false);
  const mid = insertStepAfter(text, 0, 'Mid', 'Table.Y(A)', { rewire: true });
  assert.equal(mid.text, 'let\n  A = 1,\n  Mid = Table.Y(A),\n  B = Table.X(Mid)\nin\n  B');
});

test('T-WB-03: a single step can be inserted after and cannot be deleted', () => {
  const text = 'let\r\n  A = 1\r\nin\r\n  A';
  const res = insertStepAfter(text, 0, 'B', 'A + 1', { rewire: true });
  assert.equal(res.text, 'let\r\n  A = 1,\r\n  B = A + 1\r\nin\r\n  B');
  assert.equal(deleteStep(text, 0).ok, false);
});

test('T-WB-03: comma-first formatting and function queries are refused with a reason', () => {
  const comma = 'let\n  A = 1\n  , B = A\nin\n  B';
  const r = moveStep(comma, 1, 0, { rewire: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /"A"/);
  assert.equal(renameStep('(x) => let y = x in y', 0, 'z').ok, false);
  assert.equal(renameStep('1 + 2', 0, 'z').ok, false);
});

test('T-WB-03: untouched bytes stay identical, asserted on the change list', () => {
  const text = chain({ eol: '\r\n', notes: true, nonLinear: false });
  const res = moveStep(text, 3, 2, { rewire: true });
  assert.equal(res.ok, true);
  const first = res.changes[0];
  const lastC = res.changes[res.changes.length - 1];
  assert.equal(res.text.slice(0, first.start), text.slice(0, first.start));
  assert.equal(res.text.slice(res.text.length - (text.length - lastC.end)), text.slice(lastC.end));
});
