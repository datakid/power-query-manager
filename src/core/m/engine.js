import { splitSection } from '../pq/section.js';
import { parseExpressionText, MParseError } from './parser.js';
import { compile, Env } from './eval.js';
import { MError, MList, MRecord, MTable, MFunction, MType, Thunk, CellError, force, cell, kindOf, expressionError, T, typeName } from './values.js';
import { RT, QuoinStop, NeedBinding } from './runtime.js';
import { LIB } from './library/index.js';
import { getCulture } from './culture.js';
import { withLimits } from '../limits.js';
import { toText, offsetText } from './convert.js';
import { formatDateTime, formatDuration } from './format.js';
import { compareWithCache } from '../compare/cache-compare.js';

export function parseSection(text) {
  const split = splitSection(text);
  if (split.errors.length) {
    const e = split.errors[0];
    const before = text.slice(0, e.at);
    const line = (before.match(/\r\n|[\r\n]/g) || []).length + 1;
    const col = e.at - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) - 1 + 1;
    return { error: { message: e.message, line, col, start: e.at, end: e.at }, members: [] };
  }
  const members = [];
  for (const m of split.members) {
    const exprText = text.slice(m.exprStart, m.exprEnd);
    try {
      members.push({ ...m, ast: parseExpressionText(exprText, m.exprStart, text) });
    } catch (e) {
      if (e instanceof MParseError) return { error: { message: e.message, line: e.line, col: e.col, start: e.start, end: e.end, member: m.name }, members: [] };
      throw e;
    }
  }
  return { error: null, members, split };
}

export function checkSection(text) {
  const r = parseSection(text);
  return r.error ? { message: r.error.message, line: r.error.line, col: r.error.col } : null;
}

export function isFunctionAst(ast) {
  return ast && ast.t === 'Function';
}

function setupRuntime(opts) {
  const limits = withLimits(opts.limits);
  RT.limits = limits;
  RT.culture = getCulture(opts.culture || 'en-US');
  RT.now = opts.now ? new Date(opts.now) : new Date();
  RT.localOffsetMin = opts.localOffsetMin === undefined ? -new Date(RT.now).getTimezoneOffset() : opts.localOffsetMin;
  RT.snapshot = opts.snapshot || null;
  RT.bindings = opts.bindings instanceof Map ? opts.bindings : new Map(Object.entries(opts.bindings || {}));
  RT.flags = new Set();
  RT.deadline = Date.now() + limits.timeoutMs;
  RT.counter = 0;
  RT.depth = 0;
  RT.seed = opts.seed === undefined ? 1 : opts.seed;
  RT.useUpstream = !!opts.useUpstream;
}

function evaluate(opts) {
  setupRuntime(opts);
  const parsed = parseSection(opts.sectionText);
  if (parsed.error) return { status: 'parse-error', error: parsed.error };
  const memberMap = new Map();
  const ctx = {
    resolveGlobal(name) {
      if (memberMap.has(name)) return cell(force(memberMap.get(name)));
      if (LIB.has(name)) {
        const v = LIB.get(name);
        if (v instanceof Thunk && v.dynamic) return v.dynamic();
        return v;
      }
      if (name === '#shared') return sharedRecord(memberMap);
      if (name === '#sections') return MRecord.from({ Section1: sharedRecord(memberMap, true) });
      throw expressionError(`The name '${name}' wasn't recognized.  Make sure it's spelled correctly.`, name);
    },
    resolveMember(name) {
      if (!memberMap.has(name)) throw expressionError(`The name '${name}' wasn't recognized.  Make sure it's spelled correctly.`, name);
      return cell(force(memberMap.get(name)));
    }
  };
  const root = new Env(null);
  for (const m of parsed.members) {
    const run = compile(m.ast, ctx);
    memberMap.set(m.name, new Thunk(() => run(root)));
  }
  RT.members = memberMap;
  RT.hasMember = (n) => memberMap.has(n);
  RT.lazyMember = (n) => memberMap.get(n);
  RT.evalMember = (n) => cell(force(memberMap.get(n)));
  RT.evalText = (text, env) => {
    const ast = parseExpressionText(text);
    const scopeEnv = new Env(null);
    if (env instanceof MRecord) env.names.forEach((n, i) => scopeEnv.vars.set(n, env.entries[i]));
    return compile(ast, ctx)(scopeEnv);
  };
  const member = parsed.members.find((m) => m.name === opts.queryName);
  const steps = member && member.ast.t === 'Let' ? member.ast.bindings.map((b) => b.name) : [];
  if (opts.step && member && member.ast.t === 'Let' && steps.includes(opts.step)) {
    const run = compile({ ...member.ast, body: { t: 'Identifier', name: opts.step, inclusive: false } }, ctx);
    memberMap.set(opts.queryName, new Thunk(() => run(root)));
  }
  const target = memberMap.get(opts.queryName);
  if (!target) return { status: 'error', error: { reason: 'Quoin.Query', message: `The query '${opts.queryName}' was not found.`, detail: null } };
  const value = cell(force(target));
  return { status: 'ok', value, isFunction: isFunctionAst(member.ast), members: parsed.members.map((m) => m.name), steps };
}

function sharedRecord(memberMap, membersOnly) {
  const names = [...memberMap.keys()];
  const libNames = membersOnly ? [] : [...LIB.keys()].filter((n) => !memberMap.has(n));
  const all = [...names, ...libNames];
  return new MRecord(all, all.map((n) => new Thunk(() => (memberMap.has(n) ? cell(force(memberMap.get(n))) : LIB.get(n) instanceof Thunk && LIB.get(n).dynamic ? LIB.get(n).dynamic() : LIB.get(n)))));
}

export function runOnce(opts) {
  const started = Date.now();
  try {
    const r = evaluate(opts);
    if (r.status !== 'ok') return r;
    const flags = [...RT.flags];
    let compare = null;
    if (opts.compareTo && r.value instanceof MTable) {
      compare = flags.includes('time-dependent') ? { disabled: 'time' } : flags.includes('non-deterministic') ? { disabled: 'random' } : compareWithCache(r.value, opts.compareTo);
    }
    return { status: 'ok', result: serializeResult(r.value, r.isFunction, opts), value: r.value, steps: r.steps, flags, compare, durationMs: Date.now() - started };
  } catch (e) {
    if (e instanceof NeedBinding) return { status: 'need-binding', kind: e.kind, key: e.key };
    if (e instanceof QuoinStop) return { status: 'stopped', code: e.code, detail: e.detail };
    if (e instanceof MError) return { status: 'error', error: { reason: e.reason, message: e.mMessage, detail: describeDetail(e.detail) }, flags: [...RT.flags] };
    if (e instanceof RangeError && /call stack/i.test(e.message)) return { status: 'stopped', code: 'm.depth', detail: null };
    throw e;
  }
}

function describeDetail(d) {
  if (d === null || d === undefined) return null;
  try {
    return typeof d === 'string' ? d : serializeValue(d, 0, { maxRows: 5 });
  } catch {
    return null;
  }
}

export async function runQuery(opts, requestBinding) {
  const bindings = opts.bindings instanceof Map ? new Map(opts.bindings) : new Map(Object.entries(opts.bindings || {}));
  for (let round = 0; round < 50; round++) {
    const r = runOnce({ ...opts, bindings });
    if (r.status !== 'need-binding') return r;
    if (!requestBinding) return r;
    const b = await requestBinding(r.kind, r.key);
    if (!b) return { status: 'error', error: { reason: 'DataSource.Error', message: `No file was provided for ${r.key}.`, detail: r.key } };
    bindings.set(r.key, b);
  }
  return { status: 'error', error: { reason: 'Quoin.Bindings', message: 'Too many files were requested.', detail: null } };
}

const MAX_NESTED = 50;

export function serializeValue(v, depth, o) {
  const k = kindOf(v);
  const culture = RT.culture || getCulture('en-US');
  switch (k) {
    case 'null':
    case 'logical':
    case 'text':
      return v;
    case 'number':
      if (Number.isNaN(v)) return { k: 'number', special: 'NaN' };
      if (!Number.isFinite(v)) return { k: 'number', special: v > 0 ? 'Infinity' : '-Infinity' };
      return Object.is(v, -0) ? { k: 'number', special: '-0' } : v;
    case 'date':
    case 'time':
    case 'datetime':
      return { k, text: formatDateTime(v, k === 'date' ? 'yyyy-MM-dd' : k === 'time' ? 'HH:mm:ss' : "yyyy-MM-dd'T'HH:mm:ss", culture), ticks: v.ticks !== undefined ? v.ticks.toString() : String(v.days) };
    case 'datetimezone':
      return { k, text: `${formatDateTime(v, "yyyy-MM-dd'T'HH:mm:ss", culture)}${offsetText(v.offsetMin)}`, ticks: v.ticks.toString(), offsetMin: v.offsetMin };
    case 'duration':
      return { k, text: formatDuration(v.ticks), ticks: v.ticks.toString() };
    case 'binary':
      return { k, text: `Binary (${v.bytes.length} bytes)`, length: v.bytes.length };
    case 'list':
      if (depth >= 3) return { k, text: `List (${v.length} items)`, count: v.length };
      return { k, count: v.length, items: v.items.slice(0, o.maxRows).map((x) => serializeNested(x, depth + 1, o)), truncated: v.length > o.maxRows };
    case 'record':
      if (depth >= 3) return { k, text: 'Record' };
      return { k, names: v.names, values: v.entries.slice(0, MAX_NESTED).map((x) => serializeNested(x, depth + 1, o)) };
    case 'table':
      if (depth >= 3) return { k, text: `Table (${v.rowCount} rows)`, count: v.rowCount };
      return serializeTable(v, depth + 1, o);
    case 'function':
      return { k, text: 'Function', arity: v.params.length };
    case 'type':
      return { k, text: typeName(v) };
    default:
      return String(v);
  }
}

function serializeNested(x, depth, o) {
  try {
    return serializeValue(cell(force(x)), depth, o);
  } catch (e) {
    if (e instanceof MError) return { k: 'error', reason: e.reason, message: e.mMessage };
    throw e;
  }
}

export function serializeTable(t, depth, o) {
  const n = Math.min(t.rowCount, o.maxRows);
  const rows = [];
  for (let r = 0; r < n; r++) rows.push(t.cols.map((c) => serializeNested(c[r], depth, o)));
  return {
    k: 'table',
    columns: t.columns.map((name, i) => ({ name, type: typeName(t.types[i] || T.any), facet: (t.types[i] && t.types[i].facet) || null })),
    rowCount: t.rowCount,
    rows,
    truncated: t.rowCount > n
  };
}

export function serializeTableRows(t, start, count) {
  const o = { maxRows: 1000 };
  const end = Math.min(t.rowCount, start + count);
  const rows = [];
  for (let r = start; r < end; r++) rows.push(t.cols.map((c) => serializeNested(c[r], 1, o)));
  return rows;
}

export function serializeResult(v, isFunction, opts) {
  const o = { maxRows: opts.previewRows || 1000 };
  if (isFunction || v instanceof MFunction) return { kind: 'function', arity: v.params.length, params: v.params.map((p) => ({ name: p.name, optional: p.optional })) };
  return { kind: kindOf(v), value: serializeValue(v, 0, o) };
}

export { MTable, MList, MType, CellError, toText };
