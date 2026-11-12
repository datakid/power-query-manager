import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { outlineModule } from '../../src/core/vba/outline.js';
import { openWorkbook } from '../../src/core/workbook.js';
import { fixture } from './helpers.js';

const proc = (o, name, kind) => o.procedures.find((p) => p.name === name && (!kind || p.kind === kind));

test('T-WB-04: every procedure kind, scope and static', () => {
  const o = outlineModule(['Public Sub A()', 'End Sub', 'Private Function B() As Long', 'End Function', 'Friend Sub C()', 'End Sub', 'Static Sub D()', 'End Sub', 'Public Static Function E(x)', 'End Function', 'Property Get F() As String', 'End Property', 'Property Set G(v As Object)', 'End Property'].join('\n'));
  assert.deepEqual(o.procedures.map((p) => [p.name, p.kind, p.scope, p.isStatic]), [['A', 'sub', 'public', false], ['B', 'function', 'private', false], ['C', 'sub', 'friend', false], ['D', 'sub', 'public', true], ['E', 'function', 'public', true], ['F', 'property-get', 'public', false], ['G', 'property-set', 'public', false]]);
  assert.equal(proc(o, 'B').returns, 'Long');
  assert.deepEqual(o.problems, []);
});

test('T-WB-04: a signature continued over several lines keeps its start and end lines', () => {
  const o = outlineModule('Public Sub Main(ByVal a As Long, _\n                Optional b As String = "x, y", _\n                ParamArray rest() As Variant)\n    Debug.Print a\nEnd Sub');
  const p = proc(o, 'Main');
  assert.deepEqual([p.startLine, p.bodyStartLine, p.endLine], [1, 4, 5]);
  assert.deepEqual(p.params.map((x) => [x.name, x.byRef, x.optional, x.type]), [['a', false, false, 'Long'], ['b', true, true, 'String'], ['rest', true, true, 'Variant']]);
});

test('T-WB-04: a string containing End Sub and a comment containing Sub X() do not change the structure', () => {
  const o = outlineModule(['Sub A()', '    Debug.Print "End Sub"', "    ' Sub Fake()", '    Rem Sub AlsoFake()', '    x = "say ""Sub Y()"" now"', 'End Sub'].join('\n'));
  assert.deepEqual(o.procedures.map((p) => p.name), ['A']);
  assert.equal(o.procedures[0].endLine, 6);
  assert.deepEqual(o.problems, []);
});

test('T-WB-04: statement separators and labels are understood', () => {
  const o = outlineModule('Private Function Calc(x As Double) As Double: Calc = x: End Function\nSub S()\nExitSub:\n  Exit Sub\nEnd Sub');
  assert.deepEqual(o.procedures.map((p) => [p.name, p.startLine, p.endLine]), [['Calc', 1, 1], ['S', 2, 5]]);
});

test('T-WB-04: Declare statements are declarations, not procedures', () => {
  const o = outlineModule('Private Declare PtrSafe Function GetTick Lib "kernel32" Alias "GetTickCount" () As Long\nPublic Declare Sub Sleep Lib "kernel32" (ByVal ms As Long)\nSub Main()\nEnd Sub');
  assert.deepEqual(o.declarations.map((d) => [d.kind, d.name, d.scope]), [['declare', 'GetTick', 'private'], ['declare', 'Sleep', 'public']]);
  assert.deepEqual(o.procedures.map((p) => p.name), ['Main']);
});

test('T-WB-04: a Property Get, Let and Set with one name stay separate entries', () => {
  const o = outlineModule('Public Property Get Name() As String\nEnd Property\nPublic Property Let Name(ByVal v As String)\nEnd Property\nPublic Property Set Obj(v As Object)\nEnd Property');
  assert.deepEqual(o.procedures.map((p) => [p.name, p.kind]), [['Name', 'property-get'], ['Name', 'property-let'], ['Obj', 'property-set']]);
});

test('T-WB-04: a module with only declarations has options, variables, constants, types and enums', () => {
  const o = outlineModule(['Option Explicit', 'Option Compare Text', 'Option Base 1', 'Option Private Module', 'Public Const A As Long = 1, B = "x,y"', 'Private mCount As Long, mItems() As String', 'Dim mOld', 'Public WithEvents App As Application', 'Public Event Changed(ByVal n As Long)', 'Private Type Pt', '  X As Long', '  Y As Long', 'End Type', 'Public Enum Mode', '  One', '  Two', 'End Enum'].join('\r\n'));
  assert.deepEqual(o.options, { explicit: true, compare: 'text', base: 1, private: true });
  assert.deepEqual(o.declarations.map((d) => [d.kind, d.name, d.scope]), [['const', 'A', 'public'], ['const', 'B', 'public'], ['dim', 'mCount', 'private'], ['dim', 'mItems', 'private'], ['dim', 'mOld', 'private'], ['dim', 'App', 'public'], ['event', 'Changed', 'public'], ['type', 'Pt', 'private'], ['enum', 'Mode', 'public']]);
  assert.deepEqual(o.procedures, []);
  assert.deepEqual(o.problems, []);
});

test('T-WB-04: locals inside a procedure are not module declarations', () => {
  const o = outlineModule('Sub A()\n  Dim x As Long\n  Const K = 3\nEnd Sub');
  assert.deepEqual(o.declarations, []);
});

test('T-WB-04: entry points are public subs without required parameters in a standard module', () => {
  const t = 'Public Sub Go()\nEnd Sub\nSub Plain()\nEnd Sub\nPrivate Sub Hidden()\nEnd Sub\nPublic Sub NeedsArg(x As Long)\nEnd Sub\nPublic Sub Opt(Optional x As Long)\nEnd Sub\nPublic Function F()\nEnd Function';
  const o = outlineModule(t);
  assert.deepEqual(o.procedures.filter((p) => p.isEntryPoint).map((p) => p.name), ['Go', 'Plain', 'Opt']);
  assert.deepEqual(outlineModule(t, { moduleKind: 'class' }).procedures.filter((p) => p.isEntryPoint), []);
});

test('T-WB-04: event handlers are recognised in document, class and form modules only', () => {
  const t = 'Private Sub Workbook_Open()\nEnd Sub\nPrivate Sub Worksheet_Change(ByVal Target As Range)\nEnd Sub\nPrivate Sub Class_Initialize()\nEnd Sub\nPrivate Sub UserForm_Click()\nEnd Sub\nPrivate Sub Helper()\nEnd Sub';
  const doc = outlineModule(t, { moduleKind: 'document' });
  assert.deepEqual(doc.procedures.map((p) => [p.name, p.isEventHandler, p.eventOf]), [['Workbook_Open', true, 'Workbook'], ['Worksheet_Change', true, 'Worksheet'], ['Class_Initialize', true, 'Class'], ['UserForm_Click', true, 'UserForm'], ['Helper', false, null]]);
  assert.equal(outlineModule(t).procedures.some((p) => p.isEventHandler), false);
});

test('T-WB-04: structural problems carry a line, a column and a code', () => {
  const o = outlineModule('Sub A()\n  x = 1\nSub B()\nEnd Sub\nEnd Sub\nFunction C()\nEnd Sub\nSub D()\n  s = "open\nEnd Sub\nType T\n  a As Long');
  assert.deepEqual(o.problems.map((p) => [p.line, p.code]), [[1, 'unterminated-procedure'], [5, 'stray-end'], [7, 'mismatched-end'], [9, 'unterminated-string'], [11, 'unterminated-block']]);
  for (const p of o.problems) assert.ok(p.col >= 1);
});

test('T-WB-04: CRLF, tabs and an empty module', () => {
  assert.deepEqual(outlineModule('').procedures, []);
  const o = outlineModule('Sub A()\r\n\tx = 1\r\nEnd Sub\r\n');
  assert.deepEqual([o.procedures[0].startLine, o.procedures[0].endLine], [1, 3]);
});

test('T-WB-04: every module in the fixtures outlines without exceptions and stays inside its own lines', async () => {
  const files = readdirSync(fileURLToPath(new URL('../fixtures/external/', import.meta.url))).filter((f) => /\.xlsm$/.test(f));
  assert.ok(files.length >= 4);
  let seen = 0;
  for (const f of files) {
    const wb = await openWorkbook(fixture(f), f);
    if (!wb.vba || !wb.vba.project) continue;
    for (const m of wb.vba.project.modules) {
      if (m.error || !m.model) continue;
      const kind = m.kind === 'standard' ? 'standard' : m.kind === 'class' ? 'class' : 'document';
      const o = outlineModule(m.model.visible, { moduleKind: kind });
      const total = m.model.visible.split(/\r\n|\r|\n/).length;
      for (const p of o.procedures) {
        assert.ok(p.startLine >= 1 && p.endLine >= p.startLine && p.endLine <= total, `${f} ${m.name} ${p.name}`);
        assert.ok(p.bodyStartLine >= p.startLine);
      }
      assert.deepEqual(o.problems.filter((x) => x.code === 'unterminated-procedure' || x.code === 'stray-end'), [], `${f} ${m.name}`);
      seen++;
    }
  }
  assert.ok(seen > 4);
});
