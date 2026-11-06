import { h, clear } from './dom.js';
import { S } from './strings.js';
import { formatsFor } from './formats.js';
import { buildPlan, renderPlan, DEFAULT_PRINT } from './print-render.js';
import { confirmDialog } from './dialogs.js';
import { DEFAULT_LIMITS } from '../core/limits.js';
import { pageGeometry } from '../core/print/layout.js';

const CHUNK = 5000;
const ROWS_PER_PAGE_GUESS = 45;
const fileNameOf = (app) => (app.session.wb && app.session.wb.fileName) || '';

export function seedSettings(prev, columnCount) {
  const s = { ...DEFAULT_PRINT, ...(prev || {}) };
  if (!prev) s.orientation = columnCount > 8 ? 'landscape' : 'portrait';
  return s;
}

async function loadAllRows(runner, table, onProgress) {
  if (table.rows.length >= table.rowCount) return table.rows;
  const rows = table.rows.slice();
  while (rows.length < table.rowCount) {
    onProgress(rows.length, table.rowCount);
    const got = await runner.rows(rows.length, Math.min(CHUNK, table.rowCount - rows.length));
    if (!got.length) break;
    rows.push(...got);
  }
  return rows;
}

export async function collectPrintData(app) {
  const ws = app.ws;
  const s = app.session;
  const item = ws.item;
  const data = { table: null, code: [], changes: s.changes(), refused: 0, itemName: item ? item.name : '' };
  if (item) {
    data.code.push({ name: item.name, text: s.textOf(item), language: item.type === 'query' ? 'm' : 'vba' });
  }
  const value = ws.hasTableResult ? ws.lastResult.result.value : null;
  if (value && ws.item && ws.item.type === 'query') data.table = { columns: value.columns, rowCount: value.rowCount, rows: value.rows || [], remote: true };
  return data;
}

export function openPrintPreview(app, trigger) {
  const host = document.getElementById('app') || document.body;
  return collectPrintData(app).then(async (data) => {
    if (data.table && data.table.rowCount > DEFAULT_LIMITS.printRowRefuse) {
      data.refused = data.table.rowCount;
      data.table = null;
    }
    if (data.table && data.table.rowCount > DEFAULT_LIMITS.printRowLimit) {
      const f = formatsFor(app.settings.culture);
      const go = await confirmDialog({
        title: S.printConfirmTitle,
        body: S.printConfirmBody(f.integer.format(data.table.rowCount), f.integer.format(Math.ceil(data.table.rowCount / ROWS_PER_PAGE_GUESS))),
        confirmLabel: S.printConfirmGo
      });
      if (!go) return null;
    }
    const prev = app.printSettings;
    const settings = seedSettings(prev, data.table ? data.table.columns.length : 0);
    if (!prev) settings.what = data.table ? 'result' : 'code';
    if (!data.table && (settings.what === 'result' || settings.what === 'both')) settings.what = 'code';
    if (data.table && !settings.columns) settings.columns = null;
    app.printSettings = settings;
    const fmt = formatsFor(app.settings.culture);
    const context = { fileName: fileNameOf(app), itemName: data.itemName, date: new Date().toLocaleDateString(app.settings.culture) };
    const view = buildView({ app, data, settings, fmt, context, trigger, host });
    await view.start();
    return view;
  });
}

function numberField(id, label, value, min, max, onInput) {
  const input = h('input', { id, type: 'number', min: String(min), max: String(max), value: String(value) });
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (Number.isFinite(n) && n >= min && n <= max) onInput(Math.floor(n));
  });
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

function selectField(id, label, options, value, onChange) {
  const sel = h('select', { id }, ...options.map(([v, text]) => h('option', { value: v, selected: v === value ? true : null }, text)));
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'field' }, h('label', { for: id }, label), sel);
}

function checkField(id, label, checked, onChange) {
  const box = h('input', { id, type: 'checkbox', checked: checked ? true : null });
  box.addEventListener('change', () => onChange(box.checked));
  return h('label', { for: id }, box, label);
}

function buildView({ app, data, settings, fmt, context, trigger, host }) {
  let signal = { cancelled: false };
  let rendering = Promise.resolve();
  let tableData = null;
  let loaded = false;
  const stack = h('div', { class: 'print-stack', role: 'document' });
  const scroll = h('div', { class: 'print-scroll' }, stack);
  const summary = h('p', { class: 'print-summary', id: 'print-summary', 'aria-live': 'polite' });
  const notes = h('ul', { class: 'print-notes' });
  const live = h('div', { class: 'sr-only', role: 'status' });
  const root = h('div', { class: 'print-root', role: 'region', 'aria-label': S.printPreviewAria });
  const panel = h('form', { class: 'print-panel', 'aria-label': S.printSettings });
  panel.addEventListener('submit', (ev) => ev.preventDefault());
  root.append(scroll, panel, live);

  const hasTable = !!data.table;
  const columnNames = hasTable ? data.table.columns.map((c) => c.name) : [];

  const whatOptions = [['code', S.printWhatCode], ['changes', S.printWhatChanges]];
  if (hasTable) whatOptions.unshift(['result', S.printWhatResult]);
  if (hasTable) whatOptions.splice(2, 0, ['both', S.printWhatBoth]);

  const sync = () => {
    app.printSettings = settings;
    schedule();
  };

  const rowsInput = h('input', { id: 'pp-rows', type: 'number', min: '1', max: '1000', value: settings.rowsPerPage ? String(settings.rowsPerPage) : '', placeholder: S.printFit });
  rowsInput.addEventListener('input', () => {
    const n = Number(rowsInput.value);
    settings.rowsPerPage = rowsInput.value === '' ? null : Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
    sync();
  });

  const colChecks = columnNames.map((name, i) => {
    const box = h('input', { type: 'checkbox', id: `pp-col-${i}`, checked: !settings.columns || settings.columns.includes(i) ? true : null });
    box.addEventListener('change', () => {
      const set = new Set(settings.columns || columnNames.map((_, k) => k));
      if (box.checked) set.add(i);
      else set.delete(i);
      settings.columns = [...set].sort((a, b) => a - b);
      sync();
    });
    return h('label', { for: `pp-col-${i}` }, box, name);
  });

  panel.append(
    h('fieldset', null, h('legend', null, S.printWhat), ...whatOptions.map(([v, text]) => {
      const r = h('input', { type: 'radio', name: 'pp-what', id: `pp-what-${v}`, value: v, checked: settings.what === v ? true : null });
      r.addEventListener('change', () => {
        settings.what = v;
        sync();
      });
      return h('label', { for: `pp-what-${v}` }, r, text);
    })),
    h('fieldset', null, h('legend', null, S.printPaper),
      selectField('pp-paper', S.printPaper, Object.entries(S.paperNames), settings.paper, (v) => { settings.paper = v; sync(); }),
      selectField('pp-orient', S.printOrientation, [['portrait', S.orientationPortrait], ['landscape', S.orientationLandscape]], settings.orientation, (v) => { settings.orientation = v; sync(); }),
      selectField('pp-margins', S.printMargins, Object.entries(S.marginNames), settings.margins, (v) => { settings.margins = v; sync(); })),
    h('fieldset', null, h('legend', null, S.printRowsPerPage), h('div', { class: 'field' }, h('label', { for: 'pp-rows' }, S.printRowsPerPage), rowsInput),
      numberField('pp-scale', S.printScale, settings.scale, 60, 140, (n) => { settings.scale = n; sync(); })),
    h('fieldset', null, h('legend', null, S.printRepeat),
      checkField('pp-rep-head', S.printRepeatHeader, settings.repeatHeader, (v) => { settings.repeatHeader = v; sync(); }),
      numberField('pp-rep-top', S.printRepeatTop, settings.repeatTop, 0, 5, (n) => { settings.repeatTop = n; sync(); }),
      numberField('pp-rep-bottom', S.printRepeatBottom, settings.repeatBottom, 0, 5, (n) => { settings.repeatBottom = n; sync(); })),
    hasTable ? h('fieldset', null, h('legend', null, S.printColumns), h('div', { class: 'print-columns' }, ...colChecks),
      numberField('pp-sticky', S.printSticky, settings.sticky, 0, Math.max(0, columnNames.length), (n) => { settings.sticky = n; sync(); })) : null,
    h('fieldset', null, h('legend', null, S.printHeadFoot),
      checkField('pp-head', S.printHead, settings.head, (v) => { settings.head = v; sync(); }),
      checkField('pp-foot', S.printFoot, settings.foot, (v) => { settings.foot = v; sync(); })),
    notes,
    h('div', { class: 'print-bar' },
      summary,
      h('div', { class: 'print-actions' },
        h('button', { class: 'btn', type: 'button', id: 'pp-close', onclick: () => close() }, S.close),
        h('button', { class: 'btn btn-primary', type: 'button', id: 'pp-print', onclick: () => print() }, S.printNow)))
  );

  const staticNotes = [S.printNoteColours, S.printNoteDialog, S.printNotePages, S.printNoteBrowser];

  const updateZoom = () => {
    const geo = pageGeometry(settings);
    const px = geo.width * 0.37795;
    const room = scroll.clientWidth - 40;
    root.style.setProperty('--preview-zoom', String(room > 0 ? Math.min(1, room / px).toFixed(3) : 1));
  };

  const run = async () => {
    signal.cancelled = true;
    signal = { cancelled: false };
    const mine = signal;
    root.className = `print-root p-${settings.paper}-${settings.orientation}`;
    updateZoom();
    clear(stack);
    const needRows = settings.what === 'result' || settings.what === 'both';
    if (needRows && hasTable && !loaded) {
      live.textContent = S.printPreparing;
      const rows = await loadAllRows(app.ws.runner, data.table, (n, total) => { live.textContent = S.printLoadingRows(fmt.integer.format(n), fmt.integer.format(total)); });
      tableData = { columns: data.table.columns, rowCount: data.table.rowCount, rows };
      loaded = true;
      if (mine.cancelled) return;
    }
    const plan = buildPlan({ settings, data: { table: needRows ? tableData : null, code: data.code, changes: data.changes }, formats: fmt, context });
    const pages = plan.builders.length;
    const info = plan.info;
    const paper = S.paperNames[settings.paper];
    const orient = (settings.orientation === 'landscape' ? S.orientationLandscape : S.orientationPortrait).toLowerCase();
    summary.textContent = info.rowsPerPage && needRows ? S.printSummary(pages, paper, orient, info.rowsPerPage) : S.printSummaryNoRows(pages, paper, orient);
    clear(notes);
    for (const t of staticNotes) notes.append(h('li', null, t));
    for (const n of info.overflow) notes.append(h('li', null, S.printNoteOverflow(n)));
    if (info.tooSmall) notes.append(h('li', null, S.printNoteTooSmall));
    if (data.refused) notes.append(h('li', null, S.printRefused(fmt.integer.format(data.refused))));
    if (settings.what === 'changes' && data.changes.count === 0) notes.append(h('li', null, S.printChangesNone));
    if (!hasTable && (settings.what === 'result')) notes.append(h('li', null, S.printNoResult));
    live.textContent = '';
    const done = await renderPlan(plan, stack, mine);
    if (done && !mine.cancelled) live.textContent = S.printPageOf(pages, pages);
  };

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      rendering = run();
    }, 60);
  }

  async function print() {
    clearTimeout(timer);
    await run();
    window.print();
  }

  function close() {
    signal.cancelled = true;
    clearTimeout(timer);
    window.removeEventListener('resize', updateZoom);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    for (const el of [...host.children]) el.removeAttribute('inert');
    app.printView = null;
    if (trigger && trigger.isConnected) trigger.focus();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      ev.preventDefault();
      close();
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      ev.stopPropagation();
      print();
    }
  }

  return {
    root,
    close,
    async start() {
      for (const el of [...host.children]) el.setAttribute('inert', '');
      document.body.append(root);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', updateZoom);
      app.printView = { close, root };
      await run();
      panel.querySelector('select, input').focus();
      return rendering;
    }
  };
}

export function printWithoutPreview(app) {
  const data = { table: null, code: [], changes: app.session.changes() };
  const ws = app.ws;
  if (!ws || !ws.item) return null;
  data.code.push({ name: ws.item.name, text: app.session.textOf(ws.item), language: ws.item.type === 'query' ? 'm' : 'vba' });
  const value = ws.hasTableResult ? ws.lastResult.result.value : null;
  if (value && value.rows && value.rows.length >= value.rowCount && value.rowCount <= DEFAULT_LIMITS.printRowLimit) data.table = { columns: value.columns, rowCount: value.rowCount, rows: value.rows };
  const settings = seedSettings(app.printSettings, data.table ? data.table.columns.length : 0);
  settings.what = data.table ? 'result' : 'code';
  const plan = buildPlan({ settings, data, formats: formatsFor(app.settings.culture), context: { fileName: fileNameOf(app), itemName: ws.item.name, date: new Date().toLocaleDateString(app.settings.culture) } });
  const root = h('div', { class: `print-root print-temp p-${settings.paper}-${settings.orientation}` }, h('div', { class: 'print-scroll' }));
  const stack = h('div', { class: 'print-stack' });
  root.firstChild.append(stack);
  plan.builders.forEach((b, i) => stack.append(b(i + 1, plan.builders.length)));
  return root;
}

