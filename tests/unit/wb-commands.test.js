import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistry, matches, parseShortcut, labelOf, RESERVED } from '../../src/app/commands.js';
import { buildRegistry } from '../../src/app/app-commands.js';
import { paletteEntries } from '../../src/ui/wb/palette.js';
import { S } from '../../src/ui/strings.js';

const ev = (o) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

test('T-WB-13: shortcuts parse and match with the right modifiers', () => {
  assert.deepEqual(parseShortcut('Mod+Shift+P'), { mod: true, shift: true, alt: false, key: 'P' });
  assert.equal(matches(ev({ key: 'k', ctrlKey: true }), 'Mod+K'), true);
  assert.equal(matches(ev({ key: 'k', metaKey: true }), 'Mod+K'), true);
  assert.equal(matches(ev({ key: 'k', ctrlKey: true, shiftKey: true }), 'Mod+K'), false);
  assert.equal(matches(ev({ key: 'P', ctrlKey: true, shiftKey: true }), 'Mod+Shift+P'), true);
  assert.equal(matches(ev({ key: 'Enter', ctrlKey: true }), 'Mod+Enter'), true);
  assert.equal(matches(ev({ key: '?', shiftKey: true }), '?'), true);
  assert.equal(matches(ev({ key: 'Escape' }), 'Escape'), true);
});

test('T-WB-13: Alt combinations match on the physical key, not the character a layout produces', () => {
  assert.equal(matches(ev({ key: 'ˆ', code: 'KeyI', altKey: true }), 'Alt+I'), true);
  assert.equal(matches(ev({ key: 'ArrowUp', code: 'ArrowUp', altKey: true }), 'Alt+ArrowUp'), true);
  assert.equal(matches(ev({ key: '[', code: 'BracketLeft', altKey: true }), 'Alt+['), true);
  assert.equal(matches(ev({ key: 'a', code: 'KeyA', altKey: true }), 'Alt+I'), false);
});

test('T-WB-13: a shortcut the browser keeps is refused at registration', () => {
  const r = new CommandRegistry();
  for (const k of RESERVED) assert.throws(() => r.register({ id: 'x', keys: [k], surfaces: ['T3'], run: () => {} }), /belongs to the browser/);
  assert.throws(() => r.register({ id: 'y', keys: [], run: () => {} }), /no surface/);
  r.register({ id: 'ok', keys: ['Mod+K'], surfaces: ['T1'], run: () => {} });
  assert.throws(() => r.register({ id: 'ok', keys: [], surfaces: ['T1'], run: () => {} }), /already registered/);
});

test('T-LINT-16: every registered command has a name, a surface and no hover-only surface, and no key is bound twice', () => {
  const reg = buildRegistry({});
  const seen = new Map();
  for (const c of reg.all()) {
    assert.ok(S.cmd[c.id], `S.cmd.${c.id}`);
    assert.ok(c.surfaces.every((s) => ['T1', 'T2', 'T3'].includes(s)), c.id);
    assert.equal(c.hoverOnly, undefined, c.id);
    for (const k of c.keys) {
      assert.equal(seen.has(k), false, `${k} bound twice`);
      seen.set(k, c.id);
    }
  }
  for (const id of Object.keys(S.cmd)) assert.ok(reg.get(id), `S.cmd.${id} is unused`);
});

test('T-WB-13: dispatch finds the command, honours when(), and the sheet is generated from the registry', () => {
  const reg = buildRegistry({});
  assert.equal(reg.dispatch(ev({ key: 'k', ctrlKey: true }), {}).id, 'palette');
  assert.equal(reg.dispatch(ev({ key: 'P', ctrlKey: true, shiftKey: true }), {}).id, 'palette');
  assert.equal(reg.dispatch(ev({ key: 'p', ctrlKey: true }), {}).id, 'print');
  assert.equal(reg.dispatch(ev({ key: 'x', ctrlKey: true }), {}), null);
  const sheet = reg.sheet();
  assert.ok(sheet.some(([k, d]) => k === 'Ctrl/Cmd+K / Ctrl/Cmd+Shift+P' && d === S.cmd.palette));
  assert.ok(sheet.some(([k]) => k === 'Alt+Up'));
  assert.equal(labelOf('Mod+Shift+E'), 'Ctrl/Cmd+Shift+E');
});

test('T-WB-13: commands report why they are unavailable instead of hiding', () => {
  const reg = buildRegistry({});
  const none = reg.list({ ws: null });
  assert.equal(none.find((c) => c.id === 'run').enabled, false);
  assert.match(none.find((c) => c.id === 'run').reason, /Open a workbook/);
  assert.equal(none.find((c) => c.id === 'openFile').enabled, true);
  const some = reg.list({ ws: { runner: { running: false } } });
  assert.equal(some.find((c) => c.id === 'run').enabled, true);
  assert.equal(some.find((c) => c.id === 'cancel').enabled, false);
});

const source = {
  items: () => [{ type: 'query', name: 'Sales_Clean' }, { type: 'query', name: 'Discount' }, { type: 'module', name: 'Module1' }],
  commands: () => [{ id: 'run', name: 'Run the current query', shortcut: 'Ctrl/Cmd+Enter', enabled: true, reason: null }, { id: 'print', name: 'Print preview', shortcut: null, enabled: false, reason: 'Open a workbook first.' }],
  procedures: () => [{ name: 'Workbook_Open', module: 'ThisWorkbook', line: 3 }, { name: 'Main', module: 'Module1', line: 10 }],
  steps: () => [{ name: 'Source', line: 2 }, { name: 'Changed Type', line: 3 }]
};

test('T-WB-13: the palette searches items first and commands only when something is typed', () => {
  assert.deepEqual(paletteEntries('', source).map((e) => e.text), ['Sales_Clean', 'Discount', 'Module1']);
  const sc = paletteEntries('sc', source);
  assert.equal(sc[0].text, 'Sales_Clean');
  assert.equal(sc[0].group, S.palette.group.queries);
  const run = paletteEntries('run', source);
  assert.ok(run.some((e) => e.kind === 'command' && e.command.id === 'run'));
});

test('T-WB-13: prefixes switch the list: > commands, @ procedures, # steps, : line', () => {
  assert.deepEqual(paletteEntries('>', source).map((e) => e.kind), ['command', 'command']);
  assert.equal(paletteEntries('>print', source)[0].disabled, 'Open a workbook first.');
  assert.equal(paletteEntries('>run', source)[0].disabled, null);
  const proc = paletteEntries('@workbook_open', source);
  assert.deepEqual(proc.map((e) => [e.kind, e.procedure.module, e.procedure.line]), [['procedure', 'ThisWorkbook', 3]]);
  assert.deepEqual(paletteEntries('#type', source).map((e) => e.step.name), ['Changed Type']);
  assert.deepEqual(paletteEntries(':42', source).map((e) => [e.kind, e.line]), [['line', 42]]);
  assert.deepEqual(paletteEntries(':abc', source), []);
  assert.deepEqual(paletteEntries(':0', source), []);
});
