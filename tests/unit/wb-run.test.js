import test from 'node:test';
import assert from 'node:assert/strict';
import { indexSection } from '../../src/core/wb/deps.js';
import { planRun, RUN_MODES } from '../../src/core/wb/run-plan.js';
import { StatusBook, fingerprints, fnv1a, STATUSES } from '../../src/core/wb/status.js';
import { quoteIdent } from '../../src/core/wb/ident.js';
import { normalizeQueryText } from '../../src/core/pq/section.js';

const section = (members) => `section Section1;\r\n\r\n${members.map(([n, e]) => `shared ${quoteIdent(n)} = ${e};`).join('\r\n\r\n')}`;
const MEMBERS = [['Sales_Raw', '1'], ['Sales_Clean', 'Sales_Raw + 1'], ['Summary', 'Sales_Clean + 1'], ['Regions', 'Sales_Clean + 2'], ['Other', '5'], ['fx', '(x) => x'], ['Report', 'Summary + Regions']];

const build = (members = MEMBERS) => {
  const text = section(members);
  const ix = indexSection(text);
  const texts = new Map(members.map(([n, e]) => [n, e]));
  return { ix, texts, fps: (extra = {}) => fingerprints(ix, { textOf: (n) => texts.get(n), normalize: normalizeQueryText, ...extra }) };
};

test('T-WB-09: run and run-to-here address one query, functions are refused', () => {
  const { ix } = build();
  assert.deepEqual(planRun(ix, 'run', { current: 'Summary' }), { kind: 'steps', name: 'Summary', upTo: null, names: ['Summary'], skipped: [] });
  assert.equal(planRun(ix, 'run-to-here', { current: 'Summary', step: 'Source' }).upTo, 'Source');
  assert.equal(planRun(ix, 'run', { current: 'fx' }).kind, 'none');
  assert.equal(planRun(ix, 'run', { current: 'Nope' }).kind, 'none');
  assert.equal(planRun(ix, 'run', {}).reason, 'no-query');
  assert.equal(planRun(ix, 'sideways', { current: 'Summary' }).reason, 'mode');
  assert.equal(RUN_MODES.length, 6);
});

test('T-WB-09: run selected orders topologically, dedupes, skips functions and ignores unknown names', () => {
  const { ix } = build();
  const p = planRun(ix, 'run-selected', { selection: ['Report', 'Summary', 'Summary', 'fx', 'Ghost', 'Sales_Raw'] });
  assert.deepEqual(p.names, ['Sales_Raw', 'Summary', 'Report']);
  assert.deepEqual(p.skipped, ['fx']);
  assert.equal(p.kind, 'many');
});

test('T-WB-09: run with downstream is the query and everything that uses it, in dependency order', () => {
  const { ix } = build();
  assert.deepEqual(planRun(ix, 'run-downstream', { current: 'Sales_Clean' }).names, ['Sales_Clean', 'Summary', 'Regions', 'Report']);
  assert.deepEqual(planRun(ix, 'run-downstream', { current: 'Other' }).names, ['Other']);
});

test('T-WB-09: run all skips functions and keeps dependency order', () => {
  const { ix } = build();
  const p = planRun(ix, 'run-all');
  assert.deepEqual(p.names, ['Sales_Raw', 'Sales_Clean', 'Summary', 'Regions', 'Other', 'Report']);
  assert.deepEqual(p.skipped, ['fx']);
});

test('T-WB-09: run stale picks only the stale queries and carries the stop-at-first-error option', () => {
  const { ix } = build();
  const statuses = new Map([['Sales_Clean', 'stale'], ['Summary', 'stale'], ['Other', 'ok'], ['Regions', 'error']]);
  const p = planRun(ix, 'run-stale', { statuses, stopAtFirstError: true });
  assert.deepEqual(p.names, ['Sales_Clean', 'Summary']);
  assert.equal(p.stopAtFirstError, true);
  assert.deepEqual(planRun(ix, 'run-stale', { statuses: new Map() }).names, []);
});

test('T-WB-09: fingerprints change exactly for the edited query and everything downstream of it', () => {
  const a = build();
  const before = a.fps();
  const edited = build(MEMBERS.map(([n, e]) => (n === 'Sales_Raw' ? [n, '2'] : [n, e])));
  const after = edited.fps();
  const changed = [...before].filter(([n, fp]) => after.get(n) !== fp).map(([n]) => n);
  assert.deepEqual(changed.sort(), ['Regions', 'Report', 'Sales_Clean', 'Sales_Raw', 'Summary']);
});

test('T-WB-09: surrounding whitespace does not change a fingerprint, other edits do', () => {
  const a = build().fps();
  const ws = build(MEMBERS.map(([n, e]) => (n === 'Other' ? [n, `  ${e}  `] : [n, e]))).fps();
  assert.equal(ws.get('Other'), a.get('Other'));
  const real = build(MEMBERS.map(([n, e]) => (n === 'Other' ? [n, '6'] : [n, e]))).fps();
  assert.notEqual(real.get('Other'), a.get('Other'));
  assert.equal(real.get('Summary'), a.get('Summary'));
});

test('T-WB-09: the culture and a used binding key are part of the fingerprint', () => {
  const t = build();
  const base = t.fps({ culture: 'en-US', bindingKeysOf: () => [] });
  const other = t.fps({ culture: 'fr-FR', bindingKeysOf: () => [] });
  assert.ok([...base].every(([n, fp]) => other.get(n) !== fp));
  const bound = t.fps({ culture: 'en-US', bindingKeysOf: (n) => (n === 'Sales_Raw' ? ['file:a.xlsx'] : []) });
  const changed = [...base].filter(([n, fp]) => bound.get(n) !== fp).map(([n]) => n).sort();
  assert.deepEqual(changed, ['Regions', 'Report', 'Sales_Clean', 'Sales_Raw', 'Summary']);
});

test('T-WB-09: a cycle gets a fingerprint without looping and fnv1a is stable', () => {
  const t = build([['A', 'B'], ['B', 'A'], ['C', '1']]);
  const fps = t.fps();
  assert.equal(fps.size, 3);
  assert.equal(fnv1a(''), '811c9dc5');
  assert.equal(fnv1a('a'), 'e40c292c');
});

test('T-WB-09: editing a staging query turns exactly its downstream stale, and run stale runs exactly those', () => {
  const t = build();
  const book = new StatusBook();
  const fps0 = t.fps();
  for (const m of t.ix.members) if (!m.isFunction) book.finish(m.name, { status: 'ok', fingerprint: fps0.get(m.name), rows: 3 });
  assert.equal(book.counts(t.ix, fps0).ok, 6);
  assert.equal(book.statusOf('fx', fps0, true), 'skipped');
  const edited = build(MEMBERS.map(([n, e]) => (n === 'Sales_Clean' ? [n, 'Sales_Raw + 10'] : [n, e])));
  const fps1 = edited.fps();
  const statuses = book.statuses(edited.ix, fps1);
  const stale = [...statuses].filter(([, s]) => s === 'stale').map(([n]) => n).sort();
  assert.deepEqual(stale, ['Regions', 'Report', 'Sales_Clean', 'Summary']);
  assert.deepEqual(planRun(edited.ix, 'run-stale', { statuses }).names, ['Sales_Clean', 'Summary', 'Regions', 'Report']);
  for (const n of ['Sales_Clean', 'Summary', 'Regions', 'Report']) book.finish(n, { status: 'ok', fingerprint: fps1.get(n), rows: 3 });
  assert.equal(book.counts(edited.ix, fps1).stale, 0);
});

test('T-WB-09: statuses follow the life of a run', () => {
  const t = build();
  const book = new StatusBook();
  const fps = t.fps();
  assert.equal(book.statusOf('Other', fps), 'never');
  book.queue(['Other', 'Summary']);
  assert.equal(book.statusOf('Other', fps), 'queued');
  book.start('Other');
  assert.equal(book.statusOf('Other', fps), 'running');
  book.finish('Other', { status: 'stopped', fingerprint: fps.get('Other') });
  assert.equal(book.statusOf('Other', fps), 'stopped');
  book.cancelPending();
  assert.equal(book.statusOf('Summary', fps), 'cancelled');
  book.finish('Other', { status: 'error', fingerprint: fps.get('Other') });
  assert.equal(book.statusOf('Other', fps), 'error');
  assert.ok(STATUSES.includes(book.statusOf('Other', fps)));
});

test('T-WB-09: history keeps ten runs and reports the row difference with the previous run', () => {
  const t = build();
  const book = new StatusBook();
  const fps = t.fps();
  for (let i = 0; i < 14; i++) book.finish('Other', { status: 'ok', fingerprint: fps.get('Other'), rows: 100 + i });
  assert.equal(book.history.get('Other').length, 10);
  assert.equal(book.rowDelta('Other'), 1);
  book.finish('Other', { status: 'ok', fingerprint: fps.get('Other'), rows: 50 });
  assert.equal(book.rowDelta('Other'), -63);
  assert.equal(book.previous('Other').rows, 113);
  book.finish('Other', { status: 'error', fingerprint: fps.get('Other') });
  assert.equal(book.rowDelta('Other'), null);
  assert.equal(book.rowDelta('Never'), null);
});
