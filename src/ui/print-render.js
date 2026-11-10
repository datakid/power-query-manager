import { h } from './dom.js';
import { S } from './strings.js';
import { cellDisplay } from './grid.js';
import { highlightLines } from './highlight.js';
import { pageGeometry, paginate, bandColumns } from '../core/print/layout.js';
import { wrapCodeLines, splitCodeText } from '../core/print/code-lines.js';
import { diffLines, hunkLines } from '../core/diff.js';

const mm = (u) => `${(u / 10).toFixed(2)}mm`;
const pt = (v) => `${v.toFixed(2)}pt`;

export const DEFAULT_PRINT = Object.freeze({
  paper: 'a4',
  orientation: 'portrait',
  margins: 'normal',
  rowsPerPage: null,
  scale: 100,
  repeatHeader: true,
  repeatTop: 0,
  repeatBottom: 0,
  columns: null,
  sticky: 0,
  head: true,
  foot: true,
  what: 'result'
});

const units = (scale) => {
  const sc = scale / 100;
  return { sc, row: Math.max(10, Math.round(55 * sc)), head: Math.round(100 * sc), title: Math.round(80 * sc), foot: Math.round(80 * sc), idx: Math.round(130 * sc), line: Math.max(10, Math.round(38 * sc)), minCol: Math.round(160 * sc), charW: 17.5 * sc };
};

function pageShell(geo, settings, u, label) {
  const page = h('section', { class: 'print-page', role: 'group', 'aria-label': label });
  page.style.width = mm(geo.width);
  page.style.height = mm(geo.height - 5);
  page.style.paddingTop = mm(geo.margin.top);
  page.style.paddingRight = mm(geo.margin.right);
  page.style.paddingBottom = mm(geo.margin.bottom);
  page.style.paddingLeft = mm(geo.margin.left);
  page.style.fontSize = pt(8.5 * u.sc);
  return page;
}

function runningHead(ctx, u, left, right) {
  if (!ctx.settings.head) return null;
  const el = h('header', { class: 'print-head' }, h('span', { class: 'ph-left' }, left), h('span', { class: 'ph-right' }, right || ''));
  el.style.height = mm(u.title);
  el.style.fontSize = pt(8 * u.sc);
  return el;
}

function runningFoot(ctx, u, n, total) {
  if (!ctx.settings.foot) return null;
  const el = h('footer', { class: 'print-foot' }, h('span', null, S.printPageOf(n, total)), h('span', null, S.printDate(ctx.date)), h('span', null, S.appName));
  el.style.height = mm(u.foot);
  el.style.fontSize = pt(8 * u.sc);
  return el;
}

function estimateWidth(table, c, u) {
  let chars = table.columns[c].name.length;
  const sample = Math.min(table.rows.length, 200);
  for (let r = 0; r < sample; r++) {
    const v = table.rows[r][c];
    const len = v === null || v === undefined ? 4 : typeof v === 'object' ? 8 : String(v).length;
    if (len > chars) chars = len;
  }
  return Math.max(u.minCol, Math.min(Math.round(900 * u.sc), Math.round((chars * 17 + 60) * u.sc)));
}

export function planTable(ctx) {
  const { table, settings, u } = ctx;
  const geo = ctx.geo;
  const included = (settings.columns || table.columns.map((_, i) => i)).filter((i) => i >= 0 && i < table.columns.length);
  const cols = included.map((c) => ({ index: c, name: table.columns[c].name, width: estimateWidth(table, c, u) }));
  const total = table.rowCount;
  const top = Math.min(settings.repeatTop, total);
  const bottom = Math.min(settings.repeatBottom, Math.max(0, total - top));
  const bodyCount = total - top - bottom;
  const bands = bandColumns({ columns: cols, pageWidth: geo.usableWidth, indexWidth: u.idx, stickyCount: settings.sticky, minColumnWidth: u.minCol });
  const pag = paginate({
    rowCount: bodyCount,
    rowHeight: u.row,
    headerHeight: u.head,
    repeatTop: top,
    repeatBottom: bottom,
    pageHeight: geo.usableHeight,
    titleHeight: settings.head ? u.title : 0,
    pageFooterHeight: settings.foot ? u.foot : 0,
    rowsPerPage: settings.rowsPerPage
  });
  let shrunk = 1;
  let tctx = ctx;
  if (pag.mode === 'fixed') {
    const need = pag.rowsPerPage + top + bottom;
    const avail = geo.usableHeight - (settings.head ? u.title : 0) - (settings.foot ? u.foot : 0) - u.head;
    shrunk = Math.min(1, avail / (need * u.row));
    if (shrunk < 1) tctx = { ...ctx, u: { ...u, row: Math.max(8, Math.floor(u.row * shrunk)), head: Math.max(20, Math.floor(u.head * shrunk)), sc: u.sc * shrunk } };
  }
  const builders = [];
  bands.forEach((band, bi) => {
    pag.pages.forEach((p) => {
      builders.push((n, totalPages) => tablePage({ ctx: tctx, cols, band, bi, bands, p, top, bottom, n, totalPages }));
    });
  });
  return { builders, pag, bands, cols, overflow: bands.filter((b) => b.overflow).map((b) => cols[b.own[0]].name), top, bottom, shrunk };
}

function tableEl(ctx, cols, band, u, widthUnits) {
  const t = h('table', { class: 'print-table' });
  t.style.width = mm(widthUnits);
  const colgroup = h('colgroup');
  const idx = h('col');
  idx.style.width = mm(u.idx);
  colgroup.append(idx);
  for (const ci of band.columns) {
    const col = h('col');
    col.style.width = mm(cols[ci].width);
    colgroup.append(col);
  }
  t.append(colgroup);
  return t;
}

function tablePage({ ctx, cols, band, bi, bands, p, top, bottom, n, totalPages }) {
  const { table, settings, u, geo, fmt } = ctx;
  const page = pageShell(geo, settings, u, S.printPageOf(n, totalPages));
  page.append(runningHead(ctx, u, `${ctx.fileName} · ${ctx.itemName}`, bands.length > 1 ? S.printBands(band.own[0] + 1, band.own[band.own.length - 1] + 1, cols.length) : '') || '');
  const showHeader = settings.repeatHeader || (bi === 0 && p.index === 0);
  const main = tableEl(ctx, cols, band, u, band.width);
  if (showHeader) {
    const hr = h('tr', { class: 'print-hrow' }, h('th', { class: 'pc pc-idx' }, S.printBodyMarker));
    for (const ci of band.columns) hr.append(h('th', { class: 'pc' }, cols[ci].name));
    hr.style.height = mm(u.head);
    main.append(h('thead', null, hr));
  }
  const row = (r, extra) => {
    const tr = h('tr', { class: extra || '' }, h('td', { class: 'pc pc-idx' }, String(r + 1)));
    for (const ci of band.columns) {
      const d = cellDisplay(table.rows[r][cols[ci].index], fmt.number);
      tr.append(h('td', { class: `pc ${d.cls}` }, d.text));
    }
    tr.style.height = mm(u.row);
    return tr;
  };
  const tbody = h('tbody');
  for (let r = 0; r < top; r++) tbody.append(row(r, 'print-rep'));
  for (let r = p.firstRow; r <= p.lastRow; r++) tbody.append(row(top + r));
  if (p.rows === 0 && table.rowCount === 0) {
    const empty = h('tr', null, h('td', { class: 'pc print-empty', colspan: String(band.columns.length + 1) }, S.emptyTable));
    empty.style.height = mm(u.row);
    tbody.append(empty);
  }
  main.append(tbody);
  page.append(main);
  if (bottom) {
    const bt = tableEl(ctx, cols, band, u, band.width);
    bt.classList.add('print-bottom');
    const bb = h('tbody');
    for (let r = table.rowCount - bottom; r < table.rowCount; r++) bb.append(row(r, 'print-rep'));
    bt.append(bb);
    page.append(bt);
  }
  page.append(runningFoot(ctx, u, n, totalPages) || '');
  return page;
}

function slicePieces(pieces, start, end) {
  const out = [];
  let at = start;
  for (const p of pieces) {
    if (p.end <= start || p.start >= end) continue;
    const s = Math.max(p.start, start);
    const e = Math.min(p.end, end);
    if (s > at) out.push({ cls: '', start: at, end: s });
    out.push({ cls: p.cls, start: s, end: e });
    at = e;
  }
  if (at < end) out.push({ cls: '', start: at, end });
  return out;
}

function segmentsOf(text, columns, language) {
  const lines = splitCodeText(text).map((l) => l.replace(/\t/g, '    '));
  const pieces = language ? highlightLines(lines.join('\n'), language) : [];
  const wrapped = wrapCodeLines({ lines, columns, tabWidth: 4 });
  const out = [];
  const cursor = new Map();
  for (const w of wrapped) {
    const from = cursor.get(w.number) || 0;
    cursor.set(w.number, from + w.text.length);
    const runs = language ? slicePieces(pieces[w.number - 1] || [], from, from + w.text.length) : [{ cls: '', start: from, end: from + w.text.length }];
    out.push({ gutter: w.continued ? '' : String(w.number), continued: w.continued, runs: runs.map((r) => ({ cls: r.cls, text: lines[w.number - 1].slice(r.start, r.end) })) });
  }
  return out;
}

function linePages({ ctx, title, entries, gutterChars, label }) {
  const { settings, u, geo } = ctx;
  const pag = paginate({ rowCount: entries.length, rowHeight: u.line, pageHeight: geo.usableHeight, titleHeight: settings.head ? u.title : 0, pageFooterHeight: settings.foot ? u.foot : 0 });
  const builders = pag.pages.map((p) => (n, totalPages) => {
    const page = pageShell(geo, settings, u, S.printPageOf(n, totalPages));
    page.append(runningHead(ctx, u, `${ctx.fileName} · ${title}`, label || '') || '');
    const body = h('div', { class: 'print-lines' });
    body.style.fontSize = pt(8 * u.sc);
    if (!entries.length) body.append(h('div', { class: 'print-empty' }, S.printEmptyCode));
    for (let i = p.firstRow; i <= p.lastRow && entries.length; i++) {
      const e = entries[i];
      const line = h('div', { class: `pl ${e.kind || ''}` }, ...e.gutters.map((g) => {
        const sp = h('span', { class: 'pg' }, g);
        sp.style.width = `${gutterChars}ch`;
        return sp;
      }), h('span', { class: `pt${e.continued ? ' pt-cont' : ''}` }, ...e.runs.map((r) => (r.cls ? h('span', { class: r.cls }, r.text) : r.text))));
      line.style.height = mm(u.line);
      body.append(line);
    }
    page.append(body);
    page.append(runningFoot(ctx, u, n, totalPages) || '');
    return page;
  });
  return { builders, pag };
}

export function planCode(ctx, items) {
  const { u, geo } = ctx;
  const gutterChars = 5;
  const columns = Math.max(20, Math.floor(geo.usableWidth / u.charW) - gutterChars - 1);
  const builders = [];
  let tooSmall = false;
  for (const it of items) {
    const segs = segmentsOf(it.text, columns, it.language);
    const entries = segs.map((s) => ({ gutters: [s.gutter], runs: s.runs, continued: s.continued }));
    const r = linePages({ ctx, title: it.name, entries, gutterChars });
    tooSmall = tooSmall || r.pag.tooSmall;
    builders.push(...r.builders);
  }
  return { builders, tooSmall };
}

export function planChanges(ctx, changes) {
  const { u, geo } = ctx;
  const gutterChars = 5;
  const columns = Math.max(20, Math.floor(geo.usableWidth / u.charW) - gutterChars * 2 - 4);
  const builders = [];
  const items = [...changes.queries].map(([name, c]) => ({ name, ...c })).concat([...changes.modules].map(([name, c]) => ({ name, ...c })));
  for (const it of items) {
    const rows = hunkLines(diffLines(it.original, it.current), 3);
    const entries = [];
    const mark = { add: '+', del: '−', same: ' ' };
    for (const r of rows) {
      if (r.kind === 'gap') {
        entries.push({ gutters: ['', ''], runs: [{ cls: '', text: S.diffGap(r.hidden) }], kind: 'diff-gap' });
        continue;
      }
      const wrapped = wrapCodeLines({ lines: [r.text], columns, tabWidth: 4 });
      wrapped.forEach((w, k) => {
        entries.push({ gutters: [k === 0 && r.a !== undefined ? String(r.a) : '', k === 0 && r.b !== undefined ? String(r.b) : ''], runs: [{ cls: '', text: `${k === 0 ? mark[r.kind] : ' '} ${w.text}` }], kind: `diff-${r.kind}`, continued: k > 0 });
      });
    }
    const r = linePages({ ctx, title: it.name, entries, gutterChars });
    builders.push(...r.builders);
  }
  return { builders, empty: items.length === 0 };
}

export function buildPlan({ settings, data, formats, context }) {
  const geo = pageGeometry(settings);
  const u = units(settings.scale);
  const ctx = { settings, geo, u, fmt: formats, table: data.table, fileName: context.fileName, itemName: context.itemName, date: context.date };
  const builders = [];
  const info = { rowsPerPage: null, mode: null, overflow: [], tooSmall: false, nothing: false, shrunk: 1 };
  const what = settings.what;
  if ((what === 'code' || what === 'both') && data.code.length) {
    const c = planCode(ctx, data.code);
    builders.push(...c.builders);
    info.tooSmall = info.tooSmall || c.tooSmall;
  }
  if ((what === 'result' || what === 'both') && data.table) {
    const t = planTable({ ...ctx, table: data.table });
    builders.push(...t.builders);
    info.rowsPerPage = t.pag.rowsPerPage;
    info.mode = t.pag.mode;
    info.overflow = t.overflow;
    info.shrunk = t.shrunk;
    info.tooSmall = info.tooSmall || t.pag.tooSmall;
  }
  if (what === 'changes') {
    const c = planChanges(ctx, data.changes);
    builders.push(...c.builders);
  }
  info.nothing = builders.length === 0;
  return { geo, builders, info };
}

export async function renderPlan(plan, stack, signal) {
  const total = plan.builders.length;
  for (let i = 0; i < total; i++) {
    if (signal && signal.cancelled) return false;
    stack.append(plan.builders[i](i + 1, total));
    if (i > 0 && i % 25 === 0) await new Promise((r) => requestAnimationFrame(r));
  }
  return true;
}
