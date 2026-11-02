import { h, clear, placeBelow, onOutside } from './dom.js';
import { S } from './strings.js';

const ROW_H = 28;
const HEAD_H = 44;
const INDEX_W = 56;
const COL_VIRTUAL_AFTER = 50;
const PAGE = 200;
const SORT_LIMIT = 200000;

export function typeLabel(col) {
  const t = String(col.type || 'any').replace(/^nullable /, '');
  if (col.facet && ['int64', 'int32', 'int16', 'int8', 'byte'].includes(col.facet)) return '123';
  if (t === 'text') return 'abc';
  if (t === 'number') return '1.2';
  if (t === 'logical') return 'true/false';
  return t;
}

export function cellDisplay(v, numberFormat) {
  if (v === null || v === undefined) return { text: S.nullText, cls: 'null' };
  if (typeof v === 'string') return { text: v.replace(/\r?\n|\r/g, ' ↵ '), cls: '', raw: v };
  if (typeof v === 'number') return { text: numberFormat.format(v), cls: 'num', raw: String(v) };
  if (typeof v === 'boolean') return { text: v ? 'true' : 'false', cls: '' };
  switch (v.k) {
    case 'number':
      return { text: v.special, cls: 'num' };
    case 'date':
      return { text: v.text, cls: '' };
    case 'datetime':
    case 'datetimezone':
      return { text: v.text.replace('T', ' '), cls: '' };
    case 'time':
    case 'duration':
      return { text: v.text, cls: '' };
    case 'error':
      return { text: S.errorText, cls: 'err', raw: `${v.reason}: ${v.message}` };
    case 'list':
      return { text: S.listText, cls: 'nested' };
    case 'record':
      return { text: S.recordText, cls: 'nested' };
    case 'table':
      return { text: S.tableText, cls: 'nested' };
    default:
      return { text: v.text || '', cls: '' };
  }
}

function copyText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v.k === 'number') return v.special;
  if (v.k === 'error') return S.errorText;
  return v.text || '';
}

function sortKey(v) {
  if (v === null || v === undefined) return [0, 0];
  if (typeof v === 'number') return [1, v];
  if (typeof v === 'boolean') return [1, v ? 1 : 0];
  if (typeof v === 'string') return [2, v];
  if (v.k === 'date' || v.k === 'datetime' || v.k === 'datetimezone' || v.k === 'time' || v.k === 'duration') return [3, v.text];
  if (v.k === 'number') return [1, Number(v.special === 'Infinity' ? Infinity : v.special === '-Infinity' ? -Infinity : NaN)];
  return [4, v.k || ''];
}

function compareKeys(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (typeof a[1] === 'number' && typeof b[1] === 'number') return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  return String(a[1]).localeCompare(String(b[1]));
}

export class Grid {
  constructor(host, { onDrill = null, onError = null } = {}) {
    this.onDrill = onDrill;
    this.onError = onError;
    this.columns = [];
    this.rowCount = 0;
    this.diffs = null;
    this.cache = new Map();
    this.pending = new Set();
    this.order = null;
    this.rowEls = new Map();
    this.sel = null;
    this.active = null;
    this.drag = false;
    this.loader = null;
    this.numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 15, useGrouping: false });
    this.integerFormat = new Intl.NumberFormat('en-US');
    this.head = h('div', { class: 'grid-head', role: 'row' });
    this.body = h('div', { class: 'grid-body', role: 'rowgroup' });
    this.sizer = h('div', { class: 'grid-sizer' }, this.head, this.body);
    this.el = h('div', { class: 'grid', role: 'grid', tabindex: '0', 'aria-label': S.result }, this.sizer);
    host.append(this.el);
    this.el.addEventListener('scroll', () => this.paint());
    this.el.addEventListener('keydown', (ev) => this.onKey(ev));
    this.el.addEventListener('copy', (ev) => this.onCopy(ev));
    this.el.addEventListener('pointerup', () => {
      this.drag = false;
    });
    new ResizeObserver(() => this.paint()).observe(this.el);
  }

  setCulture(name) {
    try {
      this.numberFormat = new Intl.NumberFormat(name, { maximumFractionDigits: 15, useGrouping: false });
      this.integerFormat = new Intl.NumberFormat(name);
    } catch {
      this.numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 15, useGrouping: false });
      this.integerFormat = new Intl.NumberFormat('en-US');
    }
  }

  setData({ columns, rowCount, rows = null, loader = null, diffs = null }) {
    this.columns = columns;
    this.rowCount = rowCount;
    this.cache = new Map();
    this.pending = new Set();
    this.order = null;
    this.loader = loader;
    this.diffs = diffs;
    this.sel = null;
    this.active = null;
    if (rows) rows.forEach((r, i) => this.cache.set(i, r));
    this.widths = columns.map((c, i) => this.estimateWidth(c, i, rows));
    this.xs = [];
    let x = INDEX_W;
    for (const w of this.widths) {
      this.xs.push(x);
      x += w;
    }
    this.totalWidth = x;
    this.el.setAttribute('aria-rowcount', String(rowCount + 1));
    this.el.setAttribute('aria-colcount', String(columns.length + 1));
    this.sizer.style.width = `${this.totalWidth}px`;
    this.sizer.style.height = `${HEAD_H + rowCount * ROW_H}px`;
    this.head.style.width = `${this.totalWidth}px`;
    this.head.style.height = `${HEAD_H}px`;
    this.body.style.top = `${HEAD_H}px`;
    this.body.style.height = `${rowCount * ROW_H}px`;
    this.el.scrollTop = 0;
    this.el.scrollLeft = 0;
    clear(this.body);
    this.rowEls = new Map();
    this.headSig = '';
    this.paint();
  }

  setDiffs(diffs) {
    this.diffs = diffs;
    this.rowEls.forEach((el) => el.remove());
    this.rowEls = new Map();
    this.paint();
  }

  estimateWidth(col, i, rows) {
    let chars = Math.max(col.name.length, typeLabel(col).length + 2);
    if (rows) {
      for (const r of rows.slice(0, 50)) {
        const d = cellDisplay(r[i], this.numberFormat);
        chars = Math.max(chars, Math.min(d.text.length, 40));
      }
    }
    return Math.max(80, Math.min(320, Math.round(chars * 8.2 + 24)));
  }

  rowAt(visual) {
    const idx = this.order ? this.order[visual] : visual;
    const row = this.cache.get(idx);
    if (!row) this.request(idx);
    return row;
  }

  request(idx) {
    if (!this.loader) return;
    const start = Math.floor(idx / PAGE) * PAGE;
    if (this.pending.has(start)) return;
    this.pending.add(start);
    this.loader(start, PAGE).then((rows) => {
      rows.forEach((r, i) => this.cache.set(start + i, r));
      this.pending.delete(start);
      this.paint();
    });
  }

  visibleColumns() {
    if (this.columns.length <= COL_VIRTUAL_AFTER) return [0, this.columns.length - 1];
    const left = this.el.scrollLeft;
    const right = left + this.el.clientWidth;
    let a = 0;
    while (a < this.xs.length - 1 && this.xs[a] + this.widths[a] < left) a++;
    let b = a;
    while (b < this.xs.length - 1 && this.xs[b] < right) b++;
    return [Math.max(0, a - 2), Math.min(this.columns.length - 1, b + 2)];
  }

  paint() {
    if (!this.columns.length) {
      clear(this.head);
      clear(this.body);
      return;
    }
    const top = this.el.scrollTop;
    const first = Math.max(0, Math.floor(top / ROW_H) - 4);
    const last = Math.min(this.rowCount - 1, Math.ceil((top + this.el.clientHeight) / ROW_H) + 4);
    const [c0, c1] = this.visibleColumns();
    const sig = `${c0}:${c1}`;
    if (sig !== this.headSig) {
      this.headSig = sig;
      this.paintHead(c0, c1);
      this.rowEls.forEach((el) => el.remove());
      this.rowEls = new Map();
    }
    for (const [i, el] of this.rowEls) {
      if (i < first || i > last) {
        el.remove();
        this.rowEls.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      if (this.rowEls.has(i)) continue;
      const el = this.buildRow(i, c0, c1);
      this.body.append(el);
      this.rowEls.set(i, el);
    }
    if (this.loader) for (const [i, el] of this.rowEls) if (el.dataset.loading === '1' && this.rowAt(i)) {
      el.remove();
      this.rowEls.delete(i);
      const fresh = this.buildRow(i, c0, c1);
      this.body.append(fresh);
      this.rowEls.set(i, fresh);
    }
  }

  paintHead(c0, c1) {
    clear(this.head);
    const idx = h('div', { class: 'grid-hcell grid-index', role: 'columnheader', 'aria-colindex': '1' }, h('span', { class: 'sr-only' }, S.rowHeader));
    idx.style.left = '0px';
    idx.style.width = `${INDEX_W}px`;
    this.head.append(idx);
    for (let c = c0; c <= c1; c++) {
      const col = this.columns[c];
      const cell = h(
        'div',
        { class: 'grid-hcell', role: 'columnheader', 'aria-colindex': String(c + 2), tabindex: '-1', title: `${col.name} (${col.type})` },
        h('span', { class: 'hname' }, col.name),
        h('span', { class: 'htype' }, typeLabel(col))
      );
      cell.style.left = `${this.xs[c]}px`;
      cell.style.width = `${this.widths[c]}px`;
      cell.addEventListener('click', (ev) => this.openColumnMenu(c, cell, ev));
      cell.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          this.openColumnMenu(c, cell, ev);
        }
      });
      this.head.append(cell);
    }
  }

  buildRow(i, c0, c1) {
    const data = this.rowAt(i);
    const realIndex = this.order ? this.order[i] : i;
    const row = h('div', { class: 'grid-row', role: 'row', 'aria-rowindex': String(i + 2) });
    row.style.top = `${i * ROW_H}px`;
    row.style.height = `${ROW_H}px`;
    row.style.width = `${this.totalWidth}px`;
    row.dataset.loading = data ? '0' : '1';
    const idx = h('div', { class: 'grid-cell grid-index', role: 'rowheader' }, String(realIndex + 1));
    idx.style.left = '0px';
    idx.style.width = `${INDEX_W}px`;
    idx.style.position = 'absolute';
    row.append(idx);
    for (let c = c0; c <= c1; c++) {
      const v = data ? data[c] : undefined;
      const d = data ? cellDisplay(v, this.numberFormat) : { text: '', cls: '' };
      const classes = ['grid-cell'];
      if (d.cls) classes.push(d.cls);
      const diff = this.diffs && this.diffs.has(`${realIndex}:${c}`);
      if (diff) classes.push('diff');
      if (this.isSelected(i, c)) classes.push('sel');
      if (this.active && this.active.r === i && this.active.c === c) classes.push('active');
      const attrs = { class: classes.join(' '), role: 'gridcell', id: `gc-${i}-${c}`, 'aria-colindex': String(c + 2) };
      if (this.isSelected(i, c)) attrs['aria-selected'] = 'true';
      if (d.raw !== undefined && d.raw !== d.text) attrs.title = d.raw;
      if (diff) attrs.title = S.cellDiffTitle;
      const cell = h('div', attrs, d.text);
      cell.style.left = `${this.xs[c]}px`;
      cell.style.width = `${this.widths[c]}px`;
      cell.style.position = 'absolute';
      cell.addEventListener('pointerdown', (ev) => this.onCellDown(ev, i, c, v, cell));
      cell.addEventListener('pointerenter', () => {
        if (this.drag) this.extend(i, c);
      });
      row.append(cell);
    }
    return row;
  }

  isSelected(r, c) {
    if (!this.sel) return false;
    const { r1, r2, c1, c2 } = this.sel;
    return r >= r1 && r <= r2 && c >= c1 && c <= c2;
  }

  onCellDown(ev, r, c, v, cell) {
    this.el.focus();
    if (v && typeof v === 'object' && v.k === 'error') {
      this.showError(v, cell);
    } else if (v && typeof v === 'object' && ['list', 'record', 'table'].includes(v.k) && !ev.shiftKey && this.onDrill) {
      this.onDrill(v, S.drillLabel(this.columns[c].name, r + 1));
      return;
    }
    if (ev.shiftKey && this.active) this.extend(r, c);
    else {
      this.active = { r, c };
      this.anchor = { r, c };
      this.sel = { r1: r, r2: r, c1: c, c2: c };
      this.drag = true;
    }
    this.repaintAll();
  }

  extend(r, c) {
    const a = this.anchor || this.active || { r, c };
    this.active = { r, c };
    this.sel = { r1: Math.min(a.r, r), r2: Math.max(a.r, r), c1: Math.min(a.c, c), c2: Math.max(a.c, c) };
    this.repaintAll();
  }

  repaintAll() {
    this.rowEls.forEach((el) => el.remove());
    this.rowEls = new Map();
    this.paint();
    if (this.active) this.el.setAttribute('aria-activedescendant', `gc-${this.active.r}-${this.active.c}`);
    this.preloadSelection();
  }

  preloadSelection() {
    if (!this.sel || !this.loader) return;
    for (let r = this.sel.r1; r <= Math.min(this.sel.r2, this.sel.r1 + 20000); r += PAGE) this.rowAt(r);
  }

  activateActive() {
    const { r, c } = this.active;
    const idx = this.order ? this.order[r] : r;
    const row = this.cache.get(idx);
    const v = row ? row[c] : undefined;
    if (!v || typeof v !== 'object') return;
    if (v.k === 'error') this.showError(v, this.el.querySelector(`#gc-${r}-${c}`) || this.el);
    else if (['list', 'record', 'table'].includes(v.k) && this.onDrill) this.onDrill(v, S.drillLabel(this.columns[c].name, r + 1));
  }

  onKey(ev) {
    const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp'];
    if (!this.active) {
      if (navKeys.includes(ev.key) && this.rowCount && this.columns.length) {
        this.active = { r: 0, c: 0 };
        this.anchor = { r: 0, c: 0 };
        this.sel = { r1: 0, r2: 0, c1: 0, c2: 0 };
        this.repaintAll();
        ev.preventDefault();
      }
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.activateActive();
      return;
    }
    const corner = ev.ctrlKey || ev.metaKey;
    const rows = this.rowCount;
    const cols = this.columns.length;
    const page = Math.max(1, Math.floor(this.el.clientHeight / ROW_H));
    const d = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      PageDown: [page, 0],
      PageUp: [-page, 0],
      Home: corner ? [-rows, -cols] : [0, -cols],
      End: corner ? [rows, cols] : [0, cols]
    }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const r = Math.max(0, Math.min(rows - 1, this.active.r + d[0]));
    const c = Math.max(0, Math.min(cols - 1, this.active.c + d[1]));
    if (ev.shiftKey) this.extend(r, c);
    else {
      this.active = { r, c };
      this.anchor = { r, c };
      this.sel = { r1: r, r2: r, c1: c, c2: c };
      this.repaintAll();
    }
    this.scrollTo(r, c);
  }

  scrollTo(r, c) {
    const top = r * ROW_H;
    if (top < this.el.scrollTop) this.el.scrollTop = top;
    else if (top + ROW_H + HEAD_H > this.el.scrollTop + this.el.clientHeight) this.el.scrollTop = top + ROW_H + HEAD_H - this.el.clientHeight;
    const left = this.xs[c];
    if (left - INDEX_W < this.el.scrollLeft) this.el.scrollLeft = left - INDEX_W;
    else if (left + this.widths[c] > this.el.scrollLeft + this.el.clientWidth) this.el.scrollLeft = left + this.widths[c] - this.el.clientWidth;
  }

  selectionTsv() {
    if (!this.sel) return '';
    const lines = [];
    for (let r = this.sel.r1; r <= this.sel.r2; r++) {
      const idx = this.order ? this.order[r] : r;
      const row = this.cache.get(idx);
      const cells = [];
      for (let c = this.sel.c1; c <= this.sel.c2; c++) cells.push(row ? copyText(row[c]).replace(/[\t\r\n]+/g, ' ') : '');
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  onCopy(ev) {
    const text = this.selectionTsv();
    if (!text) return;
    ev.clipboardData.setData('text/plain', text);
    ev.preventDefault();
  }

  showError(v, anchor) {
    if (this.onError) this.onError(v, anchor);
  }

  openColumnMenu(c, anchor) {
    this.closeMenu();
    const col = this.columns[c];
    const tooLarge = this.rowCount > SORT_LIMIT;
    const item = (label, fn, blocked) => h('button', { class: 'menu-item', type: 'button', role: 'menuitem', 'aria-disabled': blocked ? true : null, onclick: () => {
      if (blocked) return;
      this.closeMenu();
      fn();
    } }, label);
    const menu = h('div', { class: 'menu', role: 'menu' },
      item(S.sortAscending, () => this.sortBy(c, 1), tooLarge),
      item(S.sortDescending, () => this.sortBy(c, -1), tooLarge),
      tooLarge ? h('div', { class: 'menu-label', role: 'presentation' }, S.sortTooLarge(this.integerFormat.format(this.rowCount))) : null,
      item(S.copyColumnName, () => navigator.clipboard && navigator.clipboard.writeText(col.name)));
    placeBelow(menu, anchor);
    this.menu = menu;
    this.menuOff = onOutside(menu, () => this.closeMenu());
    this.menuKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        this.closeMenu();
        anchor.focus();
      }
    };
    document.addEventListener('keydown', this.menuKey, true);
    menu.querySelector('button').focus();
  }

  closeMenu() {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
    }
    if (this.menuOff) this.menuOff();
    if (this.menuKey) document.removeEventListener('keydown', this.menuKey, true);
    this.menuKey = null;
  }

  async sortBy(c, dir) {
    if (this.rowCount > SORT_LIMIT) {
      if (this.onNotice) this.onNotice(S.sortTooLarge(this.integerFormat.format(this.rowCount)));
      return;
    }
    if (this.loader) {
      const pages = [];
      for (let s = 0; s < this.rowCount; s += PAGE) if (!this.cache.has(s)) pages.push(this.loader(s, PAGE).then((rows) => rows.forEach((r, i) => this.cache.set(s + i, r))));
      await Promise.all(pages);
    }
    const idx = Array.from({ length: this.rowCount }, (_, i) => i);
    const keys = idx.map((i) => sortKey(this.cache.get(i) ? this.cache.get(i)[c] : null));
    idx.sort((a, b) => dir * compareKeys(keys[a], keys[b]) || a - b);
    this.order = idx;
    this.sel = null;
    this.active = null;
    this.repaintAll();
  }

  destroy() {
    this.closeMenu();
  }
}
