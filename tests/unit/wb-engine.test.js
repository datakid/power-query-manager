import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateSteps, evaluateMany, runOnce, serializeValue } from '../../src/core/m/engine.js';
import { def } from '../../src/core/m/library/core.js';
import { openWorkbook } from '../../src/core/workbook.js';
import { baseOptions, plain, fixture } from './helpers.js';

const ser = (v) => plain(serializeValue(v, 0, { maxRows: 100000 }));

const calls = [];
def('Test.Tick', ['id', 'value'], (id, value) => {
  calls.push(id);
  return value + 1;
});

const section = (...members) => `section Section1;\r\n\r\n${members.map(([n, e]) => `shared ${n} = ${e};`).join('\r\n\r\n')}`;
const opts = (text, extra = {}) => ({ ...baseOptions, sectionText: text, ...extra });
const collect = async (gen) => {
  const out = [];
  for await (const x of gen) out.push(x);
  return out;
};

test('T-WB-07: a twelve-step chain evaluates every step exactly once', () => {
  calls.length = 0;
  const bindings = ['S0 = 0'];
  for (let i = 1; i <= 11; i++) bindings.push(`S${i} = Test.Tick(${i}, S${i - 1})`);
  const text = section(['Q', `let ${bindings.join(', ')} in S11`]);
  const r = evaluateSteps(opts(text, { queryName: 'Q' }));
  assert.equal(r.status, 'ok');
  assert.equal(r.steps.length, 12);
  assert.ok(r.steps.every((s) => s.status === 'ok'));
  assert.deepEqual([...calls].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(r.final.value, 11);
  assert.deepEqual(r.steps.map((s) => s.value), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('T-WB-07: an error in a middle step skips only its dependants', () => {
  const text = section(['Q', 'let A = 1, B = error "boom", C = B + 1, D = A + 1, E = C + D in E']);
  const r = evaluateSteps(opts(text, { queryName: 'Q' }));
  assert.deepEqual(r.steps.map((s) => [s.name, s.status]), [['A', 'ok'], ['B', 'error'], ['C', 'skipped'], ['D', 'ok'], ['E', 'skipped']]);
  assert.equal(r.steps[1].error.message, 'boom');
  assert.equal(r.steps[2].cause, 'B');
  assert.equal(r.steps[4].cause, 'B');
  assert.equal(r.steps[3].value, 2);
  assert.equal(r.final.status, 'skipped');
});

test('T-WB-07: table steps report their rows and columns', () => {
  const text = section(['Q', 'let S = #table({"a", "b"}, {{1, 2}, {3, 4}, {5, 6}}), F = Table.SelectRows(S, each [a] > 1) in F']);
  const r = evaluateSteps(opts(text, { queryName: 'Q' }));
  assert.deepEqual(r.steps.map((s) => [s.rowCount, s.columns]), [[3, ['a', 'b']], [2, ['a', 'b']]]);
  assert.ok(r.steps.every((s) => s.durationMs >= 0));
});

test('T-WB-07: a query that is not a let has no steps and still returns its result', () => {
  const r = evaluateSteps(opts(section(['Q', '1 + 2']), { queryName: 'Q' }));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.steps, []);
});

test('T-WB-07: a step that stops at the time limit is marked stopped', () => {
  const text = section(['Q', 'let A = 1, B = List.Generate(() => 0, each true, each _ + 1), C = List.Count(B) in C']);
  const r = evaluateSteps(opts(text, { queryName: 'Q', limits: { timeoutMs: 150, maxRows: 1e9 } }));
  assert.equal(r.steps[0].status, 'ok');
  assert.equal(r.steps[1].status, 'stopped');
  assert.equal(r.steps[2].status, 'stopped');
});

test('T-WB-07: evaluateMany evaluates a shared upstream once for a diamond', async () => {
  calls.length = 0;
  const text = section(['A', 'Test.Tick(1, 0)'], ['B', 'Test.Tick(2, A)'], ['C', 'Test.Tick(3, A)'], ['D', 'Test.Tick(4, B + C)']);
  const out = await collect(evaluateMany(opts(text), ['A', 'B', 'C', 'D']));
  assert.deepEqual(out.map((x) => [x.name, x.status, x.value]), [['A', 'ok', 1], ['B', 'ok', 2], ['C', 'ok', 2], ['D', 'ok', 5]]);
  assert.deepEqual([...calls].sort(), [1, 2, 3, 4]);
});

test('T-WB-07: a timeout in one member does not stop the next, and the deadline is per member', async () => {
  const text = section(['Slow', 'List.Count(List.Generate(() => 0, each true, each _ + 1))'], ['Fast', '1 + 1'], ['Uses', 'Slow + 1']);
  const out = await collect(evaluateMany(opts(text, { limits: { timeoutMs: 150, maxRows: 1e9 } }), ['Slow', 'Fast', 'Uses']));
  assert.deepEqual(out.map((x) => [x.name, x.status]), [['Slow', 'stopped'], ['Fast', 'ok'], ['Uses', 'stopped']]);
  assert.equal(out[1].value, 2);
});

test('T-WB-07: functions are skipped and a missing name is an error', async () => {
  const text = section(['F', '(x) => x'], ['V', '1']);
  const out = await collect(evaluateMany(opts(text), ['F', 'V', 'Nope']));
  assert.deepEqual(out.map((x) => [x.name, x.status]), [['F', 'skipped'], ['V', 'ok'], ['Nope', 'error']]);
});

test('T-WB-07: an error in one member does not stop the batch and flags are reported per member', async () => {
  const text = section(['Bad', 'error "no"'], ['Now', 'DateTime.LocalNow()'], ['Good', '3']);
  const out = await collect(evaluateMany(opts(text), ['Bad', 'Now', 'Good']));
  assert.deepEqual(out.map((x) => x.status), ['error', 'ok', 'ok']);
  assert.ok(out[1].flags.includes('time-dependent'));
  assert.deepEqual(out[2].flags, []);
});

test('T-WB-07: a binding asked for in a batch is supplied through next() and the member resumes', async () => {
  const text = section(['A', 'Excel.Workbook(File.Contents("c:\\data.xlsx"), true)'], ['B', '2']);
  const gen = evaluateMany(opts(text), ['A', 'B']);
  const first = await gen.next();
  assert.equal(first.value.status, 'need-binding');
  const second = await gen.next(null);
  assert.equal(second.value.status, 'error');
  const third = await gen.next();
  assert.equal(third.value.name, 'B');
  assert.equal(third.value.status, 'ok');
});

test('T-WB-07: results equal runOnce for every member of every fixture', async () => {
  const dir = fileURLToPath(new URL('../fixtures/external/', import.meta.url));
  const files = readdirSync(dir).filter((f) => /\.xlsx?m?$/.test(f) && !/xlsb$/.test(f));
  let compared = 0;
  for (const f of files) {
    const wb = await openWorkbook(fixture(f), f);
    if (!wb.mashup || wb.mashup.error) continue;
    const text = wb.mashup.section.text;
    const names = wb.mashup.split.members.map((m) => m.name);
    const many = await collect(evaluateMany(opts(text), names));
    for (const got of many) {
      const one = runOnce(opts(text, { queryName: got.name }));
      if (got.status === 'skipped') continue;
      if (one.status === 'need-binding') {
        assert.equal(got.status, 'need-binding', `${f} ${got.name}`);
        continue;
      }
      assert.equal(got.status, one.status === 'ok' ? 'ok' : one.status, `${f} ${got.name}`);
      if (one.status === 'ok') assert.deepEqual(ser(got.value), ser(one.value), `${f} ${got.name}`);
      if (one.status === 'error') assert.equal(got.error.message, one.error.message, `${f} ${got.name}`);
      compared++;
    }
  }
  assert.ok(compared >= 3, `${compared} members compared`);
});

test('T-WB-07: every step of every fixture query equals the old per-step run', async () => {
  const dir = fileURLToPath(new URL('../fixtures/external/', import.meta.url));
  let compared = 0;
  for (const f of readdirSync(dir).filter((x) => /\.xlsx?m?$/.test(x) && !/xlsb$/.test(x))) {
    const wb = await openWorkbook(fixture(f), f);
    if (!wb.mashup || wb.mashup.error) continue;
    const text = wb.mashup.section.text;
    for (const m of wb.mashup.split.members) {
      const all = evaluateSteps(opts(text, { queryName: m.name }));
      if (all.status !== 'ok') continue;
      for (const st of all.steps) {
        const one = runOnce(opts(text, { queryName: m.name, step: st.name }));
        if (one.status === 'ok') {
          assert.equal(st.status, 'ok', `${f} ${m.name} ${st.name}`);
          assert.deepEqual(ser(st.value), ser(one.value), `${f} ${m.name} ${st.name}`);
        } else if (one.status === 'error') {
          assert.ok(st.status === 'error' || st.status === 'skipped', `${f} ${m.name} ${st.name}`);
        }
        compared++;
      }
    }
  }
  assert.ok(compared >= 5, `${compared} steps compared`);
});
