import { utf8Encode } from '../bytes.js';
import { kindOf, MList, MRecord, MTable } from '../m/values.js';
import { cellValue, exportText } from './cells.js';
import { getCulture } from '../m/culture.js';

function toJson(v, c, depth) {
  const k = kindOf(v);
  if (k === 'null' || k === 'logical' || k === 'text') return v;
  if (k === 'number') return Number.isFinite(v) ? v : String(v);
  if (depth > 6) return exportText(v, c);
  if (v instanceof MList) return v.toArray().map((x) => toJson(x, c, depth + 1));
  if (v instanceof MRecord) {
    const o = new Map();
    for (const n of v.names) o.set(n, toJson(v.get(n), c, depth + 1));
    return o;
  }
  if (v instanceof MTable) return tableRows(v, c, depth + 1);
  return exportText(v, c);
}

function tableRows(table, c, depth) {
  const rows = [];
  for (let r = 0; r < table.rowCount; r++) {
    const o = new Map();
    table.columns.forEach((n, ci) => {
      const cv = cellValue(table.cols[ci][r]);
      o.set(n, cv.ok ? toJson(cv.v, c, depth) : { error: cv.error.reason, message: cv.error.mMessage });
    });
    rows.push(o);
  }
  return rows;
}

function stringify(v) {
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${JSON.stringify(k)}:${stringify(x)}`).join(',')}}`;
  if (Array.isArray(v)) return `[${v.map(stringify).join(',')}]`;
  return JSON.stringify(v);
}

export function tableToJson(table, culture = 'en-US') {
  return utf8Encode(stringify(tableRows(table, getCulture(culture), 0)));
}

export function valueToJson(v, culture = 'en-US') {
  return utf8Encode(stringify(toJson(v, getCulture(culture), 0)));
}
