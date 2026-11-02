import { MRecord, MList, MTable, MFunction, MType, force, cell, expressionError, kindOf, T, FACETS, prim, listOf, typeOfValue, conforms, valuesEqual, compareValues, tableFromRows, nullable, typeName } from '../values.js';
import { RT } from '../runtime.js';
import { LIB, def, defGetter, defType, defValue, facetType, asRecord, asList, asText, asFn, asTable, call, isNull, textList, unsupported } from './core.js';
import { currentCulture, cultureArg, convertToType, toText, toNumber, toLogical, parseDateText } from '../convert.js';
import { parseNumberText } from '../culture.js';
import { cannotConvert } from '../eval.js';

const ENUMS = {
  'RoundingMode.Down': 0, 'RoundingMode.Up': 1, 'RoundingMode.TowardZero': 2, 'RoundingMode.AwayFromZero': 3, 'RoundingMode.ToEven': 4,
  'Order.Ascending': 0, 'Order.Descending': 1,
  'JoinKind.Inner': 0, 'JoinKind.LeftOuter': 1, 'JoinKind.RightOuter': 2, 'JoinKind.FullOuter': 3, 'JoinKind.LeftAnti': 4, 'JoinKind.RightAnti': 5,
  'MissingField.Error': 0, 'MissingField.Ignore': 1, 'MissingField.UseNull': 2,
  'ExtraValues.List': 0, 'ExtraValues.Error': 1, 'ExtraValues.Ignore': 2,
  'QuoteStyle.None': 0, 'QuoteStyle.Csv': 1,
  'Occurrence.First': 0, 'Occurrence.Last': 1, 'Occurrence.All': 2,
  'GroupKind.Local': 0, 'GroupKind.Global': 1,
  'JoinAlgorithm.Dynamic': 0, 'JoinAlgorithm.PairwiseHash': 1, 'JoinAlgorithm.SortMerge': 2, 'JoinAlgorithm.LeftHash': 3, 'JoinAlgorithm.RightHash': 4, 'JoinAlgorithm.LeftIndex': 5, 'JoinAlgorithm.RightIndex': 6,
  'TextEncoding.Utf8': 65001, 'TextEncoding.Windows': 1252, 'TextEncoding.Utf16': 1200, 'TextEncoding.Ascii': 20127,
  'Day.Sunday': 0, 'Day.Monday': 1, 'Day.Tuesday': 2, 'Day.Wednesday': 3, 'Day.Thursday': 4, 'Day.Friday': 5, 'Day.Saturday': 6,
  'ByteOrder.LittleEndian': 1, 'ByteOrder.BigEndian': 0,
  'Precision.Double': 0, 'Precision.Decimal': 1
};
for (const [k, v] of Object.entries(ENUMS)) defValue(k, v);
defGetter('Culture.Current', () => (RT.culture ? RT.culture.name : 'en-US'));

for (const name of Object.keys(FACETS)) defType(name, facetType(name));
defType('Any.Type', T.any);
defType('None.Type', T.none);
defType('Null.Type', T.null);
for (const [n, t] of [['Text', 'text'], ['Number', 'number'], ['Logical', 'logical'], ['Date', 'date'], ['DateTime', 'datetime'], ['DateTimeZone', 'datetimezone'], ['Time', 'time'], ['Duration', 'duration'], ['Binary', 'binary'], ['List', 'list'], ['Record', 'record'], ['Table', 'table'], ['Function', 'function'], ['Type', 'type']]) defType(`${n}.Type`, T[t]);

export function comparerFn(c) {
  if (c === undefined || c === null) return (a, b) => compareValues(a, b);
  const f = asFn(c);
  return (a, b) => Number(f.invoke([a, b]));
}

def('Comparer.Ordinal', ['x', 'y'], (x, y) => compareValues(x, y));
def('Comparer.OrdinalIgnoreCase', ['x', 'y'], (x, y) => compareValues(typeof x === 'string' ? x.toLowerCase() : x, typeof y === 'string' ? y.toLowerCase() : y));
def('Comparer.FromCulture', ['culture', '?ignoreCase'], (culture, ic) => {
  const collator = new Intl.Collator(cultureArg(culture).name, { sensitivity: ic ? 'accent' : 'variant' });
  return new MFunction({ name: 'Comparer', params: [{ name: 'x' }, { name: 'y' }], fn: ([a, b]) => {
    a = cell(force(a));
    b = cell(force(b));
    if (typeof a === 'string' && typeof b === 'string') return Math.sign(collator.compare(a, b));
    return compareValues(a, b);
  } });
});

def('Replacer.ReplaceText', ['text', 'old', 'new'], (text, o, n) => (text === null ? null : text.split(o).join(n)));
def('Replacer.ReplaceValue', ['value', 'old', 'new'], (v, o, n) => (valuesEqual(v, o) ? n : v));

def('Value.Is', ['value', 'type'], (v, t) => conforms(v, t));
def('Value.Type', ['value'], (v) => typeOfValue(v));
def('Value.Equals', ['a', 'b', '?comparer'], (a, b, c) => (c ? comparerFn(c)(a, b) === 0 : valuesEqual(a, b)));
def('Value.Compare', ['a', 'b', '?comparer'], (a, b, c) => Math.sign(comparerFn(c)(a, b)));
def('Value.Metadata', ['value'], (v) => (v && v.meta ? v.meta : new MRecord([], [])));
def('Value.RemoveMetadata', ['value', '?meta'], (v) => {
  if (v && v.meta) {
    const c = Object.create(Object.getPrototypeOf(v));
    Object.assign(c, v);
    c.meta = null;
    return c;
  }
  return v;
});
def('Value.ReplaceType', ['value', 'type'], (v, t) => {
  if (v instanceof MTable && t.tk === 'table') {
    const types = v.columns.map((n) => {
      const col = t.columns.find((c) => c.name === n);
      return col ? col.type : T.any;
    });
    const out = new MTable(v.columns, types, v.cols, v.rowCount, v.keys);
    return out;
  }
  return v;
});
def('Value.FromText', ['text', '?culture'], (text, culture) => {
  if (text === null) return null;
  const c = cultureArg(culture);
  const t = text.trim();
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  const n = parseNumberText(t, c);
  if (n !== undefined && n !== null) return n;
  const d = parseDateText(t, c);
  if (d) return convertToType(t, d.time === null ? T.date : d.days === null ? T.time : T.datetime, c);
  return text;
});

def('Logical.From', ['value'], (v) => toLogical(v));
def('Logical.FromText', ['text'], (t) => toLogical(t));
def('Logical.ToText', ['logical'], (v) => (v === null ? null : v ? 'true' : 'false'));

def('Type.Is', ['a', 'b'], (a, b) => {
  if (b.tk === 'primitive' && (b.name === 'any' || (b.name === a.name && (b.nullable || !a.nullable)))) return true;
  return a === b;
});
def('Type.ListItem', ['type'], (t) => {
  if (t.tk !== 'list') throw expressionError('Expected a list type.', t);
  return t.item || T.any;
});
def('Type.TableSchema', ['type'], (t) => schemaTable(t.columns || []));
def('Type.NonNullable', ['type'], (t) => (t.nullable && t.name !== 'any' ? Object.assign(Object.create(Object.getPrototypeOf(t)), t, { nullable: false }) : t));
def('Type.IsNullable', ['type'], (t) => !!t.nullable);

export function typeKindName(t) {
  return t.tk === 'primitive' ? t.name : t.tk;
}

function typeTitle(t) {
  if (t.tk === 'primitive' && t.facet) {
    const m = { int64: 'Int64.Type', int32: 'Int32.Type', int16: 'Int16.Type', int8: 'Int8.Type', byte: 'Byte.Type', single: 'Single.Type', double: 'Double.Type', decimal: 'Decimal.Type', currency: 'Currency.Type', percentage: 'Percentage.Type' };
    return m[t.facet];
  }
  const n = typeKindName(t);
  return `${n[0].toUpperCase()}${n.slice(1)}.Type`;
}

export function schemaTable(columns) {
  const rows = columns.map((c, i) => [c.name, i, typeTitle(c.type), typeKindName(c.type), !!c.type.nullable, null, null, null, null, null, null, null, null]);
  return tableFromRows(['Name', 'Position', 'TypeName', 'Kind', 'IsNullable', 'NumericPrecisionBase', 'NumericPrecision', 'NumericScale', 'DateTimePrecision', 'MaxLength', 'IsVariableLength', 'NativeTypeName', 'NativeDefaultExpression'], rows);
}

function fieldsArg(v) {
  return textList(v);
}

function missingHandler(mode, name) {
  if (mode === 1) return 'ignore';
  if (mode === 2) return 'null';
  throw expressionError(`The field '${name}' of the record wasn't found.`, name);
}

def('Record.Field', ['record', 'field'], (r, f) => asRecord(r).get(f));
def('Record.FieldOrDefault', ['record', 'field', '?default'], (r, f, d) => asRecord(r).getOr(f, d === undefined ? null : d));
def('Record.FieldNames', ['record'], (r) => listOf([...asRecord(r).names]));
def('Record.FieldValues', ['record'], (r) => listOf([...asRecord(r).entries]));
def('Record.FieldCount', ['record'], (r) => asRecord(r).names.length);
def('Record.HasFields', ['record', 'fields'], (r, f) => fieldsArg(f).every((n) => asRecord(r).has(n)));
def('Record.AddField', ['record', 'name', 'value', '?delayed'], (r, n, v) => {
  asRecord(r);
  if (r.has(n)) throw expressionError(`The field '${n}' already exists in the record.`, n);
  return new MRecord([...r.names, n], [...r.entries, v]);
});
def('Record.RemoveFields', ['record', 'fields', '?missingField'], (r, f, mf) => {
  asRecord(r);
  const rm = new Set(fieldsArg(f));
  for (const n of rm) if (!r.has(n)) missingHandler(mf, n);
  const idx = r.names.map((n, i) => i).filter((i) => !rm.has(r.names[i]));
  return new MRecord(idx.map((i) => r.names[i]), idx.map((i) => r.entries[i]));
});
def('Record.RenameFields', ['record', 'renames', '?missingField'], (r, renames, mf) => {
  asRecord(r);
  const pairs = asList(renames).toArray();
  const list = pairs.length && !(pairs[0] instanceof MList) ? [pairs] : pairs;
  const names = [...r.names];
  for (const p of list) {
    const [from, to] = p.toArray();
    const i = names.indexOf(from);
    if (i < 0) {
      missingHandler(mf, from);
      continue;
    }
    names[i] = to;
  }
  return new MRecord(names, [...r.entries]);
});
def('Record.SelectFields', ['record', 'fields', '?missingField'], (r, f, mf) => {
  asRecord(r);
  const names = [];
  const entries = [];
  for (const n of fieldsArg(f)) {
    if (!r.has(n)) {
      if (missingHandler(mf, n) === 'null') {
        names.push(n);
        entries.push(null);
      }
      continue;
    }
    names.push(n);
    entries.push(r.entries[r.indexOf(n)]);
  }
  return new MRecord(names, entries);
});
def('Record.ReorderFields', ['record', 'order', '?missingField'], (r, order) => {
  asRecord(r);
  const first = fieldsArg(order).filter((n) => r.has(n));
  const rest = r.names.filter((n) => !first.includes(n));
  const all = [...first, ...rest];
  return new MRecord(all, all.map((n) => r.entries[r.indexOf(n)]));
});
def('Record.TransformFields', ['record', 'transformOperations', '?missingField'], (r, ops, mf) => {
  asRecord(r);
  const list = asList(ops).toArray();
  const pairs = list.length && !(list[0] instanceof MList) ? [list] : list;
  const entries = [...r.entries];
  for (const p of pairs) {
    const [n, f] = p.toArray();
    const i = r.indexOf(n);
    if (i < 0) {
      missingHandler(mf, n);
      continue;
    }
    entries[i] = call(f, r.get(n));
  }
  return new MRecord([...r.names], entries);
});
def('Record.Combine', ['records'], (list) => {
  const names = [];
  const entries = [];
  for (const r of asList(list).toArray()) {
    asRecord(r);
    r.names.forEach((n, i) => {
      const at = names.indexOf(n);
      if (at >= 0) entries[at] = r.entries[i];
      else {
        names.push(n);
        entries.push(r.entries[i]);
      }
    });
  }
  return new MRecord(names, entries);
});
def('Record.FromList', ['list', 'fields'], (values, fields) => {
  const vals = asList(values).items;
  const names = fields instanceof MType ? (fields.fields || []).map((f) => f.name) : fieldsArg(fields);
  if (names.length !== vals.length) throw expressionError('The number of fields and values must match.');
  return new MRecord(names, [...vals]);
});
def('Record.ToList', ['record'], (r) => listOf([...asRecord(r).entries]));
def('Record.ToTable', ['record'], (r) => tableFromRows(['Name', 'Value'], asRecord(r).names.map((n) => [n, r.get(n)]), [T.text, T.any]));
def('Record.FromTable', ['table'], (t) => {
  asTable(t);
  const ni = t.columnIndex('Name');
  const vi = t.columnIndex('Value');
  if (ni < 0 || vi < 0) throw expressionError('The table must have Name and Value columns.');
  return new MRecord(t.cols[ni].map((x) => cell(x)), [...t.cols[vi]]);
});

def('Function.Invoke', ['function', 'args'], (f, args) => asFn(f).invoke(asList(args).items));
def('Diagnostics.Trace', ['traceLevel', 'message', 'value', '?delayed'], (l, m, v) => v);
def('Error.Record', ['reason', 'message', '?detail'], (r, m, d) => MRecord.from({ Reason: r, Message: m, Detail: d === undefined ? null : d }));
def('Expression.Evaluate', ['document', '?environment'], (doc, env) => RT.evalText(asText(doc), env), 'partial');
def('Expression.Identifier', ['name'], (n) => (/^[\p{L}_][\p{L}\p{Nd}_.]*$/u.test(n) ? n : `#"${n.replace(/"/g, '""')}"`));

def('Combiner.CombineTextByDelimiter', ['delimiter', '?quoteStyle'], (d) => new MFunction({ name: 'Combiner', params: [{ name: 'list' }], fn: ([l]) => asList(cell(force(l))).toArray().filter((x) => x !== null).map((x) => toText(x)).join(d) }));
def('Combiner.CombineTextByEachDelimiter', ['delimiters', '?quoteStyle'], (ds) => new MFunction({ name: 'Combiner', params: [{ name: 'list' }], fn: ([l]) => {
  const items = asList(cell(force(l))).toArray().map((x) => (x === null ? '' : toText(x)));
  const delims = asList(ds).toArray();
  return items.reduce((acc, x, i) => (i === 0 ? x : acc + (delims[i - 1] || '') + x), '');
} }));

function splitQuoted(text, delim, quote) {
  const out = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  while (i < text.length) {
    if (quote && text[i] === '"') {
      if (inQ && text[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQ = !inQ;
      i++;
      continue;
    }
    if (!inQ && text.startsWith(delim, i) && delim.length) {
      out.push(cur);
      cur = '';
      i += delim.length;
      continue;
    }
    cur += text[i++];
  }
  out.push(cur);
  return out;
}

const splitter = (fn) => new MFunction({ name: 'Splitter', params: [{ name: 'text' }], fn: ([t]) => {
  const v = cell(force(t));
  if (v === null) return listOf([]);
  return listOf(fn(asText(v)));
} });

def('Splitter.SplitTextByDelimiter', ['delimiter', '?quoteStyle'], (d, q) => splitter((t) => splitQuoted(t, d, q === 1 || q === undefined || q === null)));
def('Splitter.SplitTextByAnyDelimiter', ['delimiters', '?quoteStyle', '?startAtEnd'], (ds) => {
  const set = textList(ds);
  return splitter((t) => {
    const out = [];
    let cur = '';
    for (const ch of t) {
      if (set.includes(ch)) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
});
def('Splitter.SplitTextByEachDelimiter', ['delimiters', '?quoteStyle', '?startAtEnd'], (ds, q, end) => {
  const list = textList(ds);
  return splitter((t) => {
    const out = [];
    let rest = t;
    for (const d of list) {
      const at = end ? rest.lastIndexOf(d) : rest.indexOf(d);
      if (at < 0) break;
      if (end) {
        out.unshift(rest.slice(at + d.length));
        rest = rest.slice(0, at);
      } else {
        out.push(rest.slice(0, at));
        rest = rest.slice(at + d.length);
      }
    }
    if (end) out.unshift(rest);
    else out.push(rest);
    return out;
  });
});
def('Splitter.SplitTextByPositions', ['positions', '?startAtEnd'], (p) => {
  const pos = asList(p).toArray();
  return splitter((t) => pos.map((x, i) => t.slice(x, i + 1 < pos.length ? pos[i + 1] : undefined)));
});
def('Splitter.SplitTextByLengths', ['lengths', '?startAtEnd'], (l) => {
  const lens = asList(l).toArray();
  return splitter((t) => {
    const out = [];
    let at = 0;
    for (const n of lens) {
      out.push(t.slice(at, at + n));
      at += n;
    }
    return out;
  });
});
def('Splitter.SplitTextByRepeatedLengths', ['length', '?startAtEnd'], (n) => splitter((t) => {
  const out = [];
  for (let i = 0; i < t.length; i += n) out.push(t.slice(i, i + n));
  return out;
}));
def('Splitter.SplitTextByCharacterTransition', ['before', 'after'], (b, a) => {
  const test = (spec) => {
    if (typeof spec === 'string') return (ch) => spec.includes(ch);
    if (spec instanceof MList) {
      const set = spec.toArray();
      return (ch) => set.includes(ch);
    }
    const f = asFn(spec);
    return (ch) => f.invoke([ch]) === true;
  };
  const isBefore = test(b);
  const isAfter = test(a);
  return splitter((t) => {
    const out = [];
    let cur = '';
    for (let i = 0; i < t.length; i++) {
      cur += t[i];
      if (i + 1 < t.length && isBefore(t[i]) && isAfter(t[i + 1])) {
        out.push(cur);
        cur = '';
      }
    }
    out.push(cur);
    return out;
  });
});

for (const n of ['Sql.Database', 'Sql.Databases', 'Odbc.DataSource', 'Odbc.Query', 'OleDb.DataSource', 'OData.Feed', 'SharePoint.Files', 'SharePoint.Tables', 'SharePoint.Contents', 'Folder.Files', 'Folder.Contents', 'Web.Page', 'Web.BrowserContents', 'Pdf.Tables', 'Xml.Tables', 'Xml.Document', 'AnalysisServices.Database', 'AnalysisServices.Databases', 'Cube.Dimensions', 'Cube.Transform', 'Value.NativeQuery', 'Html.Table', 'R.Execute', 'Python.Execute', 'Oracle.Database', 'MySQL.Database', 'PostgreSQL.Database', 'Salesforce.Data', 'AzureStorage.Blobs', 'Table.FuzzyNestedJoin', 'Table.FuzzyJoin', 'Table.FuzzyGroup']) unsupported(n, 'unsupported');

export { typeName, nullable, prim, isNull, cannotConvert, currentCulture, toNumber };
