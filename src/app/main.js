import { h, clear } from '../ui/dom.js';
import { S, errorMessage, fmt } from '../ui/strings.js';
import { formatsFor } from '../ui/formats.js';
import { markImg, syncMarks, watchMarks } from '../ui/mark.js';
import { settingsDialog, shortcutsDialog, detailsDialog, menu, popover } from '../ui/dialogs.js';
import { Session } from './session.js';
import { Workspace } from './workspace.js';
import { queryFile, moduleFile, zipFiles, sanitizeFileName } from '../core/export/files.js';
import { QuoinError } from '../core/errors.js';

const DEFAULTS = { theme: 'system', culture: 'en-US', timeoutS: 30, rowCap: 1000000, csvGuard: true, useUpstream: false };

function loadTheme() {
  try {
    const t = window.localStorage.getItem('quoin.theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  syncMarks();
  try {
    if (t === 'system') window.localStorage.removeItem('quoin.theme');
    else window.localStorage.setItem('quoin.theme', t);
  } catch {
    return;
  }
}

function saveBytes(bytes, name, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const STATUS_INTERVAL_MS = 500;
const OPENABLE_NAME = /\.(xlsx|xlsm|xltx|xltm|xls|xlsb|ods)$/i;

class Status {
  constructor(el, alertEl) {
    this.el = el;
    this.alertEl = alertEl;
    this.state = { run: null, compare: null, culture: 'en-US', note: '', edits: 0, flags: [], counts: '', alertText: '' };
    this.sig = null;
    this.lastAt = -Infinity;
    this.timer = null;
    this.zw = false;
    this.flush();
  }

  set(partial) {
    if (partial.note && partial.note === this.state.note) this.zw = !this.zw;
    Object.assign(this.state, partial);
    this.schedule();
  }

  describe() {
    const st = this.state;
    const f = formatsFor(st.culture);
    const bits = [];
    let alert = st.alertText || '';
    if (st.run) {
      if (st.run.cancelled) bits.push(S.cancelled);
      else if (st.run.fn) bits.push(S.functionStatus);
      else if (st.run.error) alert = alert || S.errorStatus(st.run.error);
      else if (st.run.rows !== undefined) bits.push(S.runStatus(st.run.rows, st.run.secs, f.integer.format(st.run.rows)));
      else bits.push(S.valueStatus(st.run.secs));
    }
    const items = [{ text: [st.counts, ...bits].filter(Boolean).join(' · ') || ' ' }];
    const c = st.compare;
    if (c) {
      if (c.disabled) items.push({ text: ` · ${c.disabled === 'time' ? S.compareTime : S.compareRandom}` });
      else if (c.reason === 'columns') items.push({ text: ` · ${S.compareColumns}` });
      else if (c.matches) items.push({ text: ` · ${S.matchesCache}`, dot: 'ok' });
      else items.push({ text: ` · ${c.reason === 'rows' ? S.rowCountDiffers(f.integer.format(c.got), f.integer.format(c.expected)) : S.cellsDiffer(f.integer.format(c.count))}`, dot: 'diff' });
    }
    if (st.flags && st.flags.includes('non-deterministic')) items.push({ text: ` · ${S.nonDeterministic}` });
    if (st.note) items.push({ text: ` · ${st.note}${this.zw ? '\u200b' : ''}` });
    items.push({ spacer: true });
    if (st.edits) items.push({ text: S.itemsEdited(st.edits) });
    if (st.culture && st.culture !== 'en-US') items.push({ text: ` · ${st.culture}` });
    return { items, alert };
  }

  schedule() {
    const { items, alert } = this.describe();
    if (alert !== this.alertEl.textContent) this.alertEl.textContent = alert;
    if (JSON.stringify(items) === this.sig) return;
    const wait = STATUS_INTERVAL_MS - (performance.now() - this.lastAt);
    if (wait <= 0) this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, wait);
    }
  }

  flush() {
    const { items, alert } = this.describe();
    if (alert !== this.alertEl.textContent) this.alertEl.textContent = alert;
    const sig = JSON.stringify(items);
    if (sig === this.sig) return;
    this.sig = sig;
    this.lastAt = performance.now();
    clear(this.el);
    for (const it of items) {
      if (it.spacer) this.el.append(h('span', { class: 'spacer' }));
      else if (it.dot) this.el.append(h('span', { class: `chip ${it.dot}` }, h('span', { class: `status-dot ${it.dot}` }), it.text.replace(/^ · /, '')));
      else this.el.append(h('span', null, it.text));
    }
  }
}

export class App {
  constructor(root) {
    this.root = root;
    this.settings = { ...DEFAULTS, theme: loadTheme() };
    this.faultInject = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('selfcheck') === 'fail';
    this.session = new Session();
    this.build();
    this.bindGlobal();
  }

  build() {
    this.fileHead = h('span', { class: 'fn-head' });
    this.fileTail = h('span', { class: 'fn-tail' });
    this.fileBtn = h('button', { class: 'file-name', type: 'button', hidden: true, onclick: () => this.showDetails() }, this.fileHead, this.fileTail);
    this.fileMeta = h('span', { class: 'file-meta item-meta', hidden: true });
    this.exportBtn = h('button', { class: 'btn', type: 'button', hidden: true, 'aria-haspopup': 'menu', 'aria-expanded': false, onclick: () => this.openExport() }, S.export);
    this.settingsBtn = h('button', { class: 'btn btn-quiet', type: 'button', 'aria-label': S.settings, title: S.settings, onclick: () => this.openSettings() }, '⚙');
    this.downloadCount = h('span', { class: 'dl-count' });
    this.downloadBtn = h('button', { class: 'btn', type: 'button', hidden: true, 'aria-haspopup': 'dialog', 'aria-expanded': false, 'aria-disabled': true, title: S.downloadNone, onclick: () => this.openDownload() }, S.download, this.downloadCount);
    this.topbar = h('header', { class: 'topbar' },
      h('h1', { class: 'brand' }, markImg('brand-mark', 28), h('span', { class: 'wordmark' }, S.appName)),
      this.fileBtn, this.fileMeta, h('span', { class: 'spacer' }), this.exportBtn, this.settingsBtn, this.downloadBtn);
    this.input = h('input', { type: 'file', class: 'sr-only', accept: '.xlsx,.xlsm,.xltx,.xltm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tabindex: '-1', 'aria-label': S.chooseFile });
    this.input.addEventListener('change', () => {
      if (this.input.files && this.input.files[0]) this.openFile(this.input.files[0]);
      this.input.value = '';
    });
    this.mainEl = h('main', { class: 'content' });
    this.mainEl.style.minHeight = '0';
    this.mainEl.style.display = 'grid';
    this.statusEl = h('div', { class: 'status-main', id: 'status', role: 'status', 'aria-live': 'polite' });
    this.alertEl = h('div', { class: 'status-alert', id: 'alert', role: 'alert' });
    this.barEl = h('div', { class: 'statusbar' }, this.statusEl, this.alertEl);
    this.status = new Status(this.statusEl, this.alertEl);
    this.root.append(this.input, this.topbar, this.mainEl, this.barEl);
    this.root.classList.add('app');
    this.showEmpty();
  }

  showEmpty(message) {
    clear(this.mainEl);
    this.ws = null;
    this.fileBtn.hidden = true;
    this.fileMeta.hidden = true;
    this.exportBtn.hidden = true;
    this.downloadBtn.hidden = true;
    this.zone = h('div', { class: 'dropzone' }, h('p', { class: 'item-meta' }, S.emptyPrompt), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.input.click() }, S.chooseFile));
    this.mainEl.append(h('div', { class: 'empty' }, h('div', { class: 'empty-inner' },
      markImg('mark', 64),
      h('h2', null, S.tagline),
      message ? h('div', { class: 'message error', role: 'alert' }, message) : null,
      this.zone,
      h('p', { class: 'footnote' }, S.emptyFoot))));
  }

  bindGlobal() {
    this.dragDepth = 0;
    const setOver = (on) => {
      if (this.zone) this.zone.classList.toggle('is-over', on);
    };
    window.addEventListener('dragenter', (ev) => {
      ev.preventDefault();
      this.dragDepth++;
      setOver(true);
    });
    window.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      setOver(true);
    });
    window.addEventListener('dragleave', () => {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) setOver(false);
    });
    window.addEventListener('drop', (ev) => {
      ev.preventDefault();
      this.dragDepth = 0;
      setOver(false);
      this.handleDrop(ev.dataTransfer);
    });
    this.leaveGuard = (ev) => {
      ev.preventDefault();
      ev.returnValue = S.unsavedLeave;
    };
    this.guarding = false;
    window.addEventListener('keydown', (ev) => this.onKey(ev));
  }

  refuse(text) {
    if (this.ws) this.status.set({ alertText: text });
    else this.showEmpty(text);
  }

  handleDrop(dt) {
    if (!dt) return;
    const files = [...(dt.files || [])];
    const items = [...(dt.items || [])];
    const folder = items.some((it) => it.kind === 'file' && typeof it.webkitGetAsEntry === 'function' && (it.webkitGetAsEntry() || {}).isDirectory);
    if (folder) this.refuse(S.dropFolder);
    else if (files.length > 1) this.refuse(S.dropOne);
    else if (files.length === 1) this.openFile(files[0]);
  }

  syncDownload() {
    const n = this.session.editCount;
    this.downloadBtn.setAttribute('aria-disabled', String(n === 0));
    if (n === 0) this.downloadBtn.setAttribute('title', S.downloadNone);
    else this.downloadBtn.removeAttribute('title');
    this.downloadCount.textContent = n === 0 ? '' : S.downloadCount(n);
  }

  syncLeaveGuard() {
    const dirty = this.session.editCount > 0;
    if (dirty === this.guarding) return;
    this.guarding = dirty;
    if (dirty) window.addEventListener('beforeunload', this.leaveGuard);
    else window.removeEventListener('beforeunload', this.leaveGuard);
  }

  onKey(ev) {
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (mod && key === 'o') {
      ev.preventDefault();
      this.input.click();
    } else if (mod && key === 'enter') {
      if (this.ws) {
        ev.preventDefault();
        this.ws.run();
      }
    } else if (mod && key === 's') {
      ev.preventDefault();
      if (this.ws) this.openDownload();
    } else if (mod && ev.shiftKey && key === 'e') {
      ev.preventDefault();
      if (this.ws) this.openExport();
    } else if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      if (this.ws) {
        ev.preventDefault();
        this.ws.step(ev.key === 'ArrowDown' ? 1 : -1);
      }
    } else if (ev.key === 'Escape') {
      if (this.ws && this.ws.cancel()) ev.preventDefault();
    } else if (ev.key === '?' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) {
      shortcutsDialog();
    }
  }

  async openFile(file) {
    if (!OPENABLE_NAME.test(file.name)) {
      this.refuse(S.dropType);
      return;
    }
    if (this.session.editCount > 0 && !window.confirm(S.unsavedLeave)) return;
    const next = new Session();
    this.status.set({ run: null, compare: null, note: '', edits: 0, counts: '', alertText: '' });
    try {
      await next.open(file);
    } catch (e) {
      const code = e instanceof QuoinError ? e.code : 'read';
      this.showEmpty(errorMessage(code));
      return;
    }
    this.session = next;
    this.settings = { ...this.settings };
    clear(this.mainEl);
    this.ws = new Workspace(this.mainEl, this.session, this.settings, this.status);
    this.ws.onEdit(() => {
      this.status.set({ edits: this.session.editCount });
      this.syncDownload();
      this.syncLeaveGuard();
    });
    this.syncDownload();
    this.syncLeaveGuard();
    const dot = file.name.lastIndexOf('.');
    const split = dot > 0 ? dot : file.name.length;
    this.fileHead.textContent = file.name.slice(0, split);
    this.fileTail.textContent = file.name.slice(split);
    this.fileBtn.hidden = false;
    this.fileMeta.textContent = S.fileMeta(file.size);
    this.fileMeta.hidden = false;
    this.exportBtn.hidden = false;
    this.downloadBtn.hidden = false;
    this.status.set({ counts: S.fileCounts(next.queries.length, next.modules.length) });
    this.ws.renderRail();
    this.ws.selectFirst();
    this.announceWarnings();
    document.title = S.titleWithApp(file.name);
  }

  announceWarnings() {
    const w = this.session.wb.warnings.map((x) => x.code);
    if (w.length) this.status.set({ note: `${S.noticePrefix}${[...new Set(w)].join(', ')}` });
  }

  showDetails() {
    const wb = this.session.wb;
    detailsDialog([
      [S.filePrefix, wb.fileName],
      [S.fileSize, S.sizeKb(this.session.size)],
      [S.fileFormat, wb.format],
      [S.fileSheets, String(wb.sheets.length)],
      [S.fileTables, String(wb.tables.length)],
      [S.fileQueries, String(wb.queries.length)],
      [S.fileModules, String(this.session.modules.length)]
    ]);
  }

  openSettings() {
    settingsDialog(this.settings, (next) => {
      Object.assign(this.settings, next);
      applyTheme(next.theme);
      this.status.set({ culture: next.culture });
      if (this.ws) {
        this.ws.settings = this.settings;
        this.ws.applyCulture();
      }
    });
  }

  openDownload() {
    const s = this.session;
    if (s.editCount === 0) return;
    const qn = s.queryEdits.size;
    const mn = s.moduleEdits.size;
    const signed = !!(s.wb.vba && s.wb.vba.signed) && mn > 0;
    const refresh = h('input', { type: 'checkbox', id: 'dl-refresh', checked: true });
    const ack = h('input', { type: 'checkbox', id: 'dl-ack' });
    const msg = h('p', { class: 'warn', role: 'alert', hidden: true });
    const go = h('button', { class: 'btn btn-primary', type: 'button', disabled: qn + mn === 0 || signed }, S.download);
    const content = h('div', { class: 'popover-body' },
      h('p', null, qn + mn === 0 ? S.downloadNone : S.changedSummary(qn, mn)),
      qn ? h('label', { class: 'check', for: 'dl-refresh' }, refresh, S.refreshOnOpen) : null,
      qn ? h('p', { class: 'note' }, S.cacheNote) : null,
      signed ? h('p', { class: 'warn' }, S.signedNote) : null,
      signed ? h('label', { class: 'check', for: 'dl-ack' }, ack, S.understand) : null,
      msg,
      h('div', { class: 'dialog-actions' }, go));
    const pop = popover(this.downloadBtn, content, null, S.download);
    ack.addEventListener('change', () => {
      go.disabled = !ack.checked || qn + mn === 0;
    });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const res = await s.download({ refreshOnLoad: refresh.checked, acknowledgeSignature: ack.checked, faultInject: this.faultInject });
        saveBytes(res.bytes, s.suggestedName(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        pop.close();
        this.status.set({ note: S.downloaded(s.suggestedName()) });
      } catch (e) {
        const code = e instanceof QuoinError ? e.code : 'write.selfcheck';
        msg.hidden = false;
        clear(msg);
        msg.append(code.startsWith('m.parse') ? e.message.replace(/^m\.parse: /, '') : errorMessage(code === 'vba.codepage' ? 'vba.codepage' : code, { cp: e.part || '' }), ' ', h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => navigator.clipboard && navigator.clipboard.writeText(`${code} ${e.message}`) }, S.copyDetails));
        go.disabled = false;
      }
    });
    (qn + mn === 0 ? content : go).focus && go.focus();
  }

  async exportResult(format, ext) {
    const res = await this.ws.runner.export(format, { guard: this.settings.csvGuard });
    if (res.error || !res.bytes) return;
    saveBytes(res.bytes, sanitizeFileName(this.ws.item.name, ext), res.mime);
  }

  codeFiles(kind) {
    const s = this.session;
    const files = [];
    if (kind === 'queries' || kind === 'all') for (const q of s.queries) files.push({ ...queryFile(q.name, s.textOf({ type: 'query', name: q.name })), name: `queries/${queryFile(q.name, '').name}` });
    if (kind === 'modules' || kind === 'all') {
      const cp = s.wb.vba && s.wb.vba.project ? s.wb.vba.project.codePage : 1252;
      for (const m of s.modules) files.push({ ...moduleFile(m, s.composeModule(m.name), cp), name: `modules/${moduleFile(m, '', cp).name}` });
    }
    return files;
  }

  openExport() {
    const ws = this.ws;
    const item = ws.item;
    const s = this.session;
    const tbl = ws.hasTableResult;
    const entries = [
      { heading: true, label: S.exportResult },
      { label: S.exportCsv, run: () => this.exportResult('csv', '.csv'), disabled: !tbl },
      { label: S.exportCsvBom, run: () => this.exportResult('csvbom', '.csv'), disabled: !tbl },
      { label: S.exportTsv, run: () => this.exportResult('tsv', '.tsv'), disabled: !tbl },
      { label: S.exportJson, run: () => this.exportResult('json', '.json'), disabled: !ws.hasValueResult },
      { label: S.exportXlsx, run: () => this.exportResult('xlsx', '.xlsx'), disabled: !tbl },
      { heading: true, label: S.exportCode },
      { label: S.exportQuery, run: () => this.saveCode(item), disabled: !item || item.type !== 'query' },
      { label: S.exportQueries, run: () => this.saveZip('queries'), disabled: !s.queries.length },
      { label: S.exportModule, run: () => this.saveCode(item), disabled: !item || item.type !== 'module' },
      { label: S.exportModules, run: () => this.saveZip('modules'), disabled: !s.modules.length },
      { label: S.exportEverything, run: () => this.saveZip('all'), disabled: !s.queries.length && !s.modules.length },
      { heading: true, label: S.exportSettings },
      { check: this.settings.csvGuard, id: 'guard', label: S.csvGuardLabel, onToggle: (v) => {
        this.settings.csvGuard = v;
      } }
    ];
    menu(this.exportBtn, entries);
  }

  saveCode(item) {
    const s = this.session;
    if (item.type === 'query') {
      const f = queryFile(item.name, s.textOf(item));
      saveBytes(f.data, f.name, 'text/plain');
    } else {
      const m = s.module(item.name);
      const cp = s.wb.vba.project.codePage;
      const f = moduleFile(m, s.composeModule(item.name), cp);
      saveBytes(f.data, f.name, 'text/plain');
    }
  }

  async saveZip(kind) {
    const files = this.codeFiles(kind);
    const bytes = await zipFiles(files);
    const base = (this.session.wb.fileName || 'workbook').replace(/\.[^.]*$/, '');
    saveBytes(bytes, sanitizeFileName(`${base} ${kind === 'all' ? 'code' : kind}.zip`, '.zip'), 'application/zip');
  }
}

export function boot() {
  applyTheme(loadTheme());
  watchMarks();
  const root = document.getElementById('app');
  const app = new App(root);
  window.__quoin = app;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  }
  return app;
}

export { fmt };
