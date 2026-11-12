import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStep, literal, fieldRef, uniqueName, numberLiteral, FILTER_OPS } from '../../src/core/wb/m-gen.js';
import { textLiteral } from '../../src/core/wb/ident.js';
import { stepsOf } from '../../src/core/wb/steps.js';
import { S } from '../../src/ui/strings.js';
import { evalM } from './helpers.js';

const COLS = ['Name', 'Amount', 'when', 'each', '[x]', 'Amount "net"', '#"'];
const ROWS = [
  ['Alice', 30, { date: '2024-01-03' }, 'a', 'p', 1, 'z'],
  ['Bob', 25, { date: '2024-02-10' }, 'b', 'q', 2, 'y'],
  ['Cy\nrus', null, { date: '2024-01-03' }, 'c', 'r', 3, 'x'],
  ['alice', 40, null, 'a', 's', 4, 'w']
];

const table = () => `#table({${COLS.map(textLiteral).join(', ')}}, {${ROWS.map((r) => `{${r.map(literal).join(', ')}}`).join(', ')}})`;

function run(action, existing = []) {
  const step = generateStep(action, { prev: 'Source', existing, names: S.stepNames });
  const q = `let Source = ${table()}, ${step.binding} in ${step.name.includes(' ') ? `#"${step.name}"` : step.name}`;
  const parsed = stepsOf(q, 0);
  assert.equal(parsed.shape, 'let');
  assert.deepEqual(parsed.steps[1].inputs, ['Source']);
  assert.equal(parsed.steps[1].linear, true);
  return { step, out: evalM(q) };
}

const names = (out) => out.rows.map((r) => r[0]);

test('T-WB-06: every filter operation produces the expected rows', () => {
  const cases = [
    [{ op: 'equals', column: 'Name', value: 'Bob' }, ['Bob']],
    [{ op: 'notEquals', column: 'Name', value: 'Bob' }, ['Alice', 'Cy\nrus', 'alice']],
    [{ op: 'contains', column: 'Name', value: 'lic' }, ['Alice', 'alice']],
    [{ op: 'contains', column: 'Name', value: 'ALI', ignoreCase: true }, ['Alice', 'alice']],
    [{ op: 'contains', column: 'Name', value: 'ALI' }, []],
    [{ op: 'beginsWith', column: 'Name', value: 'Al' }, ['Alice']],
    [{ op: 'endsWith', column: 'Name', value: 'ob' }, ['Bob']],
    [{ op: 'gt', column: 'Amount', value: 25 }, ['Alice', 'alice']],
    [{ op: 'gte', column: 'Amount', value: 25 }, ['Alice', 'Bob', 'alice']],
    [{ op: 'lt', column: 'Amount', value: 30 }, ['Bob']],
    [{ op: 'lte', column: 'Amount', value: 30 }, ['Alice', 'Bob']],
    [{ op: 'isNull', column: 'Amount' }, ['Cy\nrus']],
    [{ op: 'isNotNull', column: 'Amount' }, ['Alice', 'Bob', 'alice']],
    [{ op: 'in', column: 'Name', values: ['Bob', 'alice', 'nobody'] }, ['Bob', 'alice']]
  ];
  for (const [action, expected] of cases) {
    const { out } = run({ type: 'filter', ...action });
    assert.deepEqual(names(out), expected, JSON.stringify(action));
  }
  assert.equal(FILTER_OPS.length, 12);
});

test('T-WB-06: filtering on a date uses a culture-free literal', () => {
  const { step, out } = run({ type: 'filter', column: 'when', op: 'equals', value: { date: '2024-01-03' } });
  assert.match(step.expr, /#date\(2024, 1, 3\)/);
  assert.deepEqual(names(out), ['Alice', 'Cy\nrus']);
});

test('T-WB-06: awkward column names are quoted and still work', () => {
  for (const [column, value, expected] of [['each', 'a', ['Alice', 'alice']], ['[x]', 'q', ['Bob']], ['Amount "net"', 3, ['Cy\nrus']], ['#"', 'y', ['Bob']]]) {
    const { out } = run({ type: 'filter', column, op: 'equals', value });
    assert.deepEqual(names(out), expected, column);
  }
  assert.equal(fieldRef('Amount'), '[Amount]');
  assert.equal(fieldRef('Order Date'), '[Order Date]');
  assert.equal(fieldRef('each'), '[#"each"]');
  assert.equal(fieldRef('[x]'), '[#"[x]"]');
});

test('T-WB-06: a text value with a newline, a quote and a hash round-trips', () => {
  assert.equal(textLiteral('a\nb\r\tc"d'), '"a#(lf)b#(cr)#(tab)c""d"');
  assert.equal(textLiteral('#(x)'), '"#(#)(x)"');
  const { out } = run({ type: 'filter', column: 'Name', op: 'equals', value: 'Cy\nrus' });
  assert.deepEqual(names(out), ['Cy\nrus']);
});

test('T-WB-06: sorting by several columns', () => {
  const { out } = run({ type: 'sort', columns: [{ name: 'each' }, { name: 'Amount', descending: true }] });
  assert.deepEqual(names(out), ['alice', 'Alice', 'Bob', 'Cy\nrus']);
  const second = run({ type: 'sort', columns: [{ name: 'Amount', descending: true }] });
  assert.deepEqual(names(second.out).slice(0, 2), ['alice', 'Alice']);
});

test('T-WB-06: remove, keep and rename columns', () => {
  const removed = run({ type: 'removeColumns', columns: ['each', '[x]', 'Amount "net"', '#"', 'when'] });
  assert.deepEqual(removed.out.columns, ['Name', 'Amount']);
  const kept = run({ type: 'keepColumns', columns: ['Amount', 'Name'] });
  assert.deepEqual(kept.out.columns, ['Amount', 'Name']);
  const renamed = run({ type: 'renameColumn', renames: [{ from: 'Name', to: 'Full "Name"' }, { from: 'each', to: 'if' }] });
  assert.deepEqual(renamed.out.columns.slice(0, 4), ['Full "Name"', 'Amount', 'when', 'if']);
});

test('T-WB-06: change type uses culture-free types', () => {
  const { step, out } = run({ type: 'changeType', columns: [{ name: 'Amount', type: 'integer' }, { name: 'Name', type: 'text' }, { name: 'when', type: 'date' }] });
  assert.equal(step.expr.includes('Int64.Type'), true);
  assert.equal(/culture/i.test(step.expr), false);
  assert.equal(out.rows.length, 4);
  for (const t of ['text', 'number', 'integer', 'decimal', 'currency', 'percentage', 'date', 'datetime', 'datetimezone', 'time', 'duration', 'logical', 'binary', 'any']) {
    const s = generateStep({ type: 'changeType', columns: [{ name: 'A', type: t }] }, { prev: 'Source', names: S.stepNames });
    assert.equal(stepsOf(`let Source = 1, ${s.binding} in ${s.name}`.replace(/in Changed Type/, 'in #"Changed Type"'), 0).shape, 'let', t);
  }
});

test('T-WB-06: remove duplicates, keep first rows and replace value', () => {
  const all = run({ type: 'removeDuplicates', columns: ['each'] });
  assert.deepEqual(names(all.out), ['Alice', 'Bob', 'Cy\nrus']);
  const first = run({ type: 'keepFirstRows', count: 2 });
  assert.deepEqual(names(first.out), ['Alice', 'Bob']);
  const zero = run({ type: 'keepFirstRows', count: 0 });
  assert.deepEqual(zero.out.rows, []);
  const exact = run({ type: 'replaceValue', column: 'Name', find: 'Bob', replace: 'Robert' });
  assert.deepEqual(names(exact.out), ['Alice', 'Robert', 'Cy\nrus', 'alice']);
  const partial = run({ type: 'replaceValue', column: 'Name', find: 'li', replace: 'LI', mode: 'text' });
  assert.deepEqual(names(partial.out), ['ALIce', 'Bob', 'Cy\nrus', 'aLIce']);
});

test('T-WB-06: step names come from the strings and are made unique', () => {
  assert.equal(uniqueName('Filtered Rows', ['Source']), 'Filtered Rows');
  assert.equal(uniqueName('Filtered Rows', ['Filtered Rows']), 'Filtered Rows 1');
  assert.equal(uniqueName('Filtered Rows', ['Filtered Rows', 'Filtered Rows 1']), 'Filtered Rows 2');
  const s = generateStep({ type: 'filter', column: 'A', op: 'isNull' }, { prev: 'Source', existing: ['Filtered Rows'], names: S.stepNames });
  assert.equal(s.name, 'Filtered Rows 1');
});

test('T-WB-06: literals are culture-independent', () => {
  assert.equal(literal(1234.5), '1234.5');
  assert.equal(literal(-3), '-3');
  assert.equal(literal(true), 'true');
  assert.equal(literal(null), 'null');
  assert.equal(literal({ date: '2024-01-03' }), '#date(2024, 1, 3)');
  assert.equal(literal({ datetime: '2024-01-03T04:05:06' }), '#datetime(2024, 1, 3, 4, 5, 6)');
  assert.equal(literal({ time: '04:05' }), '#time(4, 5, 0)');
  assert.equal(numberLiteral(NaN), '#nan');
  assert.equal(numberLiteral(-0), '0');
  assert.equal(numberLiteral(Infinity), '#infinity');
  assert.throws(() => literal({ date: '03/01/2024' }));
});

test('T-WB-06: bad requests are refused with a sentence', () => {
  const g = (a) => generateStep(a, { prev: 'Source', names: S.stepNames });
  assert.throws(() => g({ type: 'removeColumns', columns: [] }), /at least one column/);
  assert.throws(() => g({ type: 'keepFirstRows', count: -1 }), /whole number/);
  assert.throws(() => g({ type: 'filter', column: 'A', op: 'in', values: [] }), /at least one value/);
  assert.throws(() => g({ type: 'filter', column: 'A', op: 'sounds like', value: 'x' }), /not known/);
  assert.throws(() => g({ type: 'pivot' }), /not known/);
});
