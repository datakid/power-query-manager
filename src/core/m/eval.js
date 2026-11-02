import {
  MError, MList, MRecord, MTable, MFunction, MType, Thunk, force, cell, CellError, T, FACETS, nullable,
  expressionError, kindOf, kindLabel, valuesEqual, compareValues, conforms, typeName, listOf, mkDate, mkTime, mkDateTime, mkDtz, mkDuration,
  splitDateTime, joinDateTime, TICKS_PER_DAY, tableFromRows
} from './values.js';
import { RT, QuoinStop, tick } from './runtime.js';

export class Env {
  constructor(parent) {
    this.parent = parent;
    this.vars = new Map();
  }

  find(name) {
    for (let e = this; e; e = e.parent) {
      const v = e.vars.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }
}

const NUMERIC_OPS = new Set(['+', '-', '*', '/']);

export function cannotConvert(v, target) {
  return expressionError(`We cannot convert the value ${describe(v)} to type ${target}.`, v);
}

export function describe(v) {
  const k = kindOf(v);
  if (k === 'text') return `"${v}"`;
  if (k === 'number' || k === 'logical') return String(v);
  if (k === 'null') return 'null';
  return kindLabel(v);
}

function operandError(op, a, b) {
  return expressionError(`Operator ${op} cannot be applied to operands of type ${kindLabel(a)} and ${kindLabel(b)}.`, [a, b]);
}

const TEMPORAL = new Set(['date', 'time', 'datetime', 'datetimezone']);

function addTemporal(a, b, sign, op) {
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka === 'duration' && kb === 'duration') return mkDuration(sign > 0 ? a.ticks + b.ticks : a.ticks - b.ticks);
  let base;
  let delta;
  if (kb === 'duration' && TEMPORAL.has(ka)) {
    base = a;
    delta = sign > 0 ? b.ticks : -b.ticks;
  } else if (ka === 'duration' && sign > 0 && TEMPORAL.has(kb)) {
    base = b;
    delta = a.ticks;
  } else throw operandError(op, a, b);
  const kind = kindOf(base);
  if (kind === 'date') {
    const total = BigInt(base.days) * TICKS_PER_DAY + delta;
    let days = total / TICKS_PER_DAY;
    if (total % TICKS_PER_DAY < 0n) days -= 1n;
    return mkDate(Number(days));
  }
  if (kind === 'time') {
    let t = (BigInt(Math.round(base.ticks)) + delta) % TICKS_PER_DAY;
    if (t < 0n) t += TICKS_PER_DAY;
    return mkTime(Number(t));
  }
  if (kind === 'datetime') return mkDateTime(base.ticks + delta);
  return mkDtz(base.ticks + delta, base.offsetMin);
}

export function binaryOp(op, a, b) {
  switch (op) {
    case '=':
      return valuesEqual(a, b);
    case '<>':
      return !valuesEqual(a, b);
    case '<':
    case '>':
    case '<=':
    case '>=': {
      if (a === null || a === undefined || b === null || b === undefined) return null;
      const c = compareValues(a, b);
      if (op === '<') return c < 0;
      if (op === '>') return c > 0;
      if (op === '<=') return c <= 0;
      return c >= 0;
    }
    case '&':
      return concat(a, b);
    default:
      break;
  }
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (NUMERIC_OPS.has(op)) {
    if (an || bn) {
      const other = an ? b : a;
      const ko = kindOf(other);
      if (an && bn) return null;
      if (ko === 'number' || ko === 'duration' || (ko !== 'text' && ko !== 'logical' && ko !== 'list' && ko !== 'record' && ko !== 'table' && ko !== 'function' && ko !== 'type' && ko !== 'binary')) return null;
      throw operandError(op, a, b);
    }
    if (ka === 'number' && kb === 'number') {
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      return a / b;
    }
    if (op === '+') return addTemporal(a, b, 1, op);
    if (op === '-') {
      if (ka === kb && (ka === 'date' || ka === 'datetime' || ka === 'datetimezone' || ka === 'time')) {
        if (ka === 'date') return mkDuration(BigInt(a.days - b.days) * TICKS_PER_DAY);
        if (ka === 'time') return mkDuration(BigInt(Math.round(a.ticks - b.ticks)));
        if (ka === 'datetime') return mkDuration(a.ticks - b.ticks);
        return mkDuration(a.ticks - BigInt(a.offsetMin) * 600000000n - (b.ticks - BigInt(b.offsetMin) * 600000000n));
      }
      if (ka === 'datetime' && kb === 'date') return mkDuration(a.ticks - BigInt(b.days) * TICKS_PER_DAY);
      if (ka === 'date' && kb === 'datetime') return mkDuration(BigInt(a.days) * TICKS_PER_DAY - b.ticks);
      return addTemporal(a, b, -1, op);
    }
    if (op === '*') {
      if (ka === 'duration' && kb === 'number') return mkDuration(BigInt(Math.round(Number(a.ticks) * b)));
      if (ka === 'number' && kb === 'duration') return mkDuration(BigInt(Math.round(a * Number(b.ticks))));
    }
    if (op === '/') {
      if (ka === 'duration' && kb === 'number') return mkDuration(BigInt(Math.round(Number(a.ticks) / b)));
      if (ka === 'duration' && kb === 'duration') return Number(a.ticks) / Number(b.ticks);
    }
    throw operandError(op, a, b);
  }
  throw expressionError(`Unknown operator ${op}.`);
}

function concat(a, b) {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) {
    const other = an ? b : a;
    const ko = kindOf(other);
    if ((an && bn) || ['text', 'list', 'record', 'table', 'date', 'time', 'binary'].includes(ko)) return null;
    throw operandError('&', a, b);
  }
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka === 'text' && kb === 'text') return a + b;
  if (ka === 'list' && kb === 'list') return listOf([...a.items, ...b.items]);
  if (ka === 'record' && kb === 'record') {
    const names = [...a.names];
    const entries = [...a.entries];
    b.names.forEach((n, i) => {
      const at = names.indexOf(n);
      if (at >= 0) entries[at] = b.entries[i];
      else {
        names.push(n);
        entries.push(b.entries[i]);
      }
    });
    return new MRecord(names, entries);
  }
  if (ka === 'table' && kb === 'table') return RT.tableCombine([a, b]);
  if (ka === 'date' && kb === 'time') return mkDateTime(joinDateTime(a.days, b.ticks));
  throw operandError('&', a, b);
}

export function toLogical(v, op) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'boolean') throw expressionError(`Operator ${op} cannot be applied to operands of type ${kindLabel(v)}.`, v);
  return v;
}

export function unaryOp(op, v) {
  if (op === 'not') {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'boolean') throw expressionError(`Operator not cannot be applied to operand of type ${kindLabel(v)}.`, v);
    return !v;
  }
  if (v === null || v === undefined) return null;
  const k = kindOf(v);
  if (k === 'number') return op === '-' ? -v : v;
  if (k === 'duration') return op === '-' ? mkDuration(-v.ticks) : v;
  throw expressionError(`Operator ${op} cannot be applied to operand of type ${kindLabel(v)}.`, v);
}

export function fieldOf(target, name, optional) {
  const k = kindOf(target);
  if (k === 'record') {
    if (!target.has(name)) {
      if (optional) return null;
      throw expressionError(`The field '${name}' of the record wasn't found.`, name);
    }
    return target.get(name);
  }
  if (k === 'table') {
    const i = target.columnIndex(name);
    if (i < 0) {
      if (optional) return null;
      throw expressionError(`The column '${name}' of the table wasn't found.`, name);
    }
    return listOf(target.cols[i].slice());
  }
  if (k === 'null' && optional) return null;
  throw expressionError(`We cannot apply field access to the type ${kindLabel(target)}.`, target);
}

function matchRecordKey(table, rec) {
  const hits = [];
  for (let r = 0; r < table.rowCount; r++) {
    let ok = true;
    for (const n of rec.names) {
      const ci = table.columnIndex(n);
      if (ci < 0) throw expressionError(`The column '${n}' of the table wasn't found.`, n);
      if (!valuesEqual(table.cols[ci][r], rec.get(n))) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(r);
  }
  return hits;
}

export function itemOf(target, index, optional) {
  const k = kindOf(target);
  if (k === 'list') {
    if (typeof index !== 'number') throw expressionError('We cannot convert the value to type Number.', index);
    if (!Number.isInteger(index) || index < 0) throw expressionError('The index must be a non-negative integer.', index);
    if (index >= target.length) {
      if (optional) return null;
      throw expressionError('There weren\'t enough elements in the enumeration to complete the operation.', index);
    }
    return target.at(index);
  }
  if (k === 'table') {
    if (typeof index === 'number') {
      if (index < 0 || index >= target.rowCount || !Number.isInteger(index)) {
        if (optional) return null;
        throw expressionError('There weren\'t enough elements in the enumeration to complete the operation.', index);
      }
      return target.rowRecord(index);
    }
    if (index instanceof MRecord) {
      const hits = matchRecordKey(target, index);
      if (hits.length === 1) return target.rowRecord(hits[0]);
      if (hits.length === 0) {
        if (optional) return null;
        throw expressionError('The key didn\'t match any rows in the table.', index);
      }
      throw expressionError('The key matched more than one row in the table.', index);
    }
  }
  if (k === 'null' && optional) return null;
  throw expressionError(`We cannot apply indexing to the type ${kindLabel(target)}.`, target);
}

export function typeFromSpec(spec, evalExpr) {
  switch (spec.tk) {
    case 'type':
      return spec.type;
    case 'nullable':
      return nullable(typeFromSpec(spec.inner, evalExpr));
    case 'list':
      return new MType('list', { item: typeFromSpec(spec.item, evalExpr) });
    case 'record':
      return new MType('record', { fields: spec.fields.map((f) => ({ name: f.name, optional: f.optional, type: typeFromSpec(f.type, evalExpr) })), open: spec.open });
    case 'table':
      return new MType('table', { columns: spec.fields.map((f) => ({ name: f.name, type: typeFromSpec(f.type, evalExpr) })), open: spec.open });
    case 'function':
      return new MType('function', { params: spec.params, ret: spec.ret });
    case 'expr': {
      const v = evalExpr(spec.expr);
      if (!(v instanceof MType)) throw expressionError('The expression after "type" must evaluate to a type.', v);
      return v;
    }
    default:
      throw expressionError('Unsupported type expression.');
  }
}

export function assertConforms(v, type, label) {
  if (conforms(v, type)) return v;
  throw expressionError(`We cannot convert the value ${describe(v)} to type ${typeName(type)}.`, v);
}

export function makeFunction(params, returnType, body, env, ctx, name) {
  const fn = new MFunction({
    name,
    params: params.map((p) => ({ name: p.name, optional: p.optional, type: p.type })),
    returnType,
    fn: (args) => {
      RT.depth++;
      if (RT.depth > RT.limits.maxMDepth) {
        RT.depth--;
        throw new QuoinStop('m.depth');
      }
      try {
        const scope = new Env(env);
        params.forEach((p, i) => {
          let v = i < args.length ? args[i] : null;
          if (p.type && i < args.length) {
            const forced = force(v);
            v = assertConforms(forced, p.type, p.name);
          }
          scope.vars.set(p.name, i < args.length ? v : null);
        });
        const result = body(scope);
        if (returnType) return assertConforms(result, returnType, 'return');
        return result;
      } finally {
        RT.depth--;
      }
    }
  });
  return fn;
}

export function compile(node, ctx) {
  const c = (n) => compile(n, ctx);
  switch (node.t) {
    case 'Literal': {
      const v = node.value;
      return () => v;
    }
    case 'Paren':
      return c(node.expr);
    case 'Identifier': {
      const name = node.name;
      return (env) => {
        const v = env.find(name);
        if (v !== undefined) return cell(force(v));
        return ctx.resolveGlobal(name);
      };
    }
    case 'SectionAccess': {
      const name = node.name;
      return () => ctx.resolveMember(name);
    }
    case 'Let': {
      const binds = node.bindings.map((b) => ({ name: b.name, run: c(b.expr) }));
      const body = c(node.body);
      return (env) => {
        const scope = new Env(env);
        for (const b of binds) scope.vars.set(b.name, new Thunk(() => b.run(scope)));
        return body(scope);
      };
    }
    case 'If': {
      const cond = c(node.cond);
      const yes = c(node.yes);
      const no = c(node.no);
      return (env) => {
        const v = cond(env);
        if (typeof v !== 'boolean') throw expressionError('We cannot convert the value to type Logical.', v);
        return v ? yes(env) : no(env);
      };
    }
    case 'Each': {
      const body = c(node.body);
      return (env) => makeFunction([{ name: '_', optional: false, type: null }], null, body, env, ctx, null);
    }
    case 'Function': {
      const body = c(node.body);
      const params = node.params;
      const ret = node.returnType;
      return (env) => makeFunction(params, ret, body, env, ctx, null);
    }
    case 'Invoke': {
      const fnRun = c(node.fn);
      const args = node.args.map((a) => (a.t === 'Literal' ? { lit: true, v: a.value } : { lit: false, run: c(a) }));
      return (env) => {
        tick();
        const f = fnRun(env);
        if (!(f instanceof MFunction)) throw cannotConvert(f, 'Function');
        const vals = args.map((a) => (a.lit ? a.v : new Thunk(() => a.run(env))));
        return f.invoke(vals);
      };
    }
    case 'Field': {
      const target = node.target ? c(node.target) : (env) => cell(force(env.find('_')));
      const { name, optional } = node;
      return (env) => fieldOf(target(env), name, optional);
    }
    case 'Project': {
      const target = node.target ? c(node.target) : (env) => cell(force(env.find('_')));
      const { names, optional } = node;
      return (env) => {
        const t = target(env);
        if (t instanceof MRecord) {
          const present = names.filter((n) => t.has(n));
          if (present.length !== names.length && !optional) throw expressionError(`The field '${names.find((n) => !t.has(n))}' of the record wasn't found.`);
          if (present.length !== names.length) return null;
          return new MRecord(names, names.map((n) => t.get(n)));
        }
        if (t instanceof MTable) return RT.tableSelectColumns(t, names, optional);
        throw expressionError(`We cannot apply field access to the type ${kindLabel(t)}.`, t);
      };
    }
    case 'Item': {
      const target = c(node.target);
      const index = c(node.index);
      const optional = node.optional;
      return (env) => itemOf(target(env), index(env), optional);
    }
    case 'Record': {
      const fields = node.fields.map((f) => ({ name: f.name, run: c(f.expr) }));
      const seen = new Set();
      for (const f of fields) {
        if (seen.has(f.name)) return () => { throw expressionError(`The field name '${f.name}' is defined more than once.`, f.name); };
        seen.add(f.name);
      }
      return (env) => {
        const scope = new Env(env);
        const entries = fields.map((f) => {
          const th = new Thunk(() => f.run(scope));
          scope.vars.set(f.name, th);
          return th;
        });
        return new MRecord(fields.map((f) => f.name), entries);
      };
    }
    case 'List': {
      const items = node.items.map((it) => (it.range ? { range: true, from: c(it.from), to: c(it.to) } : { range: false, lit: it.expr.t === 'Literal', v: it.expr.value, run: it.expr.t === 'Literal' ? null : c(it.expr) }));
      return (env) => {
        const out = [];
        for (const it of items) {
          if (it.range) {
            const a = it.from(env);
            const b = it.to(env);
            if (typeof a === 'number' && typeof b === 'number') {
              for (let x = a; x <= b; x++) {
                tick();
                out.push(x);
                if (out.length > RT.limits.maxRows) throw new QuoinStop('m.rows', { rows: out.length });
              }
            } else if (typeof a === 'string' && typeof b === 'string' && a.length === 1 && b.length === 1) {
              for (let x = a.codePointAt(0); x <= b.codePointAt(0); x++) out.push(String.fromCodePoint(x));
            } else throw expressionError('A list range must have number or single-character text bounds.');
          } else out.push(it.lit ? it.v : new Thunk(() => it.run(env)));
        }
        return listOf(out);
      };
    }
    case 'Binary': {
      const { op } = node;
      const l = c(node.l);
      const r = c(node.r);
      if (op === 'and') {
        return (env) => {
          const a = toLogical(l(env), 'and');
          if (a === false) return false;
          const b = toLogical(r(env), 'and');
          if (b === false) return false;
          return a === null || b === null ? null : true;
        };
      }
      if (op === 'or') {
        return (env) => {
          const a = toLogical(l(env), 'or');
          if (a === true) return true;
          const b = toLogical(r(env), 'or');
          if (b === true) return true;
          return a === null || b === null ? null : false;
        };
      }
      return (env) => binaryOp(op, l(env), r(env));
    }
    case 'Unary': {
      const e = c(node.expr);
      const op = node.op;
      return (env) => unaryOp(op, e(env));
    }
    case 'Is': {
      const e = c(node.expr);
      const t = node.type;
      return (env) => conforms(e(env), t);
    }
    case 'As': {
      const e = c(node.expr);
      const t = node.type;
      return (env) => assertConforms(e(env), t, 'as');
    }
    case 'Meta': {
      const l = c(node.l);
      const r = c(node.r);
      return (env) => {
        const v = l(env);
        const m = r(env);
        if (!(m instanceof MRecord)) throw expressionError('Metadata must be a record.', m);
        if (v instanceof MRecord || v instanceof MTable || v instanceof MList || v instanceof MFunction || v instanceof MType) {
          const copy = Object.create(Object.getPrototypeOf(v));
          Object.assign(copy, v);
          copy.meta = m;
          if (v instanceof MRecord) copy.index = null;
          return copy;
        }
        return v;
      };
    }
    case 'Try': {
      const body = c(node.body);
      const otherwise = node.otherwise ? c(node.otherwise) : null;
      const handler = node.handler ? c(node.handler) : null;
      return (env) => {
        try {
          const v = body(env);
          if (otherwise || handler) return v;
          return MRecord.from({ HasError: false, Value: v });
        } catch (e) {
          if (!(e instanceof MError)) {
            if (e instanceof RangeError) throw new QuoinStop('m.depth');
            throw e;
          }
          if (otherwise) return otherwise(env);
          if (handler) {
            const f = handler(env);
            return f.invoke([errorRecord(e)]);
          }
          return MRecord.from({ HasError: true, Error: errorRecord(e) });
        }
      };
    }
    case 'ErrorRaise': {
      const e = c(node.expr);
      return (env) => {
        const v = e(env);
        if (typeof v === 'string') throw new MError('Expression.Error', v, null);
        if (v instanceof MRecord) {
          throw new MError(String(v.getOr('Reason', 'Expression.Error')), String(v.getOr('Message', '') ?? ''), v.getOr('Detail', null));
        }
        throw expressionError('The argument to "error" must be text or a record.', v);
      };
    }
    case 'TypeExpr': {
      const spec = node.spec;
      return (env) => typeFromSpec(spec, (expr) => c(expr)(env));
    }
    case 'NotImplemented':
      return () => {
        throw expressionError('Not implemented.');
      };
    default:
      throw new Error(`Unknown node ${node.t}`);
  }
}

export function errorRecord(e) {
  return MRecord.from({ Reason: e.reason, Message: e.mMessage, Detail: e.detail });
}

export { CellError, FACETS, tableFromRows, splitDateTime, T, kindOf };
