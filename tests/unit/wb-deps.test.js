import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteIdent } from '../../src/core/wb/ident.js';
import { indexSection, updateMember, upstreamOf, downstreamOf, topoOrder } from '../../src/core/wb/deps.js';

const section = (...members) => `section Section1;\r\n\r\n${members.map(([n, e]) => `shared ${quoteIdent(n)} = ${e};`).join('\r\n\r\n')}\r\n`;
const edges = (ix) => Object.fromEntries([...ix.refs].map(([k, v]) => [k, [...v].sort()]));

test('T-WB-01: a step named like a query shadows it', () => {
  const ix = indexSection(section(['Sales', '1'], ['Out', 'let Sales = 2, x = Sales in x']));
  assert.deepEqual(edges(ix), { Sales: [], Out: [] });
});

test('T-WB-01: a function parameter shadows a query and a nested let shadows only inside', () => {
  const ix = indexSection(section(['A', '1'], ['B', '2'], ['F', '(A) => A + B'], ['G', 'let x = let A = 3 in A in x + A']));
  assert.deepEqual(edges(ix), { A: [], B: [], F: ['B'], G: ['A'] });
});

test('T-WB-01: quoted identifiers resolve to members', () => {
  const ix = indexSection(section(['My Query', '1'], ['Out', '#"My Query" + 1']));
  assert.deepEqual([...ix.refs.get('Out')], ['My Query']);
  assert.deepEqual([...ix.usedBy.get('My Query')], ['Out']);
});

test('T-WB-01: #shared and #sections mark a member dynamic and depend on everything', () => {
  const ix = indexSection(section(['A', '1'], ['B', '#shared'], ['C', '2']));
  assert.deepEqual([...ix.dynamic], ['B']);
  assert.deepEqual([...upstreamOf(ix, ['B'])].sort(), ['A', 'C']);
  assert.ok(downstreamOf(ix, ['A']).has('B'));
});

test('T-WB-01: a three-cycle is reported once with its members in section order', () => {
  const ix = indexSection(section(['A', 'C'], ['B', 'A'], ['C', 'B'], ['D', '1']));
  assert.deepEqual(ix.cycles, [['A', 'B', 'C']]);
  assert.equal(ix.layers.get('D'), 0);
  assert.ok(Number.isFinite(ix.layers.get('A')));
});

test('T-WB-01: a self-reference without @ is a cycle, with @ it is recursion', () => {
  const ix = indexSection(section(['A', 'A + 1'], ['F', '(n) => if n = 0 then 0 else @F(n - 1)']));
  assert.deepEqual(ix.cycles, [['A']]);
  assert.deepEqual(edges(ix).F, []);
});

test('T-WB-01: layers count the longest path and the order is stable', () => {
  const ix = indexSection(section(['A', '1'], ['B', 'A'], ['C', 'A + B'], ['D', '4']));
  assert.deepEqual([...ix.layers], [['A', 0], ['B', 1], ['C', 2], ['D', 0]]);
  assert.deepEqual(topoOrder(ix), ['A', 'B', 'C', 'D']);
  assert.deepEqual(topoOrder(ix, ['D', 'C']), ['C', 'D']);
});

test('T-WB-01: upstream and downstream, direct and transitive', () => {
  const ix = indexSection(section(['A', '1'], ['B', 'A'], ['C', 'B']));
  assert.deepEqual([...upstreamOf(ix, ['C'], { transitive: false })], ['B']);
  assert.deepEqual([...upstreamOf(ix, ['C'])].sort(), ['A', 'B']);
  assert.deepEqual([...downstreamOf(ix, ['A'], { transitive: false })], ['B']);
  assert.deepEqual([...downstreamOf(ix, ['A'])].sort(), ['B', 'C']);
});

test('T-WB-01: unresolved identifiers are recorded, library names and intrinsics are not', () => {
  const ix = indexSection(section(['A', 'Table.Combine({Missing, #table({}, {})}) + Other']));
  assert.deepEqual(ix.unresolved.get('A').map((u) => u.ident).sort(), ['Missing', 'Other']);
});

test('T-WB-01: an incremental update adds and removes edges and keeps later spans right', () => {
  const text = section(['A', '1'], ['B', 'A'], ['C', 'B']);
  const ix = indexSection(text);
  const up = updateMember(ix, 'B', '5', { sectionText: text });
  assert.deepEqual(edges(up), { A: [], B: [], C: ['B'] });
  const longer = updateMember(up, 'B', 'A + A + A', { sectionText: text });
  assert.deepEqual(edges(longer), { A: [], B: ['A'], C: ['B'] });
  const grown = text.replace('shared B = A;', 'shared B = A + A + A;');
  const fresh = indexSection(grown);
  assert.deepEqual(longer.members.map((m) => [m.name, m.start, m.end, m.exprStart, m.exprEnd]), fresh.members.map((m) => [m.name, m.start, m.end, m.exprStart, m.exprEnd]));
});

test('T-WB-01: a member that stops parsing keeps its old edges until it parses again', () => {
  const text = section(['A', '1'], ['B', 'A']);
  const ix = indexSection(text);
  const broken = updateMember(ix, 'B', 'A +', { sectionText: text });
  assert.deepEqual([...broken.refs.get('B')], ['A']);
  assert.ok(broken.unknown.has('B'));
  assert.ok(broken.members.find((m) => m.name === 'B').parseError);
  const fixed = updateMember(broken, 'B', 'A + 1', { sectionText: text });
  assert.equal(fixed.unknown.has('B'), false);
});

test('T-WB-01: a member that fails to parse at first is unknown, not an edge', () => {
  const ix = indexSection(section(['A', '1'], ['B', 'let x = in x']));
  assert.ok(ix.unknown.has('B'));
  assert.deepEqual([...ix.refs.get('B')], []);
});

test('T-WB-01: functions are flagged', () => {
  const ix = indexSection(section(['F', '(x) => x'], ['V', '1']));
  assert.deepEqual(ix.members.map((m) => m.isFunction), [true, false]);
});

test('T-WB-01: a thousand members index in under 300 ms', () => {
  const members = [];
  for (let i = 0; i < 1000; i++) members.push([`Q${i}`, i === 0 ? '1' : `let a = Q${i - 1}, b = Table.AddColumn(a, "x", each 1) in b`]);
  const text = section(...members);
  const t0 = performance.now();
  const ix = indexSection(text);
  assert.ok(performance.now() - t0 < 300, `took ${performance.now() - t0} ms`);
  assert.equal(ix.layers.get('Q999'), 999);
});
