import { MList, MRecord, MTable, MFunction, Thunk, force, cell, expressionError, kindOf, valuesEqual, compareValues, listOf, mkDuration, T, MType } from '../values.js';
import { RT, tick, checkRows, random } from '../runtime.js';
import { def, defLazy, asList, asFn, asNumber, call } from './core.js';
import { comparerFn } from './misc.js';
import { cannotConvert } from '../eval.js';

export function valueKey(v) {
  v = cell(force(v));
  switch (kindOf(v)) {
    case 'null':
      return 'n';
    case 'logical':
      return v ? 'bT' : 'bF';
    case 'number':
      return Object.is(v, -0) ? 'd0' : `d${v}`;
    case 'text':
      return `s${v}`;
    case 'date':
      return `D${v.days}`;
    case 'time':
      return `T${v.ticks}`;
    case 'datetime':
      return `Z${v.ticks}`;
    case 'datetimezone':
      return `z${v.ticks - BigInt(v.offsetMin) * 600000000n}`;
    case 'duration':
      return `u${v.ticks}`;
    case 'binary':
      return `x${Array.from(v.bytes).join(',')}`;
    case 'list':
      return `[${v.toArray().map(valueKey).join('|')}]`;
    case 'record':
      return `{${v.names.map((n) => `${n}=${valueKey(v.get(n))}`).join('|')}}`;
    default:
      return `o${Math.random()}`;
  }
}

export function equalityFn(criteria) {
  if (criteria === undefined || criteria === null) return null;
  const f = asFn(criteria);
  if (f.params.length === 1) return (a, b) => valuesEqual(f.invoke([a]), f.invoke([b]));
  return (a, b) => {
    const r = f.invoke([a, b]);
    return typeof r === 'boolean' ? r : Number(r) === 0;
  };
}

function sortComparer(criteria) {
  if (criteria === undefined || criteria === null) return (a, b) => compareValues(a, b);
  const list = criteria instanceof MList && !(criteria.length === 2 && typeof criteria.at(1) === 'number' && !(criteria.at(0) instanceof MFunction) && false) ? criteria : null;
  const parts = list ? list.toArray() : [criteria];
  const cmps = parts.map((p) => {
    if (typeof p === 'number') return p === 1 ? (a, b) => compareValues(b, a) : (a, b) => compareValues(a, b);
    if (p instanceof MFunction) {
      if (p.params.length === 1) return (a, b) => compareValues(p.invoke([a]), p.invoke([b]));
      return (a, b) => Number(p.invoke([a, b]));
    }
    if (p instanceof MList) {
      const [key, order] = p.toArray();
      const kf = key instanceof MFunction ? key : null;
      const desc = order === 1;
      return (a, b) => {
        const c = kf ? compareValues(kf.invoke([a]), kf.invoke([b])) : compareValues(a, b);
        return desc ? -c : c;
      };
    }
    throw expressionError('Invalid sort criteria.', p);
  });
  return (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r) return r;
    }
    return 0;
  };
}

export function stableSort(arr, cmp) {
  return arr.map((v, i) => ({ v, i })).sort((x, y) => cmp(x.v, y.v) || x.i - y.i).map((x) => x.v);
}

export function distinctBy(items, equality) {
  const out = [];
  if (!equality) {
    const seen = new Set();
    for (const x of items) {
      const k = valueKey(x);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(x);
      }
    }
    return out;
  }
  for (const x of items) if (!out.some((y) => equality(x, y))) out.push(x);
  return out;
}

const nonNull = (arr) => arr.filter((x) => x !== null);

function sumOf(items) {
  const vals = nonNull(items);
  if (!vals.length) return null;
  if (kindOf(vals[0]) === 'duration') return mkDuration(vals.reduce((a, b) => a + b.ticks, 0n));
  let s = 0;
  for (const v of vals) {
    if (typeof v !== 'number') throw cannotConvert(v, 'Number');
    s += v;
  }
  return s;
}

def('List.Count', ['list'], (l) => asList(l).length);
def('List.NonNullCount', ['list'], (l) => nonNull(asList(l).toArray()).length);
def('List.Sum', ['list', '?precision'], (l) => sumOf(asList(l).toArray()));
def('List.Product', ['list', '?precision'], (l) => {
  const v = nonNull(asList(l).toArray());
  return v.length ? v.reduce((a, b) => a * b, 1) : null;
});
def('List.Average', ['list', '?precision'], (l) => {
  const v = nonNull(asList(l).toArray());
  if (!v.length) return null;
  if (kindOf(v[0]) === 'duration') return mkDuration(v.reduce((a, b) => a + b.ticks, 0n) / BigInt(v.length));
  return sumOf(v) / v.length;
});
function extreme(l, dflt, crit, includeNulls, sign) {
  const cmp = crit === undefined || crit === null ? (a, b) => compareValues(a, b) : sortComparer(crit);
  let items = asList(l).toArray();
  if (!includeNulls) items = nonNull(items);
  if (!items.length) return dflt === undefined ? null : dflt;
  let best = items[0];
  for (const x of items) if (sign * cmp(x, best) > 0) best = x;
  return best;
}
def('List.Max', ['list', '?default', '?comparisonCriteria', '?includeNulls'], (l, d, c, n) => extreme(l, d, c, n, 1));
def('List.Min', ['list', '?default', '?comparisonCriteria', '?includeNulls'], (l, d, c, n) => extreme(l, d, c, n, -1));
def('List.MaxN', ['list', 'countOrCondition', '?comparisonCriteria', '?includeNulls'], (l, n, c) => listOf(stableSort(nonNull(asList(l).toArray()), (a, b) => compareValues(b, a)).slice(0, n)));
def('List.MinN', ['list', 'countOrCondition', '?comparisonCriteria', '?includeNulls'], (l, n) => listOf(stableSort(nonNull(asList(l).toArray()), (a, b) => compareValues(a, b)).slice(0, n)));
def('List.Median', ['list', '?comparisonCriteria'], (l) => {
  const v = stableSort(nonNull(asList(l).toArray()), compareValues);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : typeof v[m] === 'number' ? (v[m - 1] + v[m]) / 2 : v[m - 1];
});
function modes(l) {
  const items = nonNull(asList(l).toArray());
  const counts = new Map();
  for (const x of items) {
    const k = valueKey(x);
    const e = counts.get(k) || { v: x, n: 0 };
    e.n++;
    counts.set(k, e);
  }
  const max = Math.max(0, ...[...counts.values()].map((e) => e.n));
  return [...counts.values()].filter((e) => e.n === max).map((e) => e.v);
}
def('List.Mode', ['list', '?equationCriteria'], (l) => {
  const m = modes(l);
  if (!m.length) throw expressionError('The list is empty.');
  return m[0];
});
def('List.Modes', ['list', '?equationCriteria'], (l) => listOf(modes(l)));
def('List.StandardDeviation', ['list'], (l) => {
  const v = nonNull(asList(l).toArray());
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (v.length - 1));
});
def('List.Percentile', ['list', 'percentiles', '?options'], (l, p) => {
  const v = stableSort(nonNull(asList(l).toArray()), compareValues);
  const calc = (q) => {
    if (!v.length) return null;
    const pos = q * (v.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };
  return p instanceof MList ? listOf(p.toArray().map(calc)) : calc(p);
}, 'full');
def('List.Distinct', ['list', '?equationCriteria'], (l, c) => listOf(distinctBy(asList(l).toArray(), equalityFn(c))));
def('List.Sort', ['list', '?comparisonCriteria'], (l, c) => listOf(stableSort(asList(l).toArray(), sortComparer(c))));
def('List.Select', ['list', 'selection'], (l, f) => {
  asFn(f);
  const out = [];
  for (const x of asList(l).toArray()) {
    tick();
    const r = f.invoke([x]);
    if (typeof r !== 'boolean') throw cannotConvert(r, 'Logical');
    if (r) out.push(x);
  }
  return listOf(out);
});
def('List.Transform', ['list', 'transform'], (l, f) => {
  asFn(f);
  return listOf(asList(l).items.map((x) => new Thunk(() => f.invoke([cell(force(x))]))));
});
def('List.TransformMany', ['list', 'collectionTransform', 'resultTransform'], (l, ct, rt) => {
  const out = [];
  for (const x of asList(l).toArray()) for (const y of asList(ct.invoke([x])).toArray()) out.push(rt.invoke([x, y]));
  return listOf(out);
});
def('List.Accumulate', ['list', 'seed', 'accumulator'], (l, seed, f) => {
  let acc = seed;
  for (const x of asList(l).toArray()) {
    tick();
    acc = f.invoke([acc, x]);
  }
  return acc;
});
def('List.Generate', ['initial', 'condition', 'next', '?selector'], (init, cond, next, sel) => {
  const out = [];
  let state = init.invoke([]);
  while (true) {
    tick();
    const c = cond.invoke([state]);
    if (c !== true) break;
    out.push(sel ? sel.invoke([state]) : state);
    checkRows(out.length);
    state = next.invoke([state]);
  }
  return listOf(out);
});
def('List.Combine', ['lists'], (ls) => listOf(asList(ls).toArray().flatMap((l) => [...asList(l).items])));
def('List.Zip', ['lists'], (ls) => {
  const arrs = asList(ls).toArray().map((l) => asList(l).items);
  const n = Math.max(0, ...arrs.map((a) => a.length));
  return listOf(Array.from({ length: n }, (_, i) => listOf(arrs.map((a) => (i < a.length ? a[i] : null)))));
});
def('List.First', ['list', '?default'], (l, d) => (asList(l).length ? l.at(0) : d === undefined ? null : d));
def('List.Last', ['list', '?default'], (l, d) => (asList(l).length ? l.at(l.length - 1) : d === undefined ? null : d));
def('List.FirstN', ['list', 'countOrCondition'], (l, n) => {
  asList(l);
  if (typeof n === 'number') return listOf(l.items.slice(0, n));
  const out = [];
  for (const x of l.toArray()) {
    if (n.invoke([x]) !== true) break;
    out.push(x);
  }
  return listOf(out);
});
def('List.LastN', ['list', 'countOrCondition'], (l, n) => {
  asList(l);
  if (typeof n === 'number') return listOf(n === 0 ? [] : l.items.slice(-n));
  const arr = l.toArray();
  let i = arr.length;
  while (i > 0 && n.invoke([arr[i - 1]]) === true) i--;
  return listOf(arr.slice(i));
});
def('List.Skip', ['list', '?countOrCondition'], (l, n) => {
  asList(l);
  if (n === undefined || n === null) return listOf(l.items.slice(1));
  if (typeof n === 'number') return listOf(l.items.slice(n));
  const arr = l.toArray();
  let i = 0;
  while (i < arr.length && n.invoke([arr[i]]) === true) i++;
  return listOf(arr.slice(i));
});
def('List.RemoveFirstN', ['list', '?countOrCondition'], (l, n) => listOf(asList(l).items.slice(typeof n === 'number' ? n : 1)));
def('List.RemoveLastN', ['list', '?countOrCondition'], (l, n) => listOf(asList(l).items.slice(0, Math.max(0, l.length - (typeof n === 'number' ? n : 1)))));
def('List.Range', ['list', 'offset', '?count'], (l, o, n) => {
  asList(l);
  if (o < 0 || o > l.length) throw expressionError('There weren\'t enough elements in the enumeration to complete the operation.', o);
  if (n !== undefined && n !== null && o + n > l.length) throw expressionError('There weren\'t enough elements in the enumeration to complete the operation.', n);
  return listOf(l.items.slice(o, n === undefined || n === null ? undefined : o + n));
});
function contains(l, v, cmp) {
  const same = cmp ? equalityFn(cmp) : valuesEqual;
  return asList(l).toArray().some((x) => same(x, v));
}
def('List.Contains', ['list', 'value', '?equationCriteria'], (l, v, c) => contains(l, v, c));
def('List.ContainsAny', ['list', 'values', '?equationCriteria'], (l, vs, c) => asList(vs).toArray().some((v) => contains(l, v, c)));
def('List.ContainsAll', ['list', 'values', '?equationCriteria'], (l, vs, c) => asList(vs).toArray().every((v) => contains(l, v, c)));
def('List.PositionOf', ['list', 'value', '?occurrence', '?equationCriteria'], (l, v, occ, c) => {
  const same = c ? equalityFn(c) : valuesEqual;
  const arr = asList(l).toArray();
  const hits = [];
  arr.forEach((x, i) => {
    if (same(x, v)) hits.push(i);
  });
  const mode = occ === undefined || occ === null ? 0 : occ;
  if (mode === 2) return listOf(hits);
  if (!hits.length) return -1;
  return mode === 1 ? hits[hits.length - 1] : hits[0];
});
def('List.PositionOfAny', ['list', 'values', '?occurrence', '?equationCriteria'], (l, vs, occ) => {
  const set = asList(vs).toArray();
  const hits = [];
  asList(l).toArray().forEach((x, i) => {
    if (set.some((s) => valuesEqual(s, x))) hits.push(i);
  });
  if (occ === 2) return listOf(hits);
  if (!hits.length) return -1;
  return occ === 1 ? hits[hits.length - 1] : hits[0];
});
def('List.Positions', ['list'], (l) => listOf(Array.from({ length: asList(l).length }, (_, i) => i)));
def('List.Numbers', ['start', 'count', '?increment'], (s, n, inc) => {
  checkRows(n);
  const step = inc === undefined || inc === null ? 1 : inc;
  return listOf(Array.from({ length: n }, (_, i) => s + i * step));
});
def('List.Reverse', ['list'], (l) => listOf([...asList(l).items].reverse()));
def('List.RemoveNulls', ['list'], (l) => listOf(nonNull(asList(l).toArray())));
def('List.RemoveItems', ['list1', 'list2'], (a, b) => {
  const rm = asList(b).toArray();
  return listOf(asList(a).toArray().filter((x) => !rm.some((y) => valuesEqual(x, y))));
});
def('List.RemoveMatchingItems', ['list1', 'list2', '?equationCriteria'], (a, b) => {
  const rm = asList(b).toArray();
  return listOf(asList(a).toArray().filter((x) => !rm.some((y) => valuesEqual(x, y))));
});
def('List.ReplaceValue', ['list', 'oldValue', 'newValue', 'replacer'], (l, o, n, r) => listOf(asList(l).toArray().map((x) => r.invoke([x, o, n]))));
def('List.ReplaceMatchingItems', ['list', 'replacements', '?equationCriteria'], (l, reps) => {
  const pairs = asList(reps).toArray().map((p) => p.toArray());
  return listOf(asList(l).toArray().map((x) => {
    const hit = pairs.find((p) => valuesEqual(p[0], x));
    return hit ? hit[1] : x;
  }));
});
def('List.Union', ['lists', '?equationCriteria'], (ls, c) => listOf(distinctBy(asList(ls).toArray().flatMap((l) => asList(l).toArray()), equalityFn(c))));
def('List.Intersect', ['lists', '?equationCriteria'], (ls) => {
  const arrs = asList(ls).toArray().map((l) => asList(l).toArray());
  if (!arrs.length) return listOf([]);
  return listOf(distinctBy(arrs[0].filter((x) => arrs.every((a) => a.some((y) => valuesEqual(x, y)))), null));
});
def('List.Difference', ['list1', 'list2', '?equationCriteria'], (a, b) => {
  const remove = asList(b).toArray();
  const out = [];
  for (const x of asList(a).toArray()) {
    const i = remove.findIndex((y) => valuesEqual(x, y));
    if (i >= 0) remove.splice(i, 1);
    else out.push(x);
  }
  return listOf(out);
});
def('List.IsEmpty', ['list'], (l) => asList(l).length === 0);
def('List.Buffer', ['list'], (l) => listOf(asList(l).toArray()));
def('List.MatchesAll', ['list', 'condition'], (l, f) => asList(l).toArray().every((x) => f.invoke([x]) === true));
def('List.MatchesAny', ['list', 'condition'], (l, f) => asList(l).toArray().some((x) => f.invoke([x]) === true));
def('List.AllTrue', ['list'], (l) => asList(l).toArray().every((x) => x === true));
def('List.AnyTrue', ['list'], (l) => asList(l).toArray().some((x) => x === true));
def('List.Split', ['list', 'pageSize'], (l, n) => {
  const arr = asList(l).items;
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(listOf(arr.slice(i, i + n)));
  return listOf(out);
});
def('List.Single', ['list'], (l) => {
  if (asList(l).length !== 1) throw expressionError('Expression.Error: There were too many elements in the enumeration to complete the operation.');
  return l.at(0);
});
def('List.SingleOrDefault', ['list', '?default'], (l, d) => {
  if (asList(l).length > 1) throw expressionError('Expression.Error: There were too many elements in the enumeration to complete the operation.');
  return l.length ? l.at(0) : d === undefined ? null : d;
});
def('List.Repeat', ['list', 'count'], (l, n) => listOf(Array.from({ length: n }, () => [...asList(l).items]).flat()));
def('List.InsertRange', ['list', 'offset', 'values'], (l, o, v) => listOf([...asList(l).items.slice(0, o), ...asList(v).items, ...l.items.slice(o)]));
def('List.RemoveRange', ['list', 'index', '?count'], (l, i, n) => listOf([...asList(l).items.slice(0, i), ...l.items.slice(i + (n === undefined ? 1 : n))]));
def('List.Alternate', ['list', 'count', '?repeatInterval', '?offset'], (l, count, interval, offset) => {
  const arr = asList(l).items;
  const out = [];
  const skip = offset || 0;
  const rep = interval === undefined ? 1 : interval;
  let i = skip;
  out.push(...arr.slice(0, skip));
  while (i < arr.length) {
    i += count;
    out.push(...arr.slice(i, i + rep));
    i += rep;
  }
  return listOf(out);
});
def('List.FindText', ['list', 'text'], (l, t) => listOf(asList(l).toArray().filter((x) => (typeof x === 'string' ? x.toLowerCase().includes(t.toLowerCase()) : x instanceof MRecord && x.values().some((v) => typeof v === 'string' && v.toLowerCase().includes(t.toLowerCase()))))));
def('List.Random', ['count', '?seed'], (n, seed) => {
  if (typeof seed === 'number') RT.seed = seed;
  return listOf(Array.from({ length: n }, () => random()));
});


export { MTable, MType, T, asNumber, call, comparerFn, defLazy };
