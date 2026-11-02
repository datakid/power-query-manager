import { h, clear, placeBelow, onOutside } from './dom.js';
import { S, errorMessage } from './strings.js';
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
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
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

export function bindingDialog(kind, key) {
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
      h('p', { class: 'code-text' }, key),
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
