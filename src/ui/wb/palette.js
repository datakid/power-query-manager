import { h, clear } from '../dom.js';
import { S } from '../strings.js';
import { rank } from '../../core/wb/fuzzy.js';
import { openDialog } from '../dialogs.js';

const LIMIT = 60;

function marked(text, ranges) {
  if (!ranges || !ranges.length) return [text];
  const out = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) out.push(text.slice(at, s));
    out.push(h('mark', null, text.slice(s, e)));
    at = e;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function modeOf(raw) {
  const c = raw[0];
  if (c === '>') return { mode: 'commands', query: raw.slice(1).trim() };
  if (c === '@') return { mode: 'procedures', query: raw.slice(1).trim() };
  if (c === '#') return { mode: 'steps', query: raw.slice(1).trim() };
  if (c === ':') return { mode: 'lines', query: raw.slice(1).trim() };
  return { mode: 'all', query: raw.trim() };
}

export function paletteEntries(raw, source) {
  const { mode, query } = modeOf(raw);
  const G = S.palette.group;
  const pick = (list, key, group, make) => rank(query, list, key, LIMIT).map((r) => ({ group, text: key(r.item), ranges: query ? r.ranges : [], ...make(r.item) }));
  if (mode === 'commands') return pick(source.commands(), (c) => c.name, G.commands, (c) => ({ kind: 'command', command: c, hint: c.shortcut, disabled: c.enabled ? null : c.reason || '' }));
  if (mode === 'procedures') return pick(source.procedures(), (p) => p.name, G.procedures, (p) => ({ kind: 'procedure', procedure: p, hint: p.module }));
  if (mode === 'steps') return pick(source.steps(), (st) => st.name, G.steps, (st) => ({ kind: 'step', step: st, hint: st.line ? `${st.line}` : '' }));
  if (mode === 'lines') {
    const n = Number(query);
    if (!Number.isInteger(n) || n < 1) return [];
    return [{ group: G.lines, text: `${G.lines} ${n}`, ranges: [], kind: 'line', line: n }];
  }
  const items = source.items();
  const found = pick(items, (i) => i.name, null, (i) => ({ kind: 'item', item: i, group: i.type === 'query' ? G.queries : G.modules, hint: null }));
  const cmds = query ? pick(source.commands(), (c) => c.name, G.commands, (c) => ({ kind: 'command', command: c, hint: c.shortcut, disabled: c.enabled ? null : c.reason || '' })) : [];
  const out = [...found, ...cmds];
  return out.length > LIMIT ? out.slice(0, LIMIT) : out;
}

export function openPalette(source, handlers) {
  let entries = [];
  let active = 0;
  const id = `pal-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', { type: 'text', class: 'palette-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': `${id}-list`, 'aria-autocomplete': 'list', 'aria-label': S.palette.label, placeholder: S.palette.placeholder, autocomplete: 'off', spellcheck: 'false' });
  const list = h('ul', { class: 'palette-list', role: 'listbox', id: `${id}-list`, 'aria-label': S.palette.label });
  const status = h('div', { class: 'palette-status item-meta', role: 'status', 'aria-live': 'polite' }, S.palette.hint);
  const dlg = h('dialog', { class: 'palette', 'aria-label': S.palette.label }, input, list, status);

  const optionId = (i) => `${id}-o${i}`;

  const run = (i) => {
    const e = entries[i];
    if (!e) return;
    if (e.disabled !== undefined && e.disabled !== null) {
      status.textContent = S.palette.disabled(e.disabled || e.text);
      return;
    }
    dlg.close();
    setTimeout(() => {
      if (e.kind === 'item') handlers.onItem(e.item);
      else if (e.kind === 'command') handlers.onCommand(e.command);
      else if (e.kind === 'procedure') handlers.onProcedure(e.procedure);
      else if (e.kind === 'step') handlers.onStep(e.step);
      else if (e.kind === 'line') handlers.onLine(e.line);
    }, 0);
  };

  const paint = () => {
    clear(list);
    let last = null;
    entries.forEach((e, i) => {
      if (e.group && e.group !== last) {
        list.append(h('li', { role: 'presentation', class: 'palette-group' }, e.group));
        last = e.group;
      }
      const row = h('li', { role: 'option', id: optionId(i), class: `palette-row${i === active ? ' is-active' : ''}`, 'aria-selected': String(i === active), 'aria-disabled': e.disabled !== undefined && e.disabled !== null ? 'true' : null, onclick: () => run(i) },
        h('span', { class: 'palette-text' }, ...marked(e.text, e.ranges)),
        e.hint ? h('span', { class: 'palette-hint item-meta' }, e.hint) : null,
        e.disabled ? h('span', { class: 'palette-why item-meta' }, e.disabled) : null);
      row.addEventListener('mousemove', () => {
        if (active !== i) {
          active = i;
          mark();
        }
      });
      list.append(row);
    });
    if (!entries.length) list.append(h('li', { role: 'presentation', class: 'palette-empty item-meta' }, S.palette.empty));
    input.setAttribute('aria-activedescendant', entries.length ? optionId(active) : '');
    status.textContent = input.value ? (entries.length ? S.palette.count(entries.length) : S.palette.empty) : S.palette.hint;
  };

  const mark = () => {
    list.querySelectorAll('.palette-row').forEach((row) => {
      const on = row.id === optionId(active);
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-selected', String(on));
      if (on) row.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', entries.length ? optionId(active) : '');
  };

  const refresh = () => {
    entries = paletteEntries(input.value, source);
    active = 0;
    paint();
  };

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (entries.length) {
        active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
        mark();
      }
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      run(active);
    }
  });
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg) dlg.close();
  });
  openDialog(dlg);
  if (handlers.initial) input.value = handlers.initial;
  refresh();
  input.focus();
  return dlg;
}
