import test from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../../src/app/orchestrator.js';
import { evaluateMany, evaluateSteps } from '../../src/core/m/engine.js';
import { baseOptions } from './helpers.js';

const MEMBERS = {
  Raw: '#table({"x"}, {{1}, {2}, {3}})',
  Clean: 'Table.SelectRows(Raw, each [x] > 1)',
  Summary: 'Table.RowCount(Clean)',
  Broken: 'error "bad"',
  Last: 'Summary + 1',
  fx: '(n) => n'
};

const sectionOf = (members) => `section Section1;\r\n\r\n${Object.entries(members).map(([n, e]) => `shared ${n} = ${e};`).join('\r\n\r\n')}`;

function fakeRunner() {
  const r = {
    cancelled: 0,
    calls: [],
    async runMany(params, { onEvent }) {
      r.calls.push(['many', params.names]);
      const gen = evaluateMany({ ...baseOptions, sectionText: params.sectionText }, params.names);
      let id = 0;
      for await (const ev of gen) {
        if (r.cancelled) return { type: 'result', status: 'cancelled' };
        const { value, ...rest } = ev;
        onEvent({ type: 'member-result', resultId: ev.status === 'ok' ? `r${++id}` : null, ...rest });
        if (r.cancelled) return { type: 'result', status: 'cancelled' };
      }
      return { type: 'done', status: 'ok' };
    },
    async runSteps(params, { onEvent }) {
      r.calls.push(['steps', params.queryName, params.upTo || null]);
      const out = evaluateSteps({ ...baseOptions, sectionText: params.sectionText, queryName: params.queryName, upTo: params.upTo });
      for (const st of out.steps) onEvent({ type: 'step-result', name: st.name, status: st.status });
      return { type: 'done', status: 'ok', partial: out.partial, finalStatus: out.final ? out.final.status : null, finalRows: out.final ? out.final.rowCount : null, finalResultId: out.final && out.final.status === 'ok' ? 'rf' : null, durationMs: 1 };
    },
    cancel() {
      r.cancelled++;
    }
  };
  return r;
}

function make(members = MEMBERS) {
  const state = { members: { ...members } };
  const runner = fakeRunner();
  const orch = new Orchestrator({
    runner,
    context: () => ({ sectionText: sectionOf(state.members), textOf: (n) => state.members[n], culture: 'en-US', limits: {}, snapshot: null, bindings: [], askBinding: async () => null })
  });
  return { state, runner, orch };
}

test('T-WB-09: run all reports every query, skips the function and records statuses and rows', async () => {
  const { orch } = make();
  const events = [];
  orch.on((e) => events.push(e.type));
  const r = await orch.run('run-all');
  assert.equal(r.status, 'ok');
  const s = orch.statuses();
  assert.deepEqual([...s], [['Raw', 'ok'], ['Clean', 'ok'], ['Summary', 'ok'], ['Broken', 'error'], ['Last', 'ok'], ['fx', 'skipped']]);
  assert.equal(orch.book.record('Clean').rows, 2);
  assert.equal(events[0], 'batch-start');
  assert.equal(events[events.length - 1], 'batch-end');
  assert.equal(orch.queue().length, 5);
});

test('T-WB-09: editing one staging query turns exactly its downstream stale and run stale runs exactly those', async () => {
  const { orch, state, runner } = make();
  await orch.run('run-all');
  state.members.Clean = 'Table.SelectRows(Raw, each [x] > 2)';
  const s = orch.statuses();
  assert.deepEqual([...s].filter(([, v]) => v === 'stale').map(([k]) => k), ['Clean', 'Summary', 'Last']);
  assert.equal(orch.counts().stale, 3);
  runner.calls.length = 0;
  await orch.run('run-stale');
  assert.deepEqual(runner.calls, [['many', ['Clean', 'Summary', 'Last']]]);
  assert.equal(orch.counts().stale, 0);
  assert.equal(orch.book.record('Clean').rows, 1);
  assert.equal(orch.book.rowDelta('Clean'), -1);
});

test('T-WB-09: run on one query runs all its steps, run to here stops at the step', async () => {
  const { orch, runner } = make({ Q: 'let S = #table({"x"}, {{1}, {2}}), F = Table.SelectRows(S, each [x] > 1), G = Table.RowCount(F) in G' });
  const stepEvents = [];
  orch.on((e) => e.type === 'step' && stepEvents.push(e.step.name));
  await orch.run('run', { current: 'Q' });
  assert.deepEqual(stepEvents, ['S', 'F', 'G']);
  assert.equal(orch.statuses().get('Q'), 'ok');
  stepEvents.length = 0;
  await orch.run('run-to-here', { current: 'Q', step: 'F' });
  assert.deepEqual(stepEvents, ['S', 'F']);
  assert.deepEqual(runner.calls[1], ['steps', 'Q', 'F']);
  assert.equal(orch.statuses().get('Q'), 'ok');
});

test('T-WB-09: a query whose final result fails is an error, not ok', async () => {
  const { orch } = make({ Q: 'let S = 1, B = error "no", C = B in C' });
  await orch.run('run', { current: 'Q' });
  assert.equal(orch.statuses().get('Q'), 'error');
});

test('T-WB-09: stop at first error cancels the rest and marks them cancelled', async () => {
  const { orch, runner } = make();
  const r = await orch.run('run-all', { stopAtFirstError: true });
  assert.equal(runner.cancelled, 1);
  assert.equal(r.status, 'cancelled');
  const s = orch.statuses();
  assert.equal(s.get('Broken'), 'error');
  assert.equal(s.get('Last'), 'cancelled');
});

test('T-WB-09: a second run while one is running is refused and cancel reaches the runner', async () => {
  const { orch, runner } = make();
  const first = orch.run('run-all');
  const second = await orch.run('run-all');
  assert.equal(second.status, 'busy');
  assert.equal(orch.running, true);
  assert.equal(orch.cancel(), true);
  await first;
  assert.equal(orch.running, false);
  assert.equal(orch.cancel(), false);
  assert.ok(runner.cancelled >= 1);
});

test('T-WB-09: nothing to run is reported, not silently accepted', async () => {
  const { orch } = make();
  assert.equal((await orch.run('run', { current: 'fx' })).status, 'nothing');
  assert.equal((await orch.run('run-stale')).status, 'nothing');
  assert.equal((await orch.run('run-selected', { selection: [] })).status, 'nothing');
});
