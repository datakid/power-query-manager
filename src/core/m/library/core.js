import { MFunction, MType, MRecord, MList, MTable, Thunk, force, cell, expressionError, kindOf, kindLabel, T, FACETS, prim, listOf } from '../values.js';
import { cannotConvert } from '../eval.js';

export const LIB = new Map();
export const COVERAGE = new Map();

export function def(name, spec, fn, status = 'full') {
  const params = spec.map((s) => (s.startsWith('?') ? { name: s.slice(1), optional: true, type: null } : { name: s, optional: false, type: null }));
  const f = new MFunction({
    name,
    params,
    fn: (args) => {
      const vals = new Array(params.length);
      for (let i = 0; i < params.length; i++) vals[i] = i < args.length ? cell(force(args[i])) : undefined;
      const r = fn(...vals);
      return r === undefined ? null : r;
    }
  });
  LIB.set(name, f);
  COVERAGE.set(name, status);
  return f;
}

export function defLazy(name, spec, fn, status = 'full') {
  const params = spec.map((s) => (s.startsWith('?') ? { name: s.slice(1), optional: true, type: null } : { name: s, optional: false, type: null }));
  const f = new MFunction({ name, params, fn: (args) => {
    const r = fn(...args);
    return r === undefined ? null : r;
  } });
  LIB.set(name, f);
  COVERAGE.set(name, status);
}

export function defValue(name, value) {
  LIB.set(name, value);
  COVERAGE.set(name, 'full');
}

export function defGetter(name, getter) {
  LIB.set(name, new Thunk(getter));
  COVERAGE.set(name, 'full');
  LIB.get(name).dynamic = getter;
}

export function unsupported(name, why = 'unsupported') {
  const f = new MFunction({
    name,
    params: [],
    fn: () => {
      const e = expressionError(`${name} is not available in Quoin.`, name);
      e.reason = 'Quoin.Unsupported';
      throw e;
    }
  });
  f.variadic = true;
  f.invoke = (args) => f.fn(args);
  LIB.set(name, f);
  COVERAGE.set(name, why);
}

export const isNull = (v) => v === null || v === undefined;

export function asTable(v, fn) {
  if (!(v instanceof MTable)) throw cannotConvert(v, 'Table');
  return v;
}

export function asList(v) {
  if (!(v instanceof MList)) throw cannotConvert(v, 'List');
  return v;
}

export function asRecord(v) {
  if (!(v instanceof MRecord)) throw cannotConvert(v, 'Record');
  return v;
}

export function asFn(v) {
  if (!(v instanceof MFunction)) throw cannotConvert(v, 'Function');
  return v;
}

export function asText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw cannotConvert(v, 'Text');
  return v;
}

export function asNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number') throw cannotConvert(v, 'Number');
  return v;
}

export function asLogicalArg(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'boolean') throw cannotConvert(v, 'Logical');
  return v;
}

export function textList(v) {
  if (typeof v === 'string') return [v];
  return asList(v).toArray().map((x) => {
    if (typeof x !== 'string') throw cannotConvert(x, 'Text');
    return x;
  });
}

export const call = (f, ...args) => f.invoke(args);

export const enumValue = (n) => n;

export function defType(name, type) {
  LIB.set(name, type);
  COVERAGE.set(name, 'full');
}

export function facetType(name) {
  const [facet, base] = FACETS[name];
  return prim(base, false, facet);
}

export { T, listOf, kindOf, kindLabel, MType, expressionError };
