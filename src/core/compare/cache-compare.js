import { kindOf, cell, force, splitDateTime, daysFromYmd, TICKS_PER_DAY } from '../m/values.js';

const OA_EPOCH = daysFromYmd(1899, 12, 30);

function epochMsOfValue(v) {
  const k = kindOf(v);
  if (k === 'date') return (v.days - OA_EPOCH) * 86400000;
  if (k === 'datetime' || k === 'datetimezone') {
    const p = splitDateTime(v.ticks);
    return (p.days - OA_EPOCH) * 86400000 + p.time / 10000;
  }
  if (k === 'time') return v.ticks / 10000;
  return null;
}

export function sameCell(value, cached) {
  const empty = cached === null || cached === undefined;
  if (value === null || value === undefined) return empty;
  if (empty) return false;
  const k = kindOf(value);
  switch (cached.t) {
    case 'n':
      return k === 'number' && Math.abs(value - cached.v) <= 1e-9 * Math.max(1, Math.abs(value), Math.abs(cached.v));
    case 's':
      return k === 'text' && value === cached.v;
    case 'b':
      return k === 'logical' && value === cached.v;
    case 'e':
      return false;
    case 'dt':
    case 'dur': {
      const ms = epochMsOfValue(value);
      if (ms !== null) return Math.abs(ms - cached.v * 86400000) <= 1000;
      if (k === 'duration') return Math.abs(Number(value.ticks) / Number(TICKS_PER_DAY) - cached.v) * 86400 <= 1;
      return false;
    }
    default:
      return false;
  }
}

export function compareWithCache(table, cached, limit = 1000) {
  if (table.columns.length !== cached.columns.length || table.columns.some((n, i) => n !== cached.columns[i])) {
    return { matches: false, reason: 'columns', count: 0, diffs: [] };
  }
  if (table.rowCount !== cached.rows.length) return { matches: false, reason: 'rows', count: 0, diffs: [], got: table.rowCount, expected: cached.rows.length };
  const diffs = [];
  let count = 0;
  for (let r = 0; r < table.rowCount; r++) {
    for (let c = 0; c < table.columns.length; c++) {
      let v;
      try {
        v = cell(force(table.cols[c][r]));
      } catch {
        v = Symbol('error');
      }
      const ok = typeof v === 'symbol' ? false : sameCell(v, cached.rows[r][c]);
      if (!ok) {
        count++;
        if (diffs.length < limit) diffs.push([r, c]);
      }
    }
  }
  return { matches: count === 0, count, diffs };
}
