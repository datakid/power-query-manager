import {
  MTable, MList, MRecord, MFunction, MType, Thunk, CellError, force, cell, expressionError, kindOf, valuesEqual, compareValues, listOf, T,
  tableFromRows, typeOfValue, MError
} from '../values.js';
import { RT, tick, checkRows } from '../runtime.js';
import { def, asTable, asList, asFn, asRecord, textList, call } from './core.js';
import { convertToType, cultureArg } from '../convert.js';
import { schemaTable } from './misc.js';
import { valueKey, stableSort, distinctBy, equalityFn } from './list.js';
import { cannotConvert } from '../eval.js';

const mk = (columns, types, cols, rowCount) => new MTable(columns, types, cols, rowCount === undefined ? (cols.length ? cols[0].length : 0) : rowCount);

function colIndex(t, name) {
  const i = t.columnIndex(name);
  if (i < 0) throw expressionError(`The column '${name}' of the table wasn't found.`, name);
  return i;
}

function colIndexes(t, names, missing) {
  const out = [];
  for (const n of names) {
    const i = t.columnIndex(n);
    if (i < 0) {
      if (missing === 1) continue;
      if (missing === 2) {
        out.push(-1);
        continue;
      }
      throw expressionError(`The column '${n}' of the table wasn't found.`, n);
    }
    out.push(i);
  }
  return out;
}

const namesArg = (v) => (typeof v === 'string' ? [v] : textList(v));

function pairList(v) {
  const arr = asList(v).toArray();
  if (arr.length && !(arr[0] instanceof MList)) return [arr];
  return arr.map((p) => asList(p).toArray());
}

function takeRows(t, rows) {
  return mk(t.columns, t.types, t.cols.map((c) => rows.map((r) => c[r])), rows.length);
}

function rowsToTable(columns, types, rows) {
  const cols = columns.map(() => new Array(rows.length));
  rows.forEach((r, i) => columns.forEach((_, c) => {
    cols[c][i] = r[c];
  }));
  return mk(columns, types, cols, rows.length);
}

function rowArray(t, r) {
  return t.cols.map((c) => c[r]);
}

function guardCell(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof MError) return new CellError(e);
    throw e;
  }
}

def('Table.RowCount', ['table'], (t) => asTable(t).rowCount);
def('Table.ColumnCount', ['table'], (t) => asTable(t).columns.length);
def('Table.ColumnNames', ['table'], (t) => listOf([...asTable(t).columns]));
def('Table.Column', ['table', 'column'], (t, c) => listOf(asTable(t).cols[colIndex(t, c)].slice()));
def('Table.IsEmpty', ['table'], (t) => asTable(t).rowCount === 0);
def('Table.Buffer', ['table', '?options'], (t) => asTable(t));
def('Table.First', ['table', '?default'], (t, d) => (asTable(t).rowCount ? t.rowRecord(0) : d === undefined ? null : d));
def('Table.Last', ['table', '?default'], (t, d) => (asTable(t).rowCount ? t.rowRecord(t.rowCount - 1) : d === undefined ? null : d));
def('Table.ToRows', ['table'], (t) => listOf(Array.from({ length: asTable(t).rowCount }, (_, r) => listOf(rowArray(t, r)))));
def('Table.ToColumns', ['table'], (t) => listOf(asTable(t).cols.map((c) => listOf(c.slice()))));
def('Table.ToRecords', ['table'], (t) => listOf(Array.from({ length: asTable(t).rowCount }, (_, r) => t.rowRecord(r))));
def('Table.TransformRows', ['table', 'transform'], (t, f) => listOf(Array.from({ length: asTable(t).rowCount }, (_, r) => {
  tick();
  return f.invoke([t.rowRecord(r)]);
})));
def('Table.Keys', ['table'], (t) => listOf((asTable(t).keys || []).map((k) => MRecord.from({ Columns: listOf(k.columns), Primary: !!k.primary }))));
def('Table.AddKey', ['table', 'columns', 'isPrimary'], (t, cols, p) => {
  const out = mk(t.columns, t.types, t.cols, t.rowCount);
  out.keys = [...(t.keys || []), { columns: namesArg(cols), primary: p }];
  return out;
});
def('Table.Schema', ['table'], (t) => {
  const s = schemaTable(asTable(t).columns.map((n, i) => ({ name: n, type: t.types[i] || T.any })));
  const withName = tableFromRows(['TableName', ...s.columns], Array.from({ length: s.rowCount }, (_, r) => ['', ...rowArray(s, r)]));
  return withName;
});
def('Table.Profile', ['table', '?additionalAggregates'], (t) => {
  const rows = asTable(t).columns.map((name, i) => {
    const vals = t.cols[i].map(cell);
    const nn = vals.filter((v) => v !== null);
    const nums = nn.filter((v) => typeof v === 'number');
    const sorted = nn.length ? stableSort(nn, compareValues) : [];
    const avg = nums.length === nn.length && nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    let sd = null;
    if (avg !== null && nums.length > 1) sd = Math.sqrt(nums.reduce((a, b) => a + (b - avg) * (b - avg), 0) / (nums.length - 1));
    return [name, sorted.length ? sorted[0] : null, sorted.length ? sorted[sorted.length - 1] : null, avg, sd, vals.length, vals.length - nn.length, new Set(vals.map(valueKey)).size];
  });
  return tableFromRows(['Column', 'Min', 'Max', 'Average', 'StandardDeviation', 'Count', 'NullCount', 'DistinctCount'], rows);
}, 'partial');

def('Table.PromoteHeaders', ['table', '?options'], (t, o) => {
  asTable(t);
  const all = o instanceof MRecord && o.getOr('PromoteAllScalars', false) === true;
  if (!t.rowCount) return t;
  const seen = new Map();
  const names = t.cols.map((c, i) => {
    const v = cell(c[0]);
    let name;
    if (typeof v === 'string') name = v;
    else if (all && v !== null && ['number', 'date', 'datetime', 'time', 'logical'].includes(kindOf(v))) name = convertToType(v, T.text);
    else name = `Column${i + 1}`;
    const n = seen.get(name);
    if (n === undefined) {
      seen.set(name, 0);
      return name;
    }
    let k = n + 1;
    while (seen.has(`${name}.${k}`)) k++;
    seen.set(name, k);
    seen.set(`${name}.${k}`, 0);
    return `${name}.${k}`;
  });
  return mk(names, names.map(() => T.any), t.cols.map((c) => c.slice(1)), t.rowCount - 1);
});
def('Table.DemoteHeaders', ['table'], (t) => {
  asTable(t);
  const names = t.columns.map((_, i) => `Column${i + 1}`);
  return mk(names, t.types.map(() => T.any), t.cols.map((c, i) => [t.columns[i], ...c]), t.rowCount + 1);
});
def('Table.TransformColumnTypes', ['table', 'typeTransformations', '?culture'], (t, tt, c) => {
  asTable(t);
  const culture = cultureArg(c);
  const pairs = pairList(tt);
  const cols = t.cols.slice();
  const types = t.types.slice();
  for (const [name, type] of pairs) {
    const i = colIndex(t, name);
    cols[i] = t.cols[i].map((v) => {
      tick();
      if (v instanceof CellError) return v;
      return guardCell(() => convertToType(v, type, culture));
    });
    types[i] = type;
  }
  return mk(t.columns, types, cols, t.rowCount);
});
def('Table.SelectRows', ['table', 'condition'], (t, f) => {
  asTable(t);
  asFn(f);
  const keep = [];
  for (let r = 0; r < t.rowCount; r++) {
    tick();
    const v = f.invoke([t.rowRecord(r)]);
    if (v === true) keep.push(r);
    else if (v !== false && v !== null) throw cannotConvert(v, 'Logical');
  }
  return takeRows(t, keep);
});
def('Table.SelectColumns', ['table', 'columns', '?missingField'], (t, cols, mf) => {
  asTable(t);
  const names = namesArg(cols);
  const idx = colIndexes(t, names, mf);
  const keptNames = [];
  const data = [];
  const types = [];
  let k = 0;
  for (const n of names) {
    const i = t.columnIndex(n);
    if (i < 0 && mf === 1) continue;
    keptNames.push(n);
    if (i < 0) {
      data.push(new Array(t.rowCount).fill(null));
      types.push(T.any);
    } else {
      data.push(t.cols[i]);
      types.push(t.types[i]);
    }
    k++;
  }
  void idx;
  void k;
  return mk(keptNames, types, data, t.rowCount);
});
def('Table.RemoveColumns', ['table', 'columns', '?missingField'], (t, cols, mf) => {
  asTable(t);
  const rm = new Set(namesArg(cols));
  colIndexes(t, [...rm], mf);
  const keep = t.columns.map((_, i) => i).filter((i) => !rm.has(t.columns[i]));
  return mk(keep.map((i) => t.columns[i]), keep.map((i) => t.types[i]), keep.map((i) => t.cols[i]), t.rowCount);
});
def('Table.ReorderColumns', ['table', 'columnOrder', '?missingField'], (t, order, mf) => {
  asTable(t);
  const names = namesArg(order).filter((n) => t.columnIndex(n) >= 0 || mf === undefined || mf === 0);
  const first = colIndexes(t, names, mf).filter((i) => i >= 0);
  const rest = t.columns.map((_, i) => i).filter((i) => !first.includes(i));
  const all = [...first, ...rest];
  return mk(all.map((i) => t.columns[i]), all.map((i) => t.types[i]), all.map((i) => t.cols[i]), t.rowCount);
});
def('Table.RenameColumns', ['table', 'renames', '?missingField'], (t, renames, mf) => {
  asTable(t);
  const names = [...t.columns];
  for (const [from, to] of pairList(renames)) {
    const i = names.indexOf(from);
    if (i < 0) {
      if (mf === 1) continue;
      if (mf === 2) continue;
      throw expressionError(`The column '${from}' of the table wasn't found.`, from);
    }
    names[i] = to;
  }
  if (new Set(names).size !== names.length) throw expressionError('The name is already in use by another column.', names);
  return mk(names, t.types, t.cols, t.rowCount);
});
def('Table.TransformColumnNames', ['table', 'nameGenerator', '?options'], (t, f) => {
  asTable(t);
  const names = t.columns.map((n) => f.invoke([n]));
  return mk(names, t.types, t.cols, t.rowCount);
});
def('Table.AddColumn', ['table', 'newColumnName', 'columnGenerator', '?columnType'], (t, name, f, type) => {
  asTable(t);
  if (t.columnIndex(name) >= 0) throw expressionError(`The column '${name}' of the table already exists.`, name);
  asFn(f);
  const col = new Array(t.rowCount);
  for (let r = 0; r < t.rowCount; r++) {
    tick();
    const rec = t.rowRecord(r);
    col[r] = guardCell(() => f.invoke([rec]));
  }
  return mk([...t.columns, name], [...t.types, type || T.any], [...t.cols, col], t.rowCount);
});
def('Table.AddIndexColumn', ['table', 'newColumnName', '?initialValue', '?increment', '?columnType'], (t, name, init, inc) => {
  asTable(t);
  const start = init === undefined || init === null ? 0 : init;
  const step = inc === undefined || inc === null ? 1 : inc;
  return mk([...t.columns, name], [...t.types, T.number], [...t.cols, Array.from({ length: t.rowCount }, (_, i) => start + i * step)], t.rowCount);
});
def('Table.DuplicateColumn', ['table', 'columnName', 'newColumnName', '?columnType'], (t, c, n, type) => {
  const i = colIndex(asTable(t), c);
  if (t.columnIndex(n) >= 0) throw expressionError(`The column '${n}' of the table already exists.`, n);
  return mk([...t.columns, n], [...t.types, type || t.types[i]], [...t.cols, t.cols[i].slice()], t.rowCount);
});
def('Table.TransformColumns', ['table', 'transformOperations', '?defaultTransformation', '?missingField'], (t, ops, dflt, mf) => {
  asTable(t);
  const cols = t.cols.slice();
  const types = t.types.slice();
  const apply = (i, f, type) => {
    cols[i] = t.cols[i].map((v) => {
      tick();
      if (v instanceof CellError) return v;
      return guardCell(() => f.invoke([v]));
    });
    types[i] = type || T.any;
  };
  const list = pairList(ops);
  const touched = new Set();
  for (const p of list) {
    const [name, f, type] = p;
    const i = t.columnIndex(name);
    if (i < 0) {
      if (mf === 1 || mf === 2) continue;
      throw expressionError(`The column '${name}' of the table wasn't found.`, name);
    }
    touched.add(i);
    apply(i, f, type);
  }
  if (dflt) t.columns.forEach((_, i) => {
    if (!touched.has(i)) apply(i, dflt, null);
  });
  return mk(t.columns, types, cols, t.rowCount);
});
def('Table.ReplaceValue', ['table', 'oldValue', 'newValue', 'replacer', 'columnsToSearch'], (t, o, n, replacer, cols) => {
  asTable(t);
  const targets = colIndexes(t, namesArg(cols));
  const out = t.cols.slice();
  for (const i of targets) out[i] = t.cols[i].map((v) => (v instanceof CellError ? v : guardCell(() => replacer.invoke([v, o, n]))));
  return mk(t.columns, t.types, out, t.rowCount);
});
def('Table.ReplaceErrorValues', ['table', 'errorReplacement'], (t, rep) => {
  asTable(t);
  const out = t.cols.slice();
  for (const [name, val] of pairList(rep)) {
    const i = colIndex(t, name);
    out[i] = t.cols[i].map((v) => (v instanceof CellError ? val : v));
  }
  return mk(t.columns, t.types, out, t.rowCount);
});
function errorRows(t, cols) {
  const idx = cols === undefined || cols === null ? t.columns.map((_, i) => i) : colIndexes(t, namesArg(cols));
  const bad = [];
  for (let r = 0; r < t.rowCount; r++) if (idx.some((i) => t.cols[i][r] instanceof CellError)) bad.push(r);
  return bad;
}
def('Table.RemoveRowsWithErrors', ['table', '?columns'], (t, c) => {
  const bad = new Set(errorRows(asTable(t), c));
  return takeRows(t, Array.from({ length: t.rowCount }, (_, i) => i).filter((i) => !bad.has(i)));
});
def('Table.SelectRowsWithErrors', ['table', '?columns'], (t, c) => takeRows(asTable(t), errorRows(t, c)));

function sortSpec(t, crit) {
  const items = typeof crit === 'string' ? [crit] : asList(crit).toArray();
  const specs = [];
  const flat = items.length && !(items[0] instanceof MList) && typeof items[0] === 'string' && items.length === 2 && typeof items[1] === 'number' ? [items] : items;
  for (const it of flat) {
    if (typeof it === 'string') specs.push({ i: colIndex(t, it), desc: false });
    else if (it instanceof MList) {
      const [n, o, cmp] = it.toArray();
      specs.push({ i: colIndex(t, n), desc: o === 1, cmp });
    } else if (it instanceof MFunction) specs.push({ fn: it });
  }
  return specs;
}

def('Table.Sort', ['table', 'comparisonCriteria'], (t, crit) => {
  asTable(t);
  const specs = sortSpec(t, crit);
  const order = Array.from({ length: t.rowCount }, (_, i) => i);
  const cmp = (a, b) => {
    for (const s of specs) {
      let c;
      if (s.fn) c = compareValues(s.fn.invoke([t.rowRecord(a)]), s.fn.invoke([t.rowRecord(b)]));
      else c = s.cmp instanceof MFunction ? Number(s.cmp.invoke([t.cols[s.i][a], t.cols[s.i][b]])) : compareValues(t.cols[s.i][a], t.cols[s.i][b]);
      if (c) return s.desc ? -c : c;
    }
    return 0;
  };
  return takeRows(t, stableSort(order, cmp));
});
def('Table.Distinct', ['table', '?equationCriteria'], (t, crit) => {
  asTable(t);
  const idx = crit === undefined || crit === null ? t.columns.map((_, i) => i) : colIndexes(t, namesArg(typeof crit === 'string' ? crit : crit instanceof MList && crit.length && typeof crit.at(0) === 'string' ? crit : crit));
  const seen = new Set();
  const keep = [];
  for (let r = 0; r < t.rowCount; r++) {
    const k = idx.map((i) => valueKey(t.cols[i][r])).join('\u0001');
    if (!seen.has(k)) {
      seen.add(k);
      keep.push(r);
    }
  }
  return takeRows(t, keep);
});
def('Table.FirstN', ['table', 'countOrCondition'], (t, n) => {
  asTable(t);
  if (typeof n === 'number') return takeRows(t, Array.from({ length: Math.min(n, t.rowCount) }, (_, i) => i));
  const keep = [];
  for (let r = 0; r < t.rowCount && n.invoke([t.rowRecord(r)]) === true; r++) keep.push(r);
  return takeRows(t, keep);
});
def('Table.LastN', ['table', 'countOrCondition'], (t, n) => {
  asTable(t);
  const start = typeof n === 'number' ? Math.max(0, t.rowCount - n) : (() => {
    let i = t.rowCount;
    while (i > 0 && n.invoke([t.rowRecord(i - 1)]) === true) i--;
    return i;
  })();
  return takeRows(t, Array.from({ length: t.rowCount - start }, (_, i) => start + i));
});
def('Table.Skip', ['table', '?countOrCondition'], (t, n) => {
  asTable(t);
  let start = 0;
  if (typeof n === 'number') start = n;
  else if (n === undefined || n === null) start = 1;
  else while (start < t.rowCount && n.invoke([t.rowRecord(start)]) === true) start++;
  start = Math.min(start, t.rowCount);
  return takeRows(t, Array.from({ length: t.rowCount - start }, (_, i) => start + i));
});
def('Table.RemoveFirstN', ['table', '?countOrCondition'], (t, n) => {
  asTable(t);
  const start = Math.min(typeof n === 'number' ? n : 1, t.rowCount);
  return takeRows(t, Array.from({ length: t.rowCount - start }, (_, i) => start + i));
});
def('Table.RemoveLastN', ['table', '?countOrCondition'], (t, n) => {
  asTable(t);
  const keep = Math.max(0, t.rowCount - (typeof n === 'number' ? n : 1));
  return takeRows(t, Array.from({ length: keep }, (_, i) => i));
});
def('Table.Range', ['table', 'offset', '?count'], (t, o, n) => {
  asTable(t);
  if (o > t.rowCount) throw expressionError('There weren\'t enough elements in the enumeration to complete the operation.', o);
  const end = n === undefined || n === null ? t.rowCount : Math.min(t.rowCount, o + n);
  return takeRows(t, Array.from({ length: end - o }, (_, i) => o + i));
});
def('Table.Max', ['table', 'comparisonCriteria', '?default'], (t, crit, d) => {
  asTable(t);
  if (!t.rowCount) return d === undefined ? null : d;
  const specs = sortSpec(t, crit);
  const sorted = stableSort(Array.from({ length: t.rowCount }, (_, i) => i), (a, b) => {
    for (const s of specs) {
      const c = compareValues(t.cols[s.i][b], t.cols[s.i][a]);
      if (c) return c;
    }
    return 0;
  });
  return t.rowRecord(sorted[0]);
});
def('Table.Min', ['table', 'comparisonCriteria', '?default'], (t, crit, d) => {
  asTable(t);
  if (!t.rowCount) return d === undefined ? null : d;
  const specs = sortSpec(t, crit);
  const sorted = stableSort(Array.from({ length: t.rowCount }, (_, i) => i), (a, b) => {
    for (const s of specs) {
      const c = compareValues(t.cols[s.i][a], t.cols[s.i][b]);
      if (c) return c;
    }
    return 0;
  });
  return t.rowRecord(sorted[0]);
});
def('Table.Contains', ['table', 'row', '?equationCriteria'], (t, row) => {
  asTable(t);
  asRecord(row);
  for (let r = 0; r < t.rowCount; r++) if (row.names.every((n) => valuesEqual(t.cols[colIndex(t, n)][r], row.get(n)))) return true;
  return false;
});
def('Table.MatchesAnyRows', ['table', 'condition'], (t, f) => {
  for (let r = 0; r < asTable(t).rowCount; r++) if (f.invoke([t.rowRecord(r)]) === true) return true;
  return false;
});
def('Table.MatchesAllRows', ['table', 'condition'], (t, f) => {
  for (let r = 0; r < asTable(t).rowCount; r++) if (f.invoke([t.rowRecord(r)]) !== true) return false;
  return true;
});
def('Table.PositionOf', ['table', 'row', '?occurrence'], (t, row) => {
  for (let r = 0; r < asTable(t).rowCount; r++) if (row.names.every((n) => valuesEqual(t.cols[colIndex(t, n)][r], row.get(n)))) return r;
  return -1;
});
def('Table.FirstValue', ['table', '?default'], (t, d) => (asTable(t).rowCount && t.columns.length ? cell(t.cols[0][0]) : d === undefined ? null : d));
def('Table.SingleRow', ['table'], (t) => {
  if (asTable(t).rowCount !== 1) throw expressionError('The table must contain exactly one row.');
  return t.rowRecord(0);
});

def('Table.Group', ['table', 'key', 'aggregatedColumns', '?groupKind', '?comparer'], (t, key, aggs, kind) => {
  asTable(t);
  const keyNames = namesArg(key);
  const ki = colIndexes(t, keyNames);
  const groups = [];
  const index = new Map();
  const local = kind === 0;
  for (let r = 0; r < t.rowCount; r++) {
    tick();
    const k = ki.map((i) => valueKey(t.cols[i][r])).join('\u0001');
    if (local) {
      const last = groups[groups.length - 1];
      if (last && last.k === k) {
        last.rows.push(r);
        continue;
      }
      groups.push({ k, rows: [r] });
    } else {
      let g = index.get(k);
      if (!g) {
        g = { k, rows: [] };
        index.set(k, g);
        groups.push(g);
      }
      g.rows.push(r);
    }
  }
  const specs = asList(aggs).toArray().map((a) => a.toArray());
  const outCols = [...ki.map((i) => groups.map((g) => t.cols[i][g.rows[0]])), ...specs.map(([, f]) => groups.map((g) => guardCell(() => f.invoke([takeRows(t, g.rows)]))))];
  const names = [...keyNames, ...specs.map((s) => s[0])];
  const types = [...ki.map((i) => t.types[i]), ...specs.map((s) => s[2] || T.any)];
  return mk(names, types, outCols, groups.length);
});

function keyIndex(t, keys) {
  return colIndexes(t, namesArg(keys));
}

function rowKey(t, idx, r) {
  return idx.map((i) => valueKey(t.cols[i][r])).join('\u0001');
}

function joinPairs(t1, k1, t2, k2, kind) {
  const i1 = keyIndex(t1, k1);
  const i2 = keyIndex(t2, k2);
  const map = new Map();
  for (let r = 0; r < t2.rowCount; r++) {
    const k = rowKey(t2, i2, r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const pairs = [];
  const matchedRight = new Set();
  const matchedLeft = new Set();
  for (let r = 0; r < t1.rowCount; r++) {
    tick();
    const hits = map.get(rowKey(t1, i1, r)) || [];
    hits.forEach((h) => {
      pairs.push([r, h]);
      matchedRight.add(h);
      matchedLeft.add(r);
    });
  }
  return { pairs, matchedLeft, matchedRight, map, i1, i2 };
}

def('Table.NestedJoin', ['table1', 'key1', 'table2', 'key2', 'newColumnName', '?joinKind', '?keyComparer'], (t1, k1, t2, k2, name, kind) => {
  asTable(t1);
  asTable(t2);
  const jk = kind === undefined || kind === null ? 1 : kind;
  const { map, i1, i2 } = joinPairs(t1, k1, t2, k2, jk);
  const rows = [];
  if (jk === 2 || jk === 5) {
    const idx1 = new Map();
    for (let r = 0; r < t1.rowCount; r++) {
      const k = rowKey(t1, i1, r);
      if (!idx1.has(k)) idx1.set(k, []);
      idx1.get(k).push(r);
    }
    const leftOnlyRows = [];
    for (let r = 0; r < t2.rowCount; r++) {
      const hits = idx1.get(rowKey(t2, i2, r)) || [];
      if (jk === 5 && hits.length) continue;
      leftOnlyRows.push([hits, r]);
    }
    const cols = t1.cols.map(() => []);
    const nested = [];
    for (const [hits, r] of leftOnlyRows) {
      if (hits.length === 0) {
        cols.forEach((c) => c.push(null));
        nested.push(takeRows(t2, [r]));
      } else {
        for (const h of hits) {
          cols.forEach((c, ci) => c.push(t1.cols[ci][h]));
          nested.push(takeRows(t2, [r]));
        }
      }
    }
    void rows;
    return mk([...t1.columns, name], [...t1.types, T.table], [...cols, nested], nested.length);
  }
  const keep = [];
  const nested = [];
  for (let r = 0; r < t1.rowCount; r++) {
    const hits = map.get(rowKey(t1, i1, r)) || [];
    if (jk === 0 && !hits.length) continue;
    if (jk === 4 && hits.length) continue;
    keep.push(r);
    nested.push(jk === 4 ? takeRows(t2, []) : takeRows(t2, hits));
  }
  if (jk === 3) {
    const matched = new Set();
    for (let r = 0; r < t1.rowCount; r++) (map.get(rowKey(t1, i1, r)) || []).forEach((h) => matched.add(h));
    const out = mk([...t1.columns, name], [...t1.types, T.table], [...t1.cols.map((c) => keep.map((r) => c[r])), nested], keep.length);
    const extra = [];
    for (let r = 0; r < t2.rowCount; r++) if (!matched.has(r)) extra.push(r);
    extra.forEach((r) => {
      out.cols.forEach((c, ci) => c.push(ci === out.cols.length - 1 ? takeRows(t2, [r]) : null));
      out.rowCount++;
    });
    return out;
  }
  return mk([...t1.columns, name], [...t1.types, T.table], [...t1.cols.map((c) => keep.map((r) => c[r])), nested], keep.length);
});

def('Table.Join', ['table1', 'key1', 'table2', 'key2', '?joinKind', '?joinAlgorithm', '?keyComparer'], (t1, k1, t2, k2, kind) => {
  asTable(t1);
  asTable(t2);
  const jk = kind === undefined || kind === null ? 0 : kind;
  const dup = t2.columns.find((c) => t1.columns.includes(c));
  if (dup) throw expressionError(`The column '${dup}' of the table was already found. Rename it or use Table.NestedJoin.`, dup);
  const { pairs, matchedLeft, matchedRight, i1, i2 } = joinPairs(t1, k1, t2, k2, jk);
  const names = [...t1.columns, ...t2.columns];
  const types = [...t1.types, ...t2.types];
  const rows = [];
  const nulls1 = t1.columns.map(() => null);
  const nulls2 = t2.columns.map(() => null);
  const leftRow = (r) => rowArray(t1, r);
  const rightRow = (r) => rowArray(t2, r);
  if (jk === 0) pairs.forEach(([a, b]) => rows.push([...leftRow(a), ...rightRow(b)]));
  else if (jk === 1) {
    for (let r = 0; r < t1.rowCount; r++) {
      const ps = pairs.filter((p) => p[0] === r);
      if (ps.length) ps.forEach(([a, b]) => rows.push([...leftRow(a), ...rightRow(b)]));
      else rows.push([...leftRow(r), ...nulls2]);
    }
  } else if (jk === 2) {
    for (let r = 0; r < t2.rowCount; r++) {
      const ps = pairs.filter((p) => p[1] === r);
      if (ps.length) ps.forEach(([a, b]) => rows.push([...leftRow(a), ...rightRow(b)]));
      else rows.push([...nulls1, ...rightRow(r)]);
    }
  } else if (jk === 3) {
    for (let r = 0; r < t1.rowCount; r++) {
      const ps = pairs.filter((p) => p[0] === r);
      if (ps.length) ps.forEach(([a, b]) => rows.push([...leftRow(a), ...rightRow(b)]));
      else rows.push([...leftRow(r), ...nulls2]);
    }
    for (let r = 0; r < t2.rowCount; r++) if (!matchedRight.has(r)) rows.push([...nulls1, ...rightRow(r)]);
  } else if (jk === 4) {
    for (let r = 0; r < t1.rowCount; r++) if (!matchedLeft.has(r)) rows.push([...leftRow(r), ...nulls2]);
  } else if (jk === 5) {
    for (let r = 0; r < t2.rowCount; r++) if (!matchedRight.has(r)) rows.push([...nulls1, ...rightRow(r)]);
  }
  void i1;
  void i2;
  return rowsToTable(names, types, rows);
});

def('Table.ExpandTableColumn', ['table', 'column', 'columnNames', '?newColumnNames'], (t, c, fields, newNames) => {
  asTable(t);
  const ci = colIndex(t, c);
  const names = textList(fields);
  const outNames = newNames === undefined || newNames === null ? names : textList(newNames);
  const rows = [];
  for (let r = 0; r < t.rowCount; r++) {
    const nested = cell(t.cols[ci][r]);
    const base = t.cols.map((col, i) => col[r]).filter((_, i) => i !== ci);
    if (!(nested instanceof MTable)) {
      rows.push([...base, ...names.map(() => null)]);
      continue;
    }
    if (nested.rowCount === 0) {
      rows.push([...base, ...names.map(() => null)]);
      continue;
    }
    for (let n = 0; n < nested.rowCount; n++) rows.push([...base, ...names.map((f) => nested.cols[colIndex(nested, f)][n])]);
  }
  const baseNames = t.columns.filter((_, i) => i !== ci);
  const baseTypes = t.types.filter((_, i) => i !== ci);
  const pos = ci;
  const allNames = [...baseNames, ...outNames];
  const allTypes = [...baseTypes, ...outNames.map(() => T.any)];
  const out = rowsToTable(allNames, allTypes, rows);
  const order = [...baseNames.slice(0, pos).map((_, i) => i), ...outNames.map((_, i) => baseNames.length + i), ...baseNames.slice(pos).map((_, i) => pos + i)];
  return mk(order.map((i) => out.columns[i]), order.map((i) => out.types[i]), order.map((i) => out.cols[i]), out.rowCount);
});
def('Table.ExpandRecordColumn', ['table', 'column', 'fieldNames', '?newColumnNames'], (t, c, fields, newNames) => {
  asTable(t);
  const ci = colIndex(t, c);
  const names = textList(fields);
  const outNames = newNames === undefined || newNames === null ? names : textList(newNames);
  const newCols = names.map((f) => t.cols[ci].map((v) => {
    const rec = cell(v);
    return rec === null ? null : guardCell(() => asRecord(rec).getOr(f, null));
  }));
  const order = [];
  const cols = [];
  const types = [];
  const nm = [];
  t.columns.forEach((n, i) => {
    if (i === ci) {
      outNames.forEach((on, k) => {
        nm.push(on);
        cols.push(newCols[k]);
        types.push(T.any);
      });
    } else {
      nm.push(n);
      cols.push(t.cols[i]);
      types.push(t.types[i]);
    }
  });
  void order;
  return mk(nm, types, cols, t.rowCount);
});
def('Table.ExpandListColumn', ['table', 'column'], (t, c) => {
  asTable(t);
  const ci = colIndex(t, c);
  const rows = [];
  for (let r = 0; r < t.rowCount; r++) {
    const l = cell(t.cols[ci][r]);
    const base = rowArray(t, r);
    if (l === null || (l instanceof MList && l.length === 0)) {
      rows.push(base.map((v, i) => (i === ci ? null : v)));
      continue;
    }
    for (const item of asList(l).items) rows.push(base.map((v, i) => (i === ci ? item : v)));
  }
  return rowsToTable(t.columns, t.columns.map((_, i) => (i === ci ? T.any : t.types[i])), rows);
});

function combineTables(tables) {
  const names = [];
  const types = [];
  for (const t of tables) {
    asTable(t);
    t.columns.forEach((n, i) => {
      if (!names.includes(n)) {
        names.push(n);
        types.push(t.types[i]);
      }
    });
  }
  const total = tables.reduce((a, t) => a + t.rowCount, 0);
  checkRows(total);
  const cols = names.map(() => []);
  for (const t of tables) {
    names.forEach((n, ci) => {
      const i = t.columnIndex(n);
      if (i < 0) for (let r = 0; r < t.rowCount; r++) cols[ci].push(null);
      else for (let r = 0; r < t.rowCount; r++) cols[ci].push(t.cols[i][r]);
    });
  }
  return mk(names, types, cols, total);
}
RT.tableCombine = combineTables;
RT.tableSelectColumns = (t, names, optional) => {
  const idx = names.map((n) => t.columnIndex(n));
  if (idx.some((i) => i < 0)) {
    if (optional) return null;
    throw expressionError(`The column '${names[idx.findIndex((i) => i < 0)]}' of the table wasn't found.`);
  }
  return mk(names, idx.map((i) => t.types[i]), idx.map((i) => t.cols[i]), t.rowCount);
};
def('Table.Combine', ['tables', '?columns'], (ts) => combineTables(asList(ts).toArray().filter((x) => x !== null)));

def('Table.UnpivotOtherColumns', ['table', 'pivotColumns', 'attributeColumn', 'valueColumn'], (t, keep, attr, val) => {
  asTable(t);
  const keepIdx = colIndexes(t, namesArg(keep));
  const pivotIdx = t.columns.map((_, i) => i).filter((i) => !keepIdx.includes(i));
  return unpivot(t, keepIdx, pivotIdx, attr, val);
});
def('Table.Unpivot', ['table', 'pivotColumns', 'attributeColumn', 'valueColumn'], (t, pivot, attr, val) => {
  asTable(t);
  const pivotIdx = colIndexes(t, namesArg(pivot));
  const keepIdx = t.columns.map((_, i) => i).filter((i) => !pivotIdx.includes(i));
  return unpivot(t, keepIdx, pivotIdx, attr, val);
});
function unpivot(t, keepIdx, pivotIdx, attr, val) {
  const rows = [];
  for (let r = 0; r < t.rowCount; r++) {
    for (const p of pivotIdx) {
      if (cell(t.cols[p][r]) === null) continue;
      rows.push([...keepIdx.map((i) => t.cols[i][r]), t.columns[p], t.cols[p][r]]);
    }
  }
  return rowsToTable([...keepIdx.map((i) => t.columns[i]), attr, val], [...keepIdx.map((i) => t.types[i]), T.text, T.any], rows);
}
def('Table.Pivot', ['table', 'pivotValues', 'attributeColumn', 'valueColumn', '?aggregationFunction'], (t, pivotValues, attr, val, agg) => {
  asTable(t);
  const pv = textList(pivotValues);
  const ai = colIndex(t, attr);
  const vi = colIndex(t, val);
  const keepIdx = t.columns.map((_, i) => i).filter((i) => i !== ai && i !== vi);
  const groups = new Map();
  for (let r = 0; r < t.rowCount; r++) {
    const k = rowKey(t, keepIdx, r);
    if (!groups.has(k)) groups.set(k, { first: r, cells: new Map() });
    const g = groups.get(k);
    const a = cell(t.cols[ai][r]);
    if (!pv.includes(a)) continue;
    if (!g.cells.has(a)) g.cells.set(a, []);
    g.cells.get(a).push(t.cols[vi][r]);
  }
  const rows = [...groups.values()].map((g) => [...keepIdx.map((i) => t.cols[i][g.first]), ...pv.map((p) => {
    const vals = g.cells.get(p);
    if (!vals) return null;
    if (agg) return agg.invoke([listOf(vals)]);
    if (vals.length > 1) throw expressionError('There were too many elements in the enumeration to complete the operation.');
    return vals[0];
  })]);
  return rowsToTable([...keepIdx.map((i) => t.columns[i]), ...pv], [...keepIdx.map((i) => t.types[i]), ...pv.map(() => T.any)], rows);
});
def('Table.FillDown', ['table', 'columns'], (t, cols) => fill(t, cols, 1));
def('Table.FillUp', ['table', 'columns'], (t, cols) => fill(t, cols, -1));
function fill(t, cols, dir) {
  asTable(t);
  const out = t.cols.slice();
  for (const i of colIndexes(t, namesArg(cols))) {
    const col = t.cols[i].slice();
    const order = dir > 0 ? col.map((_, k) => k) : col.map((_, k) => col.length - 1 - k);
    let last = null;
    for (const k of order) {
      if (cell(col[k]) === null) col[k] = last;
      else last = col[k];
    }
    out[i] = col;
  }
  return mk(t.columns, t.types, out, t.rowCount);
}
def('Table.SplitColumn', ['table', 'sourceColumn', 'splitter', '?columnNamesOrNumber', '?default', '?extraColumns'], (t, src, splitter, namesOrN) => {
  asTable(t);
  const ci = colIndex(t, src);
  const parts = t.cols[ci].map((v) => {
    const x = cell(v);
    return x === null ? [] : asList(splitter.invoke([x])).toArray();
  });
  let names;
  if (namesOrN instanceof MList) names = textList(namesOrN);
  else {
    const n = typeof namesOrN === 'number' ? namesOrN : Math.max(1, ...parts.map((p) => p.length));
    names = Array.from({ length: n }, (_, i) => `${src}.${i + 1}`);
  }
  const newCols = names.map((_, k) => parts.map((p) => (k < p.length ? p[k] : null)));
  const cols = [];
  const nm = [];
  const types = [];
  t.columns.forEach((n, i) => {
    if (i === ci) names.forEach((x, k) => {
      nm.push(x);
      cols.push(newCols[k]);
      types.push(T.any);
    });
    else {
      nm.push(n);
      cols.push(t.cols[i]);
      types.push(t.types[i]);
    }
  });
  return mk(nm, types, cols, t.rowCount);
});
def('Table.CombineColumns', ['table', 'sourceColumns', 'combiner', 'column', '?type'], (t, srcs, combiner, name) => {
  asTable(t);
  const idx = colIndexes(t, namesArg(srcs));
  const combined = Array.from({ length: t.rowCount }, (_, r) => guardCell(() => combiner.invoke([listOf(idx.map((i) => t.cols[i][r]))])));
  const first = Math.min(...idx);
  const nm = [];
  const cols = [];
  const types = [];
  t.columns.forEach((n, i) => {
    if (i === first) {
      nm.push(name);
      cols.push(combined);
      types.push(T.any);
    }
    if (!idx.includes(i)) {
      nm.push(n);
      cols.push(t.cols[i]);
      types.push(t.types[i]);
    }
  });
  return mk(nm, types, cols, t.rowCount);
});

function columnsFromArg(cols, width) {
  if (cols === undefined || cols === null) return { names: Array.from({ length: width }, (_, i) => `Column${i + 1}`), types: null };
  if (cols instanceof MType) return { names: cols.columns.map((c) => c.name), types: cols.columns.map((c) => c.type) };
  if (typeof cols === 'number') return { names: Array.from({ length: cols }, (_, i) => `Column${i + 1}`), types: null };
  return { names: textList(cols), types: null };
}

def('Table.FromRows', ['rows', '?columns'], (rows, cols) => {
  const list = asList(rows).toArray().map((r) => asList(r).items);
  const width = Math.max(0, ...list.map((r) => r.length));
  const { names, types } = columnsFromArg(cols, width);
  return rowsToTable(names, types || names.map(() => T.any), list.map((r) => names.map((_, i) => (i < r.length ? r[i] : null))));
});
def('Table.FromColumns', ['lists', '?columns'], (lists, cols) => {
  const arr = asList(lists).toArray().map((l) => asList(l).items);
  const n = Math.max(0, ...arr.map((a) => a.length));
  const { names, types } = columnsFromArg(cols, arr.length);
  return mk(names, types || names.map(() => T.any), arr.map((a) => Array.from({ length: n }, (_, i) => (i < a.length ? a[i] : null))), n);
});
def('Table.FromRecords', ['records', '?columns', '?missingField'], (records, cols) => {
  const recs = asList(records).toArray();
  let names;
  let types = null;
  if (cols === undefined || cols === null) {
    names = [];
    for (const r of recs) for (const n of asRecord(r).names) if (!names.includes(n)) names.push(n);
  } else ({ names, types } = columnsFromArg(cols, 0));
  return rowsToTable(names, types || names.map(() => T.any), recs.map((r) => names.map((n) => r.getOr(n, null))));
});
def('Table.FromList', ['list', '?splitter', '?columns', '?default', '?extraValues'], (list, splitter, cols) => {
  const items = asList(list).toArray();
  if (!splitter) {
    const { names, types } = columnsFromArg(cols, 1);
    return rowsToTable(names, types || names.map(() => T.any), items.map((x) => [x]));
  }
  const rows = items.map((x) => (x === null ? [] : asList(splitter.invoke([x])).toArray()));
  const width = Math.max(1, ...rows.map((r) => r.length));
  const { names, types } = columnsFromArg(cols, width);
  return rowsToTable(names, types || names.map(() => T.any), rows.map((r) => names.map((_, i) => (i < r.length ? r[i] : null))));
});
def('Table.Transpose', ['table', '?columns'], (t) => {
  asTable(t);
  const names = Array.from({ length: t.rowCount }, (_, i) => `Column${i + 1}`);
  return mk(names, names.map(() => T.any), t.cols.map(() => []).length ? Array.from({ length: t.rowCount }, (_, r) => t.cols.map((c) => c[r])) : [], t.columns.length);
});
def('Table.InsertRows', ['table', 'offset', 'rows'], (t, o, rows) => {
  asTable(t);
  const recs = asList(rows).toArray();
  const base = Array.from({ length: t.rowCount }, (_, r) => rowArray(t, r));
  const ins = recs.map((rec) => t.columns.map((n) => rec.getOr(n, null)));
  base.splice(o, 0, ...ins);
  return rowsToTable(t.columns, t.types, base);
});
def('Table.RemoveMatchingRows', ['table', 'rows', '?equationCriteria'], (t, rows) => {
  asTable(t);
  const recs = asList(rows).toArray();
  const keep = [];
  for (let r = 0; r < t.rowCount; r++) {
    const rec = t.rowRecord(r);
    if (!recs.some((x) => x.names.every((n) => valuesEqual(rec.getOr(n, null), x.get(n))))) keep.push(r);
  }
  return takeRows(t, keep);
});
def('Table.ReplaceRows', ['table', 'offset', 'count', 'rows'], (t, o, n, rows) => {
  asTable(t);
  const base = Array.from({ length: t.rowCount }, (_, r) => rowArray(t, r));
  base.splice(o, n, ...asList(rows).toArray().map((rec) => t.columns.map((c) => rec.getOr(c, null))));
  return rowsToTable(t.columns, t.types, base);
});
def('Table.Partition', ['table', 'column', 'groups', 'hash'], (t, c, groups, hash) => {
  asTable(t);
  const ci = colIndex(t, c);
  const buckets = Array.from({ length: groups }, () => []);
  for (let r = 0; r < t.rowCount; r++) buckets[Number(hash.invoke([t.cols[ci][r]])) % groups].push(r);
  return listOf(buckets.map((b) => takeRows(t, b)));
});

export { MTable, call, typeOfValue, distinctBy, equalityFn, Thunk, force, mk, rowsToTable, combineTables };
