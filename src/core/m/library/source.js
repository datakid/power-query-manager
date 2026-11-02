import {
  MTable, MList, MRecord, MFunction, CellError, MError, expressionError, formatError, sourceError, T, MType, listOf, mkBinary, mkDateTime, mkDuration, joinDateTime,
  daysFromYmd, tableFromRows, cell, force, kindOf
} from '../values.js';
import { RT, NeedBinding } from '../runtime.js';
import { def, defValue, asList, asText, asTable, textList } from './core.js';
import { mk, rowsToTable } from './table.js';
import { serialToEpochDays } from '../snapshot-values.js';
import { base64Decode, base64Encode, decodeTextBytes, utf8Encode, utf8Decode } from '../../bytes.js';

defValue('BinaryEncoding.Base64', 0);
defValue('BinaryEncoding.Hex', 1);

export function snapshotCellToM(c) {
  if (c === null || c === undefined) return null;
  switch (c.t) {
    case 's':
      return c.v;
    case 'n':
      return c.v;
    case 'b':
      return c.v;
    case 'e':
      return new CellError(new MError('Expression.Error', c.v, c.v));
    case 'dt':
      return serialToEpochDays(c.v, RT.snapshot ? RT.snapshot.date1904 : false, 'datetime');
    case 'dur':
      return mkDuration(BigInt(Math.round(c.v * 864000000000)));
    case 'iso':
      return serialToEpochDays(c.v, false, 'iso');
    default:
      return null;
  }
}

function tableFromSource(src, useHeaders = true) {
  const cols = src.columns.map((_, ci) => src.rows.map((row) => snapshotCellToM(row[ci])));
  return mk([...src.columns], src.columns.map(() => T.any), cols, src.rows.length);
}

def('Excel.CurrentWorkbook', [], () => {
  const snap = RT.snapshot;
  if (!snap) throw sourceError('Excel.CurrentWorkbook is not available: no workbook is loaded.');
  const rows = snap.sources.map((s) => {
    if (RT.useUpstream && s.queryLoaded && RT.evalMember && RT.hasMember(s.name)) return [RT.lazyMember(s.name), s.name];
    return [tableFromSource(s), s.name];
  });
  return rowsToTable(['Content', 'Name'], [T.table, T.text], rows);
});

function bindingFor(kind, key) {
  const b = RT.bindings.get(key);
  if (!b) throw new NeedBinding(kind, key);
  return b;
}

def('File.Contents', ['path', '?options'], (path) => {
  const b = bindingFor('file', path);
  return { ...mkBinary(b.bytes), name: path, workbook: b.workbook || null };
});
def('Web.Contents', ['url', '?options'], (url) => {
  const b = bindingFor('web', url);
  return { ...mkBinary(b.bytes), name: url, workbook: b.workbook || null };
});
def('Binary.Buffer', ['binary'], (b) => b);
def('Binary.Length', ['binary'], (b) => (b === null ? null : b.bytes.length));
def('Binary.Range', ['binary', 'offset', '?count'], (b, o, n) => mkBinary(b.bytes.slice(o, n === undefined ? undefined : o + n)));
def('Binary.Combine', ['binaries'], (l) => {
  const parts = asList(l).toArray().map((x) => x.bytes);
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return mkBinary(out);
});
def('Binary.FromText', ['text', '?encoding'], (t, enc) => {
  if (t === null) return null;
  if (enc === 1) {
    const clean = t.replace(/\s/g, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return mkBinary(out);
  }
  try {
    return mkBinary(base64Decode(t));
  } catch {
    throw formatError("We couldn't convert the text to binary.", t);
  }
});
def('Binary.ToText', ['binary', '?encoding'], (b, enc) => (enc === 1 ? [...b.bytes].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase() : base64Encode(b.bytes)));
def('Binary.FromList', ['list'], (l) => mkBinary(Uint8Array.from(asList(l).toArray())));
def('#binary', ['value'], (v) => (typeof v === 'string' ? mkBinary(base64Decode(v)) : mkBinary(Uint8Array.from(asList(v).toArray()))));
def('Text.ToBinary', ['text', '?encoding'], (t, enc) => mkBinary(encodeText(t, enc)));

function decodeBinary(bytes, encoding) {
  if (encoding === 1200) return new TextDecoder('utf-16le').decode(bytes[0] === 0xFF && bytes[1] === 0xFE ? bytes.subarray(2) : bytes);
  if (encoding === 1252 || encoding === 20127) return new TextDecoder('windows-1252').decode(bytes);
  return decodeTextBytes(bytes).text;
}

function encodeText(t, enc) {
  if (enc === 1200) {
    const out = new Uint8Array(t.length * 2);
    for (let i = 0; i < t.length; i++) {
      out[i * 2] = t.charCodeAt(i) & 0xFF;
      out[i * 2 + 1] = t.charCodeAt(i) >> 8;
    }
    return out;
  }
  return utf8Encode(t);
}

def('Text.FromBinary', ['binary', '?encoding'], (b, enc) => (b === null ? null : decodeBinary(b.bytes, enc)));
def('Lines.FromBinary', ['binary', '?quoteStyle', '?includeLineSeparators', '?encoding'], (b, q, inc, enc) => listOf(splitLines(decodeBinary(b.bytes, enc), inc === true)));
def('Lines.FromText', ['text', '?quoteStyle', '?includeLineSeparators'], (t, q, inc) => listOf(splitLines(t, inc === true)));
def('Lines.ToText', ['lines', '?lineSeparator'], (l, sep) => asList(l).toArray().join(sep === undefined || sep === null ? '\r\n' : sep));

function splitLines(text, keep) {
  const out = [];
  const re = /\r\n|\r|\n/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    out.push(keep ? text.slice(last, re.lastIndex) : text.slice(last, m.index));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function parseCsv(text, delimiter, quote) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let sawQuote = false;
  let i = 0;
  const n = text.length;
  const endField = () => {
    row.push(field === '' && !sawQuote ? null : field);
    field = '';
    sawQuote = false;
  };
  while (i < n) {
    const ch = text[i];
    if (quote && quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (quote && ch === '"' && field === '') {
      quoted = true;
      sawQuote = true;
      i++;
      continue;
    }
    if (text.startsWith(delimiter, i)) {
      endField();
      i += delimiter.length;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endField();
      rows.push(row);
      row = [];
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length || sawQuote) {
    endField();
    rows.push(row);
  }
  return rows;
}

def('Csv.Document', ['source', '?columns', '?delimiter', '?extraValues', '?encoding'], (src, columns, delimiter, extra, encoding) => {
  let opts = { delimiter: ',', columns: null, encoding: 65001, quote: true };
  if (columns instanceof MRecord) {
    opts = {
      delimiter: columns.getOr('Delimiter', ','),
      columns: columns.getOr('Columns', null),
      encoding: columns.getOr('Encoding', 65001),
      quote: columns.getOr('QuoteStyle', 1) !== 0
    };
  } else {
    opts = { delimiter: delimiter || ',', columns: columns === undefined ? null : columns, encoding: encoding || 65001, quote: true };
  }
  const bytes = kindOf(src) === 'binary' ? src.bytes : utf8Encode(asText(src));
  const text = decodeBinary(bytes, opts.encoding);
  const rows = parseCsv(text, opts.delimiter, opts.quote);
  let names;
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (opts.columns instanceof MList) names = textList(opts.columns);
  else if (typeof opts.columns === 'number') names = Array.from({ length: opts.columns }, (_, i) => `Column${i + 1}`);
  else names = Array.from({ length: width }, (_, i) => `Column${i + 1}`);
  return rowsToTable(names, names.map(() => T.any), rows.map((r) => names.map((_, i) => (i < r.length ? r[i] : null))));
});

function jsonToM(v) {
  if (v === null) return null;
  if (Array.isArray(v)) return listOf(v.map(jsonToM));
  if (typeof v === 'object') {
    const names = Object.keys(v);
    return new MRecord(names, names.map((k) => jsonToM(v[k])));
  }
  return v;
}

def('Json.Document', ['jsonText', '?encoding'], (src) => {
  const text = kindOf(src) === 'binary' ? decodeBinary(src.bytes, 65001) : asText(src);
  try {
    return jsonToM(JSON.parse(text));
  } catch (e) {
    throw formatError('Json.Document could not parse the input.', String(e.message));
  }
});
def('Json.FromValue', ['value', '?encoding'], (v) => mkBinary(utf8Encode(JSON.stringify(mToJson(v)))));
function mToJson(v) {
  const k = kindOf(v);
  if (k === 'list') return v.toArray().map(mToJson);
  if (k === 'record') return Object.fromEntries(v.names.map((n) => [n, mToJson(v.get(n))]));
  if (k === 'table') return Array.from({ length: v.rowCount }, (_, r) => mToJson(v.rowRecord(r)));
  if (k === 'null' || k === 'number' || k === 'text' || k === 'logical') return v;
  return String(v);
}

def('Excel.Workbook', ['workbook', '?useHeaders', '?delayTypes'], (wbBin, useHeaders) => {
  const data = wbBin && wbBin.workbook;
  if (!data) throw sourceError('The binary is not a readable Excel workbook.', wbBin && wbBin.name);
  const rows = data.items.map((it) => {
    let table = tableFromSource({ columns: it.columns, rows: it.rows });
    if (useHeaders === true && it.kind !== 'Table' && table.rowCount) {
      const names = table.cols.map((c, i) => {
        const v = cell(c[0]);
        return typeof v === 'string' && v ? v : `Column${i + 1}`;
      });
      table = mk(names, names.map(() => T.any), table.cols.map((c) => c.slice(1)), table.rowCount - 1);
    }
    return [it.name, table, it.item, it.kind, it.hidden === true];
  });
  return rowsToTable(['Name', 'Data', 'Item', 'Kind', 'Hidden'], [T.text, T.table, T.text, T.text, T.logical], rows);
}, 'full');

def('#table', ['columns', 'rows'], (cols, rows) => {
  const list = asList(rows).toArray().map((r) => asList(r).items);
  let names;
  let types;
  if (cols instanceof MType) {
    names = cols.columns.map((c) => c.name);
    types = cols.columns.map((c) => c.type);
  } else if (typeof cols === 'number') {
    names = Array.from({ length: cols }, (_, i) => `Column${i + 1}`);
    types = names.map(() => T.any);
  } else {
    names = textList(cols);
    types = names.map(() => T.any);
  }
  for (const r of list) if (r.length > names.length) throw expressionError('There were more elements in the row than columns.', r.length);
  return rowsToTable(names, types, list.map((r) => names.map((_, i) => (i < r.length ? r[i] : null))));
});

export { MList, MFunction, mkDateTime, joinDateTime, daysFromYmd, tableFromRows, asTable, utf8Decode };
