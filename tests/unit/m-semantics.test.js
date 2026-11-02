import test from 'node:test';
import assert from 'node:assert/strict';
import { evalM, runM, baseOptions } from './helpers.js';
import { runOnce } from '../../src/core/m/engine.js';

const cases = [
  ['null + 1', null],
  ['1 + null', null],
  ['null & "a"', null],
  ['"a" & null', null],
  ['null = null', true],
  ['null = 1', false],
  ['null < 1', null],
  ['null and false', false],
  ['false and null', false],
  ['null or true', true],
  ['true or error "x"', true],
  ['false and error "x"', false],
  ['null and true', null],
  ['not null', null],
  ['not true', false],
  ['1 + 2 * 3', 7],
  ['(1 + 2) * 3', 9],
  ['10 / 4', 2.5],
  ['1 / 0', 'Infinity'],
  ['-1 / 0', '-Infinity'],
  ['0 / 0', 'NaN'],
  ['#nan = #nan', false],
  ['#nan <> #nan', true],
  ['#infinity', 'Infinity'],
  ['-#infinity', '-Infinity'],
  ['2 = 2.0', true],
  ['"a" = "a"', true],
  ['"a" = "A"', false],
  ['"a" < "b"', true],
  ['"b" > "a"', true],
  ['1 = "1"', false],
  ['{1,2} = {1,2}', true],
  ['{1,2} = {2,1}', false],
  ['[a=1] = [a=1]', true],
  ['[a=1,b=2] = [b=2,a=1]', true],
  ['#date(2020,1,1) = #date(2020,1,1)', true],
  ['true = true', true],
  ['"a" & "b" & "c"', 'abc'],
  ['{1} & {2,3}', [1, 2, 3]],
  ['[a=1] & [b=2]', { a: 1, b: 2 }],
  ['[a=1,b=2] & [b=3]', { a: 1, b: 3 }],
  ['#date(2020,1,1) & #time(1,2,3)', 'datetime:2020-01-01T01:02:03'],
  ['#date(2020,3,1) - #date(2020,2,1)', 'duration:29.00:00:00'],
  ['#date(2020,1,1) + #duration(2,0,0,0)', 'date:2020-01-03'],
  ['#datetime(2020,1,1,0,0,0) + #duration(0,1,30,0)', 'datetime:2020-01-01T01:30:00'],
  ['#time(23,0,0) + #duration(0,2,0,0)', 'time:01:00:00'],
  ['#duration(1,0,0,0) * 2', 'duration:2.00:00:00'],
  ['#duration(1,0,0,0) / #duration(0,12,0,0)', 2],
  ['#datetime(2020,1,2,0,0,0) - #datetime(2020,1,1,12,0,0)', 'duration:12:00:00'],
  ['{1,2,3}{0}', 1],
  ['{1,2,3}{2}', 3],
  ['{1,2,3}{3}?', null],
  ['{1,2,3}{-1}?', { error: 'Expression.Error', message: 'The index must be a non-negative integer.' }],
  ['[a=1][a]', 1],
  ['[a=1][b]?', null],
  ['[a=1][b]', { error: 'Expression.Error', message: "The field 'b' of the record wasn't found." }],
  ['[a=1, b=a+1, c=b+1][c]', 3],
  ['[#"x y"=5][x y]', 5],
  ['[a=[b=[c=7]]][a][b][c]', 7],
  ['[a=1,b=2,c=3][[a],[c]]', { a: 1, c: 3 }],
  ['(each _ + 1)(2)', 3],
  ['(x) => x * 2', 'function'],
  ['((x, y) => x - y)(10, 3)', 7],
  ['((x, optional y) => if y = null then x else x + y)(1)', 1],
  ['((x, optional y) => if y = null then x else x + y)(1, 2)', 3],
  ['let f = (n) => if n <= 1 then 1 else n * @f(n - 1) in f(5)', 120],
  ['let a = 1, b = error "never used" in a', 1],
  ['let a = error "boom" in 1', 1],
  ['{1, error "x", 3}{2}', 3],
  ['List.Count({1, error "x", 3})', 3],
  ['[a=1, b=error "x", c=3][c]', 3],
  ['try 1', { HasError: false, Value: 1 }],
  ['try error "x"', { HasError: true, Error: { Reason: 'Expression.Error', Message: 'x', Detail: null } }],
  ['try error "x" otherwise 5', 5],
  ['(try error [Reason="Custom.Reason", Message="m", Detail="d"])[Error][Reason]', 'Custom.Reason'],
  ['try error "x" catch (e) => e[Message]', 'x'],
  ['error "boom"', { error: 'Expression.Error', message: 'boom' }],
  ['error [Reason="R", Message="M", Detail=1]', { error: 'R', message: 'M' }],
  ['1 as number', 1],
  ['"a" as number', { error: 'Expression.Error', message: 'We cannot convert the value "a" to type number.' }],
  ['null as nullable number', null],
  ['null as number', { error: 'Expression.Error', message: 'We cannot convert the value null to type number.' }],
  ['1 is number', true],
  ['"a" is number', false],
  ['null is nullable number', true],
  ['null is number', false],
  ['{1,2} is list', true],
  ['[a=1] is record', true],
  ['1 is any', true],
  ['#table({"A"},{{1}}) is table', true],
  ['if true then 1 else 2', 1],
  ['if 1 = 2 then "a" else "b"', 'b'],
  ['if null then 1 else 2', { error: 'Expression.Error', message: 'We cannot convert the value to type Logical.' }],
  ['{1..5}', [1, 2, 3, 4, 5]],
  ['{"a".."e"}', ['a', 'b', 'c', 'd', 'e']],
  ['{1, 3..5, 9}', [1, 3, 4, 5, 9]],
  ['{}', []],
  ['"a#(tab)b"', 'a\tb'],
  ['"x#(cr,lf)y"', 'x\r\ny'],
  ['"#(0041)"', 'A'],
  ['"q""r"', 'q"r'],
  ['0x1F', 31],
  ['1e3', 1000],
  ['1.5e-1', 0.15],
  ['.5', 0.5],
  ['#"a b" = 1 meta [x=1]', { error: 'Expression.Error', message: "The name 'a b' wasn't recognized.  Make sure it's spelled correctly." }],
  ['Value.Metadata([a=1] meta [m=5])[m]', 5],
  ['Value.Metadata(1 meta [m=5])', {}],
  ['Section1!Other', { error: 'Expression.Error', message: "The name 'Other' wasn't recognized.  Make sure it's spelled correctly." }],
  ['Record.FieldCount(#shared) > 100', true],
  ['Record.HasFields(#shared, "Table.AddColumn")', true],
  ['Record.FieldNames(#sections)', ['Section1']],
  ['let x = 1 in let x = 2 in x', 2],
  ['let x = 1, y = let x = 5 in x + 1 in {x, y}', [1, 6]],
  ['type number', 'number'],
  ['type nullable text', 'nullable text'],
  ['type {number}', '{number}'],
  ['Value.Is(1, type number)', true],
  ['Value.Is(1, type text)', false],
  ['Value.Is({1,2}, type {number})', true],
  ['Value.Is({1,"a"}, type {number})', false],
  ['Value.Is([A=1], type [A=number])', true],
  ['Value.Is([A="x"], type [A=number])', false],
  ['1 meta [a=1] + 1', 2]
];

for (const [expr, expected] of cases) {
  test(`M: ${expr}`, () => {
    const got = evalM(expr);
    if (expected && typeof expected === 'object' && 'error' in expected) {
      assert.equal(got.error, expected.error, JSON.stringify(got));
      if (expected.message) assert.equal(got.message, expected.message);
    } else assert.deepEqual(got, expected);
  });
}

test('T-M-LAZY-1: errors in unused bindings do not surface', () => {
  assert.equal(evalM('let a = 1/0 + error "x", b = 2 in b'), 2);
});

test('cyclic references raise an error', () => {
  const got = evalM('let a = b, b = a in a');
  assert.equal(got.error, 'Expression.Error');
  assert.match(got.message, /cyclic/);
});

test('deep recursion is stopped cleanly', () => {
  const r = runM('let f = (n) => if n = 0 then 0 else 1 + @f(n - 1) in f(100000)');
  assert.equal(r.status, 'stopped');
  assert.equal(r.code, 'm.depth');
});

test('timeout stops an endless generator', () => {
  const r = runM('List.Generate(() => 0, each true, each _ + 1)', { limits: { timeoutMs: 200, maxRows: 1e9 } });
  assert.equal(r.status, 'stopped');
  assert.ok(['m.timeout', 'm.rows'].includes(r.code));
});

test('row limit stops List.Numbers', () => {
  const r = runM('List.Numbers(0, 5000000)', { limits: { maxRows: 1000 } });
  assert.equal(r.status, 'stopped');
  assert.equal(r.code, 'm.rows');
});

test('parse errors carry line and column', () => {
  const r = runM('let\r\n  a = 1,\r\n  b = \r\nin b');
  assert.equal(r.status, 'parse-error');
  assert.equal(r.error.line, 6);
  assert.equal(r.error.message, 'Expected an expression.');
  assert.ok(r.error.col >= 1);
});

test('section members reference each other', () => {
  const sectionText = 'section Section1;\r\n\r\nshared A = 1;\r\n\r\nshared Q = A + Section1!A + 1;';
  const r = runOnce({ ...baseOptions, sectionText, queryName: 'Q' });
  assert.equal(r.status, 'ok');
  assert.equal(r.result.value, 3);
});
