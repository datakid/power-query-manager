import { utf8Encode, concat } from '../bytes.js';
import { kindOf } from '../m/values.js';
import { cellValue, exportText } from './cells.js';
import { getCulture } from '../m/culture.js';

const NEEDS_GUARD = /^[=+\-@\t\r]/;

function quote(text, delimiter) {
  if (text === '' || /["\r\n]/.test(text) || text.includes(delimiter) || /^\s|\s$/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function tableToDelimited(table, { delimiter = ',', bom = false, guard = true, culture = 'en-US', invariantNumbers = true } = {}) {
  const c = getCulture(invariantNumbers ? 'en-US' : culture);
  const lines = [];
  lines.push(table.columns.map((n) => quote(guardText(n, guard), delimiter)).join(delimiter));
  for (let r = 0; r < table.rowCount; r++) {
    const fields = new Array(table.columns.length);
    for (let ci = 0; ci < fields.length; ci++) {
      const cv = cellValue(table.cols[ci][r]);
      if (!cv.ok) {
        fields[ci] = 'Error';
        continue;
      }
      const v = cv.v;
      let text = exportText(v, c);
      if (kindOf(v) === 'text') text = guardText(text, guard);
      fields[ci] = v === null ? '' : quote(text, delimiter);
    }
    lines.push(fields.join(delimiter));
  }
  const body = utf8Encode(`${lines.join('\r\n')}\r\n`);
  return bom ? concat([new Uint8Array([0xEF, 0xBB, 0xBF]), body]) : body;
}

function guardText(text, guard) {
  return guard && NEEDS_GUARD.test(text) ? `'${text}` : text;
}
