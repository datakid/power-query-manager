import { h, clear, svgImg } from '../ui/dom.js';
import { S, fmt, errorMessage } from '../ui/strings.js';
import { Editor } from '../ui/editor.js';
import { Grid } from '../ui/grid.js';
import { popover, bindingDialog } from '../ui/dialogs.js';
import { parseExpressionText, MParseError } from '../core/m/parser.js';
import { readTable } from '../core/cells.js';
import { Runner } from './runner.js';

const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

function loadLabel(load) {
  if (load.kind === 'table') return `${S.loadedToTable} · ${load.sheet}!${load.ref}${load.alsoModel ? ` · ${S.loadedToModel}` : ''}`;
  if (load.kind === 'model') return S.loadedToModel;
  return S.connectionOnly;
}

export class Workspace {
  constructor(host, session, settings, status) {
    this.session = session;
    this.settings = settings;
    this.status = status;
    this.runner = new Runner();
    this.item = null;
    this.rail = h('nav', { class: 'rail', 'aria-label': S.queries });
    this.main = h('section', { class: 'main', 'data-pane': 'code' });
    this.root = h('div', { class: 'workspace' }, this.rail, this.main);
    host.append(this.root);
    this.buildMain();
    this.drillStack = [];
    this.lastRun = null;
    this.cachedCompare = new Map();
    this.runToken = 0;
    this.onEditCallbacks = [];
    this.resizer();
  }

  onEdit(fn) {
    this.onEditCallbacks.push(fn);
  }

  resizer() {
    const handle = h('div', { class: 'rail-resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': S.resizeRail, 'aria-valuemin': '200', 'aria-valuemax': '360', 'aria-valuenow': '248', tabindex: '0' });
    this.rail.append(handle);
    let startX = 0;
    let startW = 248;
    const move = (ev) => {
      const w = Math.max(200, Math.min(360, startW + ev.clientX - startX));
      this.root.style.setProperty('--rail-width', `${w}px`);
      handle.setAttribute('aria-valuenow', String(Math.round(w)));
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointerdown', (ev) => {
      startX = ev.clientX;
      startW = this.rail.getBoundingClientRect().width;
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        const w = Math.max(200, Math.min(360, this.rail.getBoundingClientRect().width + (ev.key === 'ArrowRight' ? 16 : -16)));
        this.root.style.setProperty('--rail-width', `${w}px`);
        handle.setAttribute('aria-valuenow', String(Math.round(w)));
        ev.preventDefault();
      }
    });
  }

  buildMain() {
    this.title = h('h2', { class: 'item-title' });
    this.meta = h('span', { class: 'item-meta' });
    this.revertBtn = h('button', { class: 'btn btn-quiet', type: 'button', hidden: true, onclick: () => this.revert() }, S.revert);
    this.head = h('div', { class: 'item-head' }, h('div', null, this.title), h('div', { class: 'item-actions' }, this.meta, this.revertBtn));
    this.info = h('div', { class: 'info-strip', hidden: true });
    this.editorHost = h('div', { class: 'editor-host' });
    this.editorHost.style.display = 'contents';
    this.editor = new Editor(this.editorHost, { language: 'm', label: S.editorAria, onChange: (t) => this.onEditorChange(t) });
    this.runBtn = h('button', { class: 'btn', type: 'button', onclick: () => this.run() }, S.run, h('span', { class: 'item-meta' }, '⌘↵'));
    this.cancelBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => this.cancel() }, S.cancel);
    this.steps = h('div', { class: 'steps', role: 'group', 'aria-label': S.stepsLabel });
    this.diffBox = h('input', { type: 'checkbox', id: 'diff-box' });
    this.diffLabel = h('label', { class: 'check item-meta', for: 'diff-box', hidden: true }, this.diffBox, S.highlightDiffs);
    this.diffBox.addEventListener('change', () => this.applyDiffs());
    this.splitter = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'horizontal', tabindex: '0', 'aria-label': S.resizeSplit, 'aria-valuemin': '15', 'aria-valuemax': '85', 'aria-valuenow': '45' });
    this.runbar = h('div', { class: 'runbar' }, this.splitter, this.runBtn, this.cancelBtn, this.steps, h('span', { class: 'spacer' }), this.diffLabel);
    this.progress = h('div', { class: 'progress', hidden: true, role: 'progressbar', 'aria-label': S.running });
    this.crumbs = h('div', { class: 'crumbs', hidden: true });
    this.resultBody = h('div', { class: 'result-body' });
    this.resultBody.style.display = 'flex';
    this.resultBody.style.flexDirection = 'column';
    this.resultBody.style.flex = '1';
    this.resultBody.style.minHeight = '0';
    this.sources = h('div', { class: 'crumbs', hidden: true });
    this.resultPanel = h('div', { class: 'result-panel' }, this.progress, this.crumbs, this.resultBody, this.sources);
    this.segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': S.pane },
      h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => this.setPane('code') }, S.code),
      h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => this.setPane('result') }, S.result));
    this.main.append(this.head, this.segmented, this.info, this.editorHost, this.runbar, this.resultPanel);
    this.grid = new Grid(this.resultBody, { onDrill: (v, label) => this.drill(v, label), onError: (v, anchor) => this.showErrorCell(v, anchor) });
    this.grid.onNotice = (t) => this.status.set({ note: t });
    this.grid.el.hidden = true;
    this.messageEl = null;
    this.splitterSetup();
  }

  setPane(p) {
    this.main.dataset.pane = p;
    [...this.segmented.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (p === 'code'))));
  }

  splitterSetup() {
    let startY = 0;
    let startTop = 45;
    const move = (ev) => {
      const total = this.editorHost.getBoundingClientRect().height + this.resultPanel.getBoundingClientRect().height;
      const top = Math.max(15, Math.min(85, startTop + ((ev.clientY - startY) / total) * 100));
      this.main.style.setProperty('--top', `${top}fr`);
      this.main.style.setProperty('--bottom', `${100 - top}fr`);
      this.splitter.setAttribute('aria-valuenow', String(Math.round(top)));
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    this.splitter.addEventListener('pointerdown', (ev) => {
      const total = this.editorHost.getBoundingClientRect().height + this.resultPanel.getBoundingClientRect().height;
      startTop = (this.editorHost.getBoundingClientRect().height / total) * 100;
      startY = ev.clientY;
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    this.splitter.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
      ev.preventDefault();
      const cur = parseFloat(getComputedStyle(this.main).getPropertyValue('--top')) || 45;
      const top = Math.max(15, Math.min(85, cur + (ev.key === 'ArrowDown' ? 5 : -5)));
      this.main.style.setProperty('--top', `${top}fr`);
      this.main.style.setProperty('--bottom', `${100 - top}fr`);
      this.splitter.setAttribute('aria-valuenow', String(Math.round(top)));
    });
  }

  items() {
    return [...this.session.queries.map((q) => ({ type: 'query', name: q.name })), ...this.session.modules.map((m) => ({ type: 'module', name: m.name }))];
  }

  renderRail() {
    const keep = this.rail.querySelector('.rail-resizer');
    clear(this.rail);
    const s = this.session;
    const tree = h('ul', { class: 'tree', role: 'tree', 'aria-label': S.queries });
    const mk = (item, extra) => {
      const edited = s.isEdited(item);
      const q = item.type === 'query' ? s.query(item.name) : null;
      const isFn = q ? this.isFunction(q) : false;
      const li = h('li', { role: 'treeitem', 'aria-selected': String(!!this.item && this.item.type === item.type && this.item.name === item.name), 'data-type': item.type, 'data-name': item.name, tabindex: '-1' },
        h('span', { class: 'tree-item' },
          q ? (q.load.kind === 'connection' ? h('span', { class: 'dot-conn', title: S.connectionOnly }) : h('span', { class: 'dot-loaded', title: loadLabel(q.load) })) : null,
          h('span', { class: 'name' }, item.name),
          isFn ? h('span', { class: 'badge-fn', 'aria-hidden': 'true' }, S.functionBadge) : null,
          isFn ? h('span', { class: 'sr-only' }, S.asFunction) : null,
          edited ? h('span', { class: 'dot-edited', 'aria-hidden': 'true' }) : null,
          edited ? h('span', { class: 'sr-only' }, S.asEdited) : null));
      li.addEventListener('click', () => this.select(item));
      li.addEventListener('keydown', (ev) => this.railKey(ev, li));
      if (extra) extra(li);
      return li;
    };
    tree.append(h('li', { role: 'presentation', class: 'rail-label' }, h('span', null, S.queries), h('span', null, String(s.queries.length))));
    const groups = new Map();
    for (const q of s.queries) {
      const g = q.group ? q.group.name : '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(q);
    }
    for (const [g, qs] of groups) {
      if (!g) {
        for (const q of qs) tree.append(mk({ type: 'query', name: q.name }));
      } else {
        const sub = h('ul', { role: 'group' });
        const folder = h('li', { role: 'treeitem', 'aria-expanded': 'true', class: 'tree-folder', tabindex: '-1', 'aria-label': S.folderAria(g) },
          h('span', { class: 'tree-item' }, h('span', { class: 'name' }, g)), sub);
        folder.firstChild.addEventListener('click', () => {
          const open = folder.getAttribute('aria-expanded') !== 'true';
          folder.setAttribute('aria-expanded', String(open));
          sub.hidden = !open;
        });
        for (const q of qs) sub.append(mk({ type: 'query', name: q.name }));
        tree.append(folder);
      }
    }
    if (!s.queries.length) tree.append(h('li', { role: 'presentation', class: 'item-meta rail-label' }, S.noQueries));
    tree.append(h('li', { role: 'presentation', class: 'rail-label' }, h('span', null, S.macros), h('span', null, String(s.modules.length))));
    for (const m of s.modules) tree.append(mk({ type: 'module', name: m.name }));
    if (!s.modules.length) tree.append(h('li', { role: 'presentation', class: 'item-meta rail-label' }, S.noMacros));
    this.rail.append(tree, keep);
  }

  isFunction(q) {
    if (q.isFn === undefined) {
      try {
        const ast = parseExpressionText(q.original);
        const bodyBinding = ast.t === 'Let' && ast.body.t === 'Identifier' ? ast.bindings.find((b) => b.name === ast.body.name) : null;
        q.isFn = ast.t === 'Function' || (!!bodyBinding && bodyBinding.expr.t === 'Function');
      } catch {
        q.isFn = false;
      }
    }
    return q.isFn;
  }

  railKey(ev, li) {
    const all = [...this.rail.querySelectorAll('[role="treeitem"]')].filter((x) => x.offsetParent !== null);
    const i = all.indexOf(li);
    if (ev.key === 'ArrowDown') {
      if (all[i + 1]) all[i + 1].focus();
      ev.preventDefault();
    } else if (ev.key === 'ArrowUp') {
      if (all[i - 1]) all[i - 1].focus();
      ev.preventDefault();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      li.click();
      ev.preventDefault();
    }
  }

  step(dir) {
    const all = this.items();
    if (!all.length) return;
    const i = this.item ? all.findIndex((x) => x.type === this.item.type && x.name === this.item.name) : -1;
    this.select(all[(i + dir + all.length) % all.length]);
  }

  selectFirst() {
    const all = this.items();
    if (all.length) this.select(all[0]);
    else this.showNothing();
  }

  showNothing() {
    this.item = null;
    this.title.textContent = S.noSelection;
    this.meta.textContent = '';
    this.main.hidden = false;
  }

  select(item) {
    this.cancel();
    this.item = item;
    this.drillStack = [];
    this.renderRail();
    const s = this.session;
    const isQuery = item.type === 'query';
    this.main.classList.toggle('is-vba', !isQuery);
    this.runbar.hidden = !isQuery;
    this.resultPanel.hidden = !isQuery;
    this.segmented.hidden = !isQuery;
    this.title.textContent = item.name;
    this.editor.setLanguage(isQuery ? 'm' : 'vba');
    this.editor.setLabel(S.editorAriaFor(isQuery ? S.editorAria : S.moduleAria, item.name));
    this.editor.setText(s.textOf(item));
    this.editor.setError(null);
    const ed = isQuery ? s.queryEditable() : s.moduleEditable(item.name);
    this.editor.setReadOnly(!ed.editable);
    this.info.hidden = false;
    clear(this.info);
    if (!isQuery) {
      this.info.append(S.vbaInfo);
      if (!ed.editable) this.info.append(` ${errorMessage(ed.reason)}`);
      const m = s.module(item.name);
      this.meta.textContent = m ? m.kind : '';
    } else {
      this.info.hidden = ed.editable;
      if (!ed.editable) this.info.append(errorMessage(ed.reason));
      this.meta.textContent = loadLabel(s.query(item.name).load);
    }
    this.revertBtn.hidden = !s.isEdited(item);
    this.clearResult();
    if (isQuery) this.checkLive(this.editor.getText());
    this.setPane('code');
  }

  onEditorChange(text) {
    if (!this.item) return;
    const s = this.session;
    s.setText(this.item, text);
    this.revertBtn.hidden = !s.isEdited(this.item);
    const li = this.rail.querySelector(`[data-type="${this.item.type}"][data-name="${CSS.escape(this.item.name)}"] .tree-item`);
    if (li) {
      const dot = li.querySelector('.dot-edited');
      if (s.isEdited(this.item) && !dot) li.append(h('span', { class: 'dot-edited', 'aria-hidden': 'true' }));
      else if (!s.isEdited(this.item) && dot) dot.remove();
    }
    if (this.item.type === 'query') {
      clearTimeout(this.liveTimer);
      this.liveTimer = setTimeout(() => this.checkLive(text), 250);
    }
    for (const fn of this.onEditCallbacks) fn();
  }

  checkLive(text) {
    try {
      parseExpressionText(text.replace(/\n/g, '\n'));
      this.editor.setError(null);
    } catch (e) {
      if (e instanceof MParseError) this.editor.setError({ message: e.message, line: e.line, col: e.col, start: e.start, end: e.end });
      else throw e;
    }
  }

  revert() {
    if (!this.item) return;
    this.session.revert(this.item);
    this.editor.setText(this.session.textOf(this.item));
    this.revertBtn.hidden = true;
    this.renderRail();
    if (this.item.type === 'query') this.checkLive(this.editor.getText());
    for (const fn of this.onEditCallbacks) fn();
  }

  clearResult() {
    this.grid.el.hidden = true;
    this.crumbs.hidden = true;
    this.diffLabel.hidden = true;
    clear(this.steps);
    this.setMessage(S.noResultYet, '');
    this.status.set({ run: null, compare: null });
    this.renderSources();
  }

  setMessage(text, cls, detail) {
    this.grid.el.hidden = true;
    if (this.messageEl) this.messageEl.remove();
    this.messageEl = h('div', { class: `message ${cls || ''}`, role: cls === 'error' ? 'alert' : null }, text, detail ? h('pre', null, detail) : null);
    this.resultBody.append(this.messageEl);
  }

  clearMessage() {
    if (this.messageEl) {
      this.messageEl.remove();
      this.messageEl = null;
    }
  }

  async run(step) {
    const item = this.item;
    if (!item || item.type !== 'query' || this.runner.running) return;
    const s = this.session;
    const token = ++this.runToken;
    this.setPane('result');
    try {
      parseExpressionText(this.editor.getText());
    } catch (e) {
      if (e instanceof MParseError) {
        this.setMessage(S.lineCol(e.message, e.line, e.col), 'error');
        this.status.set({ run: { error: 'm.parse' }, compare: null });
        return;
      }
      throw e;
    }
    this.progress.hidden = false;
    this.runBtn.hidden = true;
    this.cancelBtn.hidden = false;
    const q = s.query(item.name);
    let compareTo = null;
    if (!step && q.load.kind === 'table') {
      if (!this.cachedCompare.has(item.name)) {
        const table = s.wb.tables.find((t) => t.displayName === q.load.tableName && t.sheet === q.load.sheet);
        this.cachedCompare.set(item.name, table ? await readTable(s.wb, table) : null);
      }
      compareTo = this.cachedCompare.get(item.name);
    }
    const snapshot = await s.snapshot();
    const set = this.settings;
    const res = await this.runner.run({
      sectionText: s.currentSectionText(),
      queryName: item.name,
      snapshot,
      bindings: [...s.bindings].map(([k, b]) => [k, { bytes: b.bytes, workbook: b.workbook }]),
      culture: set.culture,
      limits: { timeoutMs: set.timeoutS * 1000, maxRows: set.rowCap },
      useUpstream: set.useUpstream,
      step: step || null,
      compareTo,
      previewRows: 200,
      now: new Date().toISOString(),
      localOffsetMin: -new Date().getTimezoneOffset()
    }, { onNeedBinding: (kind, key) => this.askBinding(kind, key) });
    if (token !== this.runToken) return;
    this.progress.hidden = true;
    this.runBtn.hidden = false;
    this.cancelBtn.hidden = true;
    this.renderResult(res, !!step);
  }

  async askBinding(kind, key) {
    const file = await bindingDialog(kind, key);
    if (!file) return null;
    const b = await this.session.addBinding(key, file);
    this.renderSources();
    return { bytes: b.bytes, workbook: b.workbook };
  }

  renderSources() {
    clear(this.sources);
    const entries = [...this.session.bindings];
    this.sources.hidden = !entries.length;
    if (!entries.length) return;
    this.sources.append(h('span', null, S.sources));
    for (const [key, b] of entries) {
      this.sources.append(h('span', null, S.sourceMapping(key, b.name)), h('button', { type: 'button', onclick: () => {
        this.session.bindings.delete(key);
        this.renderSources();
      } }, S.clearSource));
    }
  }

  cancel() {
    if (this.runner.running) {
      this.runToken++;
      this.runner.cancel();
      this.progress.hidden = true;
      this.runBtn.hidden = false;
      this.cancelBtn.hidden = true;
      this.setMessage(S.cancelled, '');
      this.status.set({ run: { cancelled: true }, compare: null });
      return true;
    }
    return false;
  }

  renderResult(res, isStep) {
    this.clearMessage();
    clear(this.steps);
    this.diffLabel.hidden = true;
    this.crumbs.hidden = true;
    this.drillStack = [];
    this.lastResult = res;
    if (res.status === 'cancelled') return;
    if (res.status === 'ok' && res.steps && res.steps.length) {
      this.steps.append(h('span', null, S.stepsLabel));
      res.steps.forEach((name, i) => {
        const b = h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => this.run(name) }, name);
        this.steps.append(b);
        if (i < res.steps.length - 1) this.steps.append(' · ');
      });
    }
    if (res.status === 'parse-error') {
      const e = res.error;
      this.setMessage(`${S.lineCol(e.message, e.line, e.col)}${e.member && e.member !== this.item.name ? S.inMember(e.member) : ''}`, 'error');
      this.status.set({ run: { error: 'm.parse' }, compare: null });
      return;
    }
    if (res.status === 'error') {
      const e = res.error;
      const detail = e.detail === null || e.detail === undefined ? '' : typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail);
      this.setMessage(e.reason === 'Quoin.Unsupported' ? e.message : `${e.reason}: ${e.message}`, 'error', detail || null);
      if (e.reason === 'Quoin.Unsupported' && typeof e.detail === 'string') this.markCall(e.detail, e.message);
      this.status.set({ run: { error: e.reason }, compare: null });
      return;
    }
    if (res.status === 'stopped') {
      const key = res.code;
      const text = key === 'm.timeout' ? fmt(errorMessage(key), { s: this.settings.timeoutS }) : key === 'm.rows' ? fmt(errorMessage(key), { n: ((res.detail && res.detail.rows) || this.settings.rowCap).toLocaleString('en-US') }) : errorMessage(key);
      this.setMessage(text, 'warn');
      this.status.set({ run: { error: key }, compare: null });
      return;
    }
    if (res.status !== 'ok') {
      this.setMessage(S.readFailed, 'error', res.message || null);
      return;
    }
    const r = res.result;
    this.status.set({ culture: this.settings.culture });
    if (r.kind === 'function') {
      this.setMessage(S.functionResult, '');
      this.status.set({ run: { fn: true }, compare: null });
      return;
    }
    const secs = (res.durationMs / 1000).toFixed(2);
    if (r.kind === 'table') {
      const t = r.value;
      this.showTable(t, true);
      this.status.set({ run: { rows: t.rowCount, secs }, compare: isStep ? null : res.compare, flags: res.flags });
      this.pendingDiffs = res.compare && res.compare.diffs ? new Set(res.compare.diffs.map(([row, col]) => `${row}:${col}`)) : null;
      this.diffLabel.hidden = !(res.compare && res.compare.count > 0);
      this.diffBox.checked = false;
      return;
    }
    this.showValue(r.value, r.kind, secs, res.flags);
  }

  markCall(name, message) {
    const text = this.editor.getText();
    const at = text.indexOf(name);
    if (at < 0) return;
    const before = text.slice(0, at);
    const line = before.split('\n').length;
    const col = at - before.lastIndexOf('\n');
    this.editor.setError({ message, line, col, start: at, end: at + name.length });
  }

  showTable(t, remote) {
    this.clearMessage();
    this.grid.el.hidden = false;
    this.grid.setCulture(this.settings.culture);
    this.grid.setData({ columns: t.columns, rowCount: t.rowCount, rows: t.rows, loader: remote && t.rowCount > t.rows.length ? (start, count) => this.runner.rows(start, count) : null });
    if (t.truncated && !remote) this.status.set({ note: S.resultsTruncated });
    this.grid.el.setAttribute('aria-label', S.resultAria(this.item ? this.item.name : ''));
  }

  showValue(v, kind, secs, flags) {
    if (v && typeof v === 'object' && v.k === 'list') {
      const rows = v.items.map((x) => [x]);
      this.showTable({ columns: [{ name: S.itemColumn, type: 'any' }], rowCount: v.count, rows, truncated: v.truncated }, false);
      this.status.set({ run: { rows: v.count, secs }, compare: null, flags });
      return;
    }
    if (v && typeof v === 'object' && v.k === 'record') {
      const rows = v.names.map((n, i) => [n, v.values[i]]);
      this.showTable({ columns: [{ name: S.nameColumn, type: 'text' }, { name: S.valueColumn, type: 'any' }], rowCount: rows.length, rows, truncated: false }, false);
      this.status.set({ run: { rows: rows.length, secs }, compare: null, flags });
      return;
    }
    const text = v === null ? S.nullText : typeof v === 'object' ? v.text || v.special || kind : String(v);
    this.setMessage(text, '');
    this.status.set({ run: { value: true, secs }, compare: null, flags });
  }

  drill(v, label) {
    const prev = { label: this.drillStack.length ? this.drillStack[this.drillStack.length - 1].label : S.drillRoot };
    void prev;
    this.drillStack.push({ label, value: v });
    this.showNested(v);
    this.renderCrumbs();
  }

  showNested(v) {
    if (v.k === 'table') this.showTable(v, false);
    else if (v.k === 'list') this.showTable({ columns: [{ name: S.itemColumn, type: 'any' }], rowCount: v.count, rows: v.items.map((x) => [x]), truncated: v.truncated }, false);
    else this.showTable({ columns: [{ name: S.nameColumn, type: 'text' }, { name: S.valueColumn, type: 'any' }], rowCount: v.names.length, rows: v.names.map((n, i) => [n, v.values[i]]), truncated: false }, false);
  }

  renderCrumbs() {
    clear(this.crumbs);
    this.crumbs.hidden = !this.drillStack.length;
    if (!this.drillStack.length) return;
    this.crumbs.append(h('button', { type: 'button', onclick: () => this.drillTo(-1) }, S.drillRoot));
    this.drillStack.forEach((d, i) => {
      this.crumbs.append(' › ');
      if (i === this.drillStack.length - 1) this.crumbs.append(h('span', { 'aria-current': 'location' }, d.label));
      else this.crumbs.append(h('button', { type: 'button', onclick: () => this.drillTo(i) }, d.label));
    });
  }

  drillTo(i) {
    this.drillStack = this.drillStack.slice(0, i + 1);
    if (i < 0) {
      if (this.lastResult && this.lastResult.status === 'ok') this.renderResultTableOnly();
    } else this.showNested(this.drillStack[i].value);
    this.renderCrumbs();
  }

  renderResultTableOnly() {
    const r = this.lastResult.result;
    if (r.kind === 'table') {
      this.showTable(r.value, true);
      if (this.pendingDiffs && this.diffBox.checked) this.grid.setDiffs(this.pendingDiffs);
    } else this.showValue(r.value, r.kind, (this.lastResult.durationMs / 1000).toFixed(2), this.lastResult.flags);
  }

  applyDiffs() {
    this.grid.setDiffs(this.diffBox.checked ? this.pendingDiffs : null);
  }

  showErrorCell(v, anchor) {
    const content = h('div', null, h('p', null, h('strong', null, S.reasonLabel), v.reason), h('p', null, h('strong', null, S.messageLabel), v.message), v.detail ? h('p', null, h('strong', null, S.detailLabel), String(v.detail)) : null);
    popover(anchor, content, null, S.errorText);
  }

  get hasTableResult() {
    return !!(this.lastResult && this.lastResult.status === 'ok' && this.lastResult.result.kind === 'table');
  }

  get hasValueResult() {
    return !!(this.lastResult && this.lastResult.status === 'ok' && this.lastResult.result.kind !== 'function');
  }
}

export { svgImg, plural };
