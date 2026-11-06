import { h, clear, placeBelow, onOutside } from './dom.js';
import { S, errorMessage } from './strings.js';
import { diffLines, diffStats, hunkLines } from '../core/diff.js';
import { supportedCultures } from '../core/m/culture.js';

const layers = [];

function openLayer(anchor, el, close) {
  const layer = { el, close };
  layers.push(layer);
  if (anchor && anchor.hasAttribute('aria-haspopup')) anchor.setAttribute('aria-expanded', 'true');
  return layer;
}

function closeLayer(layer, anchor, afterPointer) {
  const at = layers.indexOf(layer);
  if (at >= 0) layers.splice(at, 1);
  const active = document.activeElement;
  const lost = !active || active === document.body || layer.el.contains(active);
  layer.el.remove();
  if (anchor && anchor.hasAttribute('aria-haspopup')) anchor.setAttribute('aria-expanded', 'false');
  if (!anchor) return;
  if (afterPointer) {
    setTimeout(() => {
      const now = document.activeElement;
      if ((!now || now === document.body) && anchor.isConnected) anchor.focus();
    }, 0);
  } else if (lost && anchor.isConnected) anchor.focus();
}

const isTop = (layer) => layers[layers.length - 1] === layer;

export function openDialog(dialog) {
  const opener = document.activeElement;
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    const now = document.activeElement;
    if (opener && opener.isConnected && opener !== document.body && (!now || now === document.body)) opener.focus();
  });
  dialog.showModal();
  return dialog;
}

export function settingsDialog(settings, onChange) {
  const theme = h('select', { id: 'set-theme' }, ...[['system', S.themeSystem], ['light', S.themeLight], ['dark', S.themeDark]].map(([v, l]) => h('option', { value: v, selected: settings.theme === v }, l)));
  const culture = h('select', { id: 'set-culture' }, ...supportedCultures().map((c) => h('option', { value: c, selected: settings.culture === c }, c)));
  const timeout = h('input', { id: 'set-timeout', type: 'number', min: '1', max: '300', value: String(settings.timeoutS) });
  const rows = h('input', { id: 'set-rows', type: 'number', min: '1000', max: '5000000', step: '1000', value: String(settings.rowCap) });
  const guard = h('input', { id: 'set-guard', type: 'checkbox', checked: settings.csvGuard });
  const upstream = h('input', { id: 'set-upstream', type: 'checkbox', checked: settings.useUpstream });
  const dlg = h(
    'dialog',
    { 'aria-labelledby': 'set-title' },
    h('h2', { id: 'set-title' }, S.settings),
    h('div', { class: 'form-grid' },
      h('label', { for: 'set-theme' }, S.themeLabel), theme,
      h('label', { for: 'set-culture' }, S.cultureLabel), culture,
      h('label', { for: 'set-timeout' }, S.timeoutLabel), timeout,
      h('label', { for: 'set-rows' }, S.rowCapLabel), rows,
      h('label', { class: 'check', for: 'set-guard' }, guard, S.csvGuardLabel), h('span'),
      h('label', { class: 'check', for: 'set-upstream' }, upstream, S.upstreamLabel), h('span')),
    h('p', { class: 'item-meta' }, S.settingsNote),
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
      const t = Math.max(1, Math.min(300, Number(timeout.value) || 30));
      const r = Math.max(1000, Math.min(5000000, Number(rows.value) || 1000000));
      onChange({ theme: theme.value, culture: culture.value, timeoutS: t, rowCap: r, csvGuard: guard.checked, useUpstream: upstream.checked });
      dlg.close();
    } }, S.save), h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, S.close))
  );
  return openDialog(dlg);
}

export function shortcutsDialog() {
  const dlg = h(
    'dialog',
    { 'aria-labelledby': 'sc-title' },
    h('h2', { id: 'sc-title' }, S.shortcuts),
    h('dl', { class: 'kbd-list' }, ...S.shortcutRows.flatMap(([k, d]) => [h('dt', null, k), h('dd', null, d)])),
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, S.close))
  );
  return openDialog(dlg);
}

export function detailsDialog(rows) {
  const dlg = h(
    'dialog',
    { 'aria-labelledby': 'dt-title' },
    h('h2', { id: 'dt-title' }, S.details),
    h('dl', { class: 'kbd-list' }, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, S.close))
  );
  return openDialog(dlg);
}

export function bindingDialog(kind, key, queryName) {
  return new Promise((resolve) => {
    let chosen = null;
    const input = h('input', { type: 'file', class: 'sr-only', id: 'bind-file', tabindex: '-1' });
    input.addEventListener('change', () => {
      chosen = input.files && input.files[0] ? input.files[0] : null;
      dlg.close();
    });
    const dlg = h(
      'dialog',
      { 'aria-labelledby': 'bind-title' },
      h('h2', { id: 'bind-title' }, kind === 'web' ? S.bindingTitleWeb : S.bindingTitleFile),
      h('p', null, S.bindingWants(queryName, kind === 'web' ? 'Web.Contents' : 'File.Contents', key)),
      kind === 'web' ? h('p', { class: 'item-meta' }, S.bindingWebNote) : null,
      input,
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => input.click() }, S.bindingChoose),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, S.skip))
    );
    dlg.addEventListener('close', () => resolve(chosen));
    openDialog(dlg);
  });
}

export function menu(anchor, entries, onClose) {
  const el = h('div', { class: 'menu', role: 'menu' });
  for (const e of entries) {
    if (e.label && e.heading) el.append(h('div', { class: 'menu-label', role: 'presentation' }, e.label));
    else if (e.check !== undefined) {
      let on = e.check;
      const mark = h('span', { 'aria-hidden': 'true' }, on ? '✓' : ' ');
      const btn = h('button', { class: 'menu-item', type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(on) }, mark, e.label);
      btn.addEventListener('click', () => {
        on = !on;
        btn.setAttribute('aria-checked', String(on));
        mark.textContent = on ? '✓' : ' ';
        e.onToggle(on);
      });
      el.append(btn);
    } else el.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', disabled: e.disabled ? true : null, onclick: () => {
      close();
      e.run();
    } }, e.label));
  }
  placeBelow(el, anchor, 'right');
  const layer = openLayer(anchor, el, () => close());
  const off = onOutside(el, () => close(true));
  const key = (ev) => {
    if (!isTop(layer)) return;
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Home' || ev.key === 'End') {
      const items = [...el.querySelectorAll('button:not([disabled]), input')];
      const i = items.indexOf(document.activeElement);
      const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
      const next = ev.key === 'Home' ? items[0] : ev.key === 'End' ? items[items.length - 1] : items[(i + step + items.length) % items.length];
      if (next) next.focus();
      ev.preventDefault();
    }
  };
  document.addEventListener('keydown', key, true);
  function close(afterPointer) {
    off();
    document.removeEventListener('keydown', key, true);
    closeLayer(layer, anchor, afterPointer === true);
    if (onClose) onClose();
  }
  const first = el.querySelector('button:not([disabled]), input');
  if (first) first.focus();
  return { el, close };
}

export function popover(anchor, content, onClose, label) {
  const el = h('div', { class: 'popover', role: 'dialog', 'aria-label': label }, content);
  placeBelow(el, anchor, 'right');
  const layer = openLayer(anchor, el, () => close());
  const off = onOutside(el, () => close(true));
  const key = (ev) => {
    if (!isTop(layer)) return;
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', key, true);
  function close(afterPointer) {
    off();
    document.removeEventListener('keydown', key, true);
    closeLayer(layer, anchor, afterPointer === true);
    if (onClose) onClose();
  }
  return { el, close };
}

export { clear, errorMessage };

export function confirmDialog({ title, body, confirmLabel, cancelLabel }) {
  return new Promise((resolve) => {
    let ok = false;
    const dlg = h(
      'dialog',
      { 'aria-labelledby': 'cf-title' },
      h('h2', { id: 'cf-title' }, title),
      h('p', null, body),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, cancelLabel || S.cancel),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
          ok = true;
          dlg.close();
        } }, confirmLabel))
    );
    dlg.addEventListener('close', () => resolve(ok));
    openDialog(dlg);
  });
}

function diffTable(name, before, after) {
  const rows = hunkLines(diffLines(before, after), 3);
  const glyph = { add: '+', del: '−', same: ' ' };
  const label = { add: S.diffAdded, del: S.diffRemoved, same: S.diffContext };
  return h('div', { class: 'diff-scroll' },
    h('table', { class: 'diff' },
      h('caption', { class: 'sr-only' }, S.diffCaption(name)),
      h('thead', { class: 'sr-only' }, h('tr', null, h('th', null, S.diffOld), h('th', null, S.diffNew), h('th', null, ''), h('th', null, ''))),
      h('tbody', null, ...rows.map((r) => (r.kind === 'gap'
        ? h('tr', { class: 'diff-gap' }, h('td', { colspan: '4' }, S.diffGap(r.hidden)))
        : h('tr', { class: `diff-${r.kind}` },
          h('td', { class: 'diff-no' }, r.a === undefined ? '' : String(r.a)),
          h('td', { class: 'diff-no' }, r.b === undefined ? '' : String(r.b)),
          h('td', { class: 'diff-mark', 'aria-label': label[r.kind] }, glyph[r.kind]),
          h('td', { class: 'diff-text' }, r.text || ' ')))))));
}

export function changesDialog(changes, { onRevertAll }) {
  const entries = [
    ...[...changes.queries].map(([name, c]) => ({ kind: S.changesQueryKind, name, ...c })),
    ...[...changes.modules].map(([name, c]) => ({ kind: S.changesModuleKind, name, ...c }))
  ];
  const sections = entries.map((e) => {
    const stats = diffStats(diffLines(e.original, e.current));
    const det = h('details', { class: 'change-item' },
      h('summary', null,
        h('span', { class: 'change-name' }, e.name),
        h('span', { class: 'item-meta' }, e.kind),
        h('span', { class: 'change-stats item-meta' }, S.changeStats(stats.added, stats.removed))));
    det.addEventListener('toggle', () => {
      if (det.open && !det.querySelector('.diff-scroll')) det.append(diffTable(e.name, e.original, e.current));
    });
    return det;
  });
  const dlg = h(
    'dialog',
    { class: 'wide', 'aria-labelledby': 'ch-title' },
    h('h2', { id: 'ch-title' }, S.changesTitle),
    h('div', { class: 'change-list' }, ...sections),
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => {
        dlg.close();
        onRevertAll();
      } }, S.revertAll),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => dlg.close() }, S.close))
  );
  return openDialog(dlg);
}

export function differencesDialog({ rows, total, caption }) {
  const dlg = h(
    'dialog',
    { class: 'wide', 'aria-labelledby': 'df-title' },
    h('h2', { id: 'df-title' }, S.differencesTitle),
    h('p', { class: 'item-meta' }, S.differencesIntro),
    h('div', { class: 'diff-scroll' },
      h('table', { class: 'diff diff-values' },
        h('caption', { class: 'sr-only' }, caption),
        h('thead', null, h('tr', null, ...S.differenceColumns.map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', null, ...rows.map((r) => h('tr', null,
          h('td', { class: 'diff-no' }, String(r.row)),
          h('td', null, r.column),
          h('td', { class: 'diff-text' }, r.excel),
          h('td', { class: 'diff-text' }, r.quoin, r.typeOnly ? h('span', { class: 'item-meta' }, ` · ${S.differenceTypeOnly}`) : null)))))),
    total > rows.length ? h('p', { class: 'item-meta' }, S.differencesShown(rows.length, total)) : null,
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => dlg.close() }, S.close))
  );
  return openDialog(dlg);
}
