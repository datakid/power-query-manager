import { QuoinError } from './errors.js';
import { parseXml, streamSheetCells, readSharedStrings } from './xml.js';
import { readRelationships } from './opc.js';
import { classifyFormat } from './numfmt.js';

export function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function indexToCol(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseCellRef(ref) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: colToIndex(m[1]), row: Number(m[2]) - 1 };
}

export function parseRange(text) {
  const clean = text.replace(/\$/g, '');
  const parts = clean.split(':');
  const a = parseCellRef(parts[0]);
  const b = parseCellRef(parts[parts.length - 1]);
  if (!a || !b) return null;
  return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) };
}

async function loadStyles(wb) {
  if (wb.stylesCache) return wb.stylesCache;
  const part = wb.pkg.resolve('xl/styles.xml');
  const out = { xfFormat: [] };
  if (part) {
    const t = await wb.pkg.text(part);
    const doc = parseXml(t.text, part);
    const codes = new Map();
    const nf = doc.root.child('numFmts');
    if (nf) for (const el of nf.childrenNamed('numFmt')) codes.set(Number(el.attr('numFmtId')), el.attr('formatCode'));
    const xfs = doc.root.child('cellXfs');
    if (xfs) {
      for (const xf of xfs.childrenNamed('xf')) {
        const id = Number(xf.attr('numFmtId') || 0);
        out.xfFormat.push(classifyFormat(id, codes.get(id)));
      }
    }
  }
  wb.stylesCache = out;
  return out;
}

async function loadSharedStrings(wb) {
  if (wb.sstCache) return wb.sstCache;
  const part = wb.pkg.resolve('xl/sharedStrings.xml');
  if (!part) {
    wb.sstCache = [];
    return wb.sstCache;
  }
  const t = await wb.pkg.text(part);
  wb.sstCache = readSharedStrings(t.text, part);
  return wb.sstCache;
}

function convertCell(cell, sst, styles) {
  const raw = cell.value;
  switch (cell.type) {
    case 's': {
      const idx = Number(raw);
      return { t: 's', v: Number.isInteger(idx) && idx >= 0 && idx < sst.length ? sst[idx] : '' };
    }
    case 'str':
    case 'inlineStr':
      return { t: 's', v: raw === null ? '' : raw };
    case 'b':
      return { t: 'b', v: raw === '1' };
    case 'e':
      return { t: 'e', v: raw || '#VALUE!' };
    case 'd':
      return { t: 'iso', v: raw };
    default: {
      if (raw === null || raw === '') return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return { t: 's', v: raw };
      const kind = styles.xfFormat[cell.style] || 'number';
      if (kind === 'datetime') return { t: 'dt', v: n };
      if (kind === 'duration') return { t: 'dur', v: n };
      return { t: 'n', v: n };
    }
  }
}

export async function readRange(wb, sheetName, range) {
  const sheet = wb.sheets.find((s) => s.name === sheetName);
  if (!sheet || !sheet.part) throw new QuoinError('cells.sheet', sheetName);
  const t = await wb.pkg.text(sheet.part);
  const sst = await loadSharedStrings(wb);
  const styles = await loadStyles(wb);
  const rows = range.r2 - range.r1 + 1;
  const cols = range.c2 - range.c1 + 1;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  streamSheetCells(
    t.text,
    (cell) => {
      const p = parseCellRef(cell.ref);
      if (!p || p.row < range.r1 || p.row > range.r2 || p.col < range.c1 || p.col > range.c2) return;
      grid[p.row - range.r1][p.col - range.c1] = convertCell(cell, sst, styles);
    },
    sheet.part
  );
  return grid;
}

export async function readTable(wb, table) {
  const range = parseRange(table.ref);
  if (!range) throw new QuoinError('cells.ref', table.ref);
  const grid = await readRange(wb, table.sheet, range);
  const header = table.headerRowCount > 0 ? 1 : 0;
  const body = grid.slice(header, grid.length - table.totalsRowCount);
  let names = table.columns;
  if (!names || !names.length) names = grid[0].map((c, i) => (c && c.t === 's' ? c.v : `Column${i + 1}`));
  return { columns: names, rows: body };
}

function singleRangeFromName(def) {
  const m = /^(?:'((?:[^']|'')+)'|([^!']+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)$/.exec(def.ref);
  if (!m) return null;
  const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2];
  const range = parseRange(m[3]);
  return range ? { sheet, range } : null;
}

export function listCurrentWorkbookSources(wb) {
  const out = [];
  for (const t of wb.tables) out.push({ name: t.displayName, kind: 'table', table: t });
  for (const d of wb.definedNames) {
    if (d.localSheetId !== null && d.localSheetId !== undefined) continue;
    if (d.hidden || d.name.startsWith('_xlnm.')) continue;
    const target = singleRangeFromName(d);
    if (target) out.push({ name: d.name, kind: 'name', target });
  }
  return out;
}

export async function readSource(wb, source) {
  if (source.kind === 'table') return readTable(wb, source.table);
  const grid = await readRange(wb, source.target.sheet, source.target.range);
  const width = grid.length ? grid[0].length : 0;
  return { columns: Array.from({ length: width }, (_, i) => `Column${i + 1}`), rows: grid };
}

export async function readCachedQueryTable(wb, query) {
  if (query.load.kind !== 'table') return null;
  const table = wb.tables.find((t) => t.displayName === query.load.tableName && t.sheet === query.load.sheet);
  return table ? readTable(wb, table) : null;
}

export { readRelationships };

export async function readUsedGrid(wb, sheetName) {
  const sheet = wb.sheets.find((s) => s.name === sheetName);
  if (!sheet || !sheet.part) throw new QuoinError('cells.sheet', sheetName);
  const t = await wb.pkg.text(sheet.part);
  const sst = await loadSharedStrings(wb);
  const styles = await loadStyles(wb);
  const cells = [];
  let maxR = -1;
  let maxC = -1;
  streamSheetCells(
    t.text,
    (cell) => {
      const p = parseCellRef(cell.ref);
      if (!p) return;
      const v = convertCell(cell, sst, styles);
      if (v === null) return;
      cells.push([p.row, p.col, v]);
      if (p.row > maxR) maxR = p.row;
      if (p.col > maxC) maxC = p.col;
    },
    sheet.part
  );
  const grid = Array.from({ length: maxR + 1 }, () => new Array(maxC + 1).fill(null));
  for (const [r, c, v] of cells) grid[r][c] = v;
  return grid;
}
