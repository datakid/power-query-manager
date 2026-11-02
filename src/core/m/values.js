export class MError extends Error {
  constructor(reason, message, detail) {
    super(message || reason);
    this.name = 'MError';
    this.isM = true;
    this.reason = reason || 'Expression.Error';
    this.mMessage = message || '';
    this.detail = detail === undefined ? null : detail;
  }
}

export const expressionError = (message, detail) => new MError('Expression.Error', message, detail);
export const formatError = (message, detail) => new MError('DataFormat.Error', message, detail);
export const sourceError = (message, detail) => new MError('DataSource.Error', message, detail);

export class Thunk {
  constructor(fn) {
    this.fn = fn;
    this.state = 0;
    this.value = undefined;
  }

  get() {
    if (this.state === 2) return this.value;
    if (this.state === 3) throw this.value;
    if (this.state === 1) throw expressionError('A cyclic reference was encountered during evaluation.');
    this.state = 1;
    try {
      this.value = this.fn();
      this.state = 2;
      this.fn = null;
      return this.value;
    } catch (e) {
      this.state = 3;
      this.value = e;
      this.fn = null;
      throw e;
    }
  }
}

export const force = (v) => (v instanceof Thunk ? v.get() : v);

export class CellError {
  constructor(error) {
    this.error = error;
  }
}

export const cell = (v) => {
  if (v instanceof Thunk) v = v.get();
  if (v instanceof CellError) throw v.error;
  return v;
};

export const TICKS_PER_DAY = 864000000000n;
export const TICKS_PER_SECOND = 10000000;
export const MAX_DAYS = 3652058;

export class MList {
  constructor(items) {
    this.items = items;
  }

  get length() {
    return this.items.length;
  }

  at(i) {
    return cell(force(this.items[i]));
  }

  toArray() {
    const out = new Array(this.items.length);
    for (let i = 0; i < out.length; i++) out[i] = this.at(i);
    return out;
  }
}

export class MRecord {
  constructor(names, entries, meta) {
    this.names = names;
    this.entries = entries;
    this.meta = meta || null;
    this.index = null;
  }

  static from(obj) {
    const names = Object.keys(obj);
    return new MRecord(names, names.map((k) => obj[k]));
  }

  indexOf(name) {
    if (!this.index) {
      this.index = new Map();
      this.names.forEach((n, i) => this.index.set(n, i));
    }
    const i = this.index.get(name);
    return i === undefined ? -1 : i;
  }

  has(name) {
    return this.indexOf(name) >= 0;
  }

  get(name) {
    const i = this.indexOf(name);
    if (i < 0) throw expressionError(`The field '${name}' of the record wasn't found.`, name);
    return cell(force(this.entries[i]));
  }

  getOr(name, fallback) {
    const i = this.indexOf(name);
    return i < 0 ? fallback : cell(force(this.entries[i]));
  }

  values() {
    return this.names.map((n) => this.get(n));
  }
}

export class MTable {
  constructor(columns, types, cols, rowCount, keys) {
    this.columns = columns;
    this.types = types;
    this.cols = cols;
    this.rowCount = rowCount;
    this.keys = keys || [];
    this.meta = null;
    this.index = null;
  }

  columnIndex(name) {
    if (!this.index) {
      this.index = new Map();
      this.columns.forEach((n, i) => this.index.set(n, i));
    }
    const i = this.index.get(name);
    return i === undefined ? -1 : i;
  }

  cellAt(r, c) {
    return cell(this.cols[c][r]);
  }

  rowRecord(r) {
    return new MRecord(this.columns, this.cols.map((col) => col[r]));
  }
}

export class MFunction {
  constructor({ name, params, fn, returnType, meta }) {
    this.name = name || null;
    this.params = params;
    this.fn = fn;
    this.returnType = returnType || null;
    this.meta = meta || null;
  }

  get arity() {
    return this.params.length;
  }

  get required() {
    return this.params.filter((p) => !p.optional).length;
  }

  invoke(args) {
    if (args.length < this.required) throw expressionError('There weren\'t enough arguments to invoke the function.');
    if (args.length > this.params.length) throw expressionError('There were too many arguments to invoke the function.');
    return this.fn(args);
  }
}

export class MType {
  constructor(tk, props) {
    this.tk = tk;
    this.nullable = false;
    Object.assign(this, props);
  }
}

export const prim = (name, nullable = false, facet = null) => {
  const t = new MType('primitive', { name, facet });
  t.nullable = nullable;
  return t;
};

export const T = {
  any: prim('any', true),
  anynonnull: prim('anynonnull'),
  none: prim('none'),
  null: prim('null', true),
  logical: prim('logical'),
  number: prim('number'),
  text: prim('text'),
  date: prim('date'),
  time: prim('time'),
  datetime: prim('datetime'),
  datetimezone: prim('datetimezone'),
  duration: prim('duration'),
  binary: prim('binary'),
  list: prim('list'),
  record: prim('record'),
  table: prim('table'),
  function: prim('function'),
  type: prim('type')
};

export const FACETS = {
  'Int64.Type': ['int64', 'number'],
  'Int32.Type': ['int32', 'number'],
  'Int16.Type': ['int16', 'number'],
  'Int8.Type': ['int8', 'number'],
  'Byte.Type': ['byte', 'number'],
  'Single.Type': ['single', 'number'],
  'Double.Type': ['double', 'number'],
  'Decimal.Type': ['decimal', 'number'],
  'Currency.Type': ['currency', 'number'],
  'Percentage.Type': ['percentage', 'number']
};

export function nullable(t) {
  if (t.nullable) return t;
  const c = new MType(t.tk, t);
  c.nullable = true;
  return c;
}

export function nonNullable(t) {
  if (!t.nullable || t.name === 'any' || t.name === 'null') return t;
  const c = new MType(t.tk, t);
  c.nullable = false;
  return c;
}

export function mkDate(days) {
  return { k: 'date', days };
}

export function mkTime(ticks) {
  return { k: 'time', ticks };
}

export function mkDateTime(ticks) {
  return { k: 'datetime', ticks };
}

export function mkDtz(ticks, offsetMin) {
  return { k: 'dtz', ticks, offsetMin };
}

export function mkDuration(ticks) {
  return { k: 'duration', ticks: BigInt(ticks) };
}

export function mkBinary(bytes) {
  return { k: 'binary', bytes };
}

function floorDiv(a, b) {
  return Math.floor(a / b);
}

export function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = floorDiv(yy, 400);
  const yoe = yy - era * 400;
  const doy = floorDiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

const EPOCH_0001 = daysFromCivil(1, 1, 1);

export function daysFromYmd(y, m, d) {
  return daysFromCivil(y, m, d) - EPOCH_0001;
}

export function ymdFromDays(days) {
  const z = days + EPOCH_0001 + 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const d = doy - floorDiv(153 * mp + 2, 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export function dayOfWeek(days) {
  return (((days + 1) % 7) + 7) % 7;
}

export function splitDateTime(ticks) {
  let days = ticks / TICKS_PER_DAY;
  let rem = ticks % TICKS_PER_DAY;
  if (rem < 0n) {
    rem += TICKS_PER_DAY;
    days -= 1n;
  }
  return { days: Number(days), time: Number(rem) };
}

export function joinDateTime(days, time) {
  return BigInt(days) * TICKS_PER_DAY + BigInt(Math.round(time));
}

export function timeParts(ticks) {
  const t = Math.floor(ticks);
  const secs = Math.floor(t / TICKS_PER_SECOND);
  return { hour: Math.floor(secs / 3600), minute: Math.floor((secs % 3600) / 60), second: secs % 60, fraction: t % TICKS_PER_SECOND };
}

export function kindOf(v) {
  if (v === null || v === undefined) return 'null';
  switch (typeof v) {
    case 'boolean':
      return 'logical';
    case 'number':
      return 'number';
    case 'string':
      return 'text';
    default:
      break;
  }
  if (v instanceof MList) return 'list';
  if (v instanceof MRecord) return 'record';
  if (v instanceof MTable) return 'table';
  if (v instanceof MFunction) return 'function';
  if (v instanceof MType) return 'type';
  if (v.k === 'dtz') return 'datetimezone';
  return v.k;
}

const KIND_LABEL = { null: 'Null', logical: 'Logical', number: 'Number', text: 'Text', date: 'Date', time: 'Time', datetime: 'DateTime', datetimezone: 'DateTimeZone', duration: 'Duration', binary: 'Binary', list: 'List', record: 'Record', table: 'Table', function: 'Function', type: 'Type' };

export const kindLabel = (v) => KIND_LABEL[kindOf(v)];

export function toDtzUtcTicks(v) {
  return v.ticks - BigInt(v.offsetMin) * 600000000n;
}

export function valuesEqual(a, b) {
  a = cellValue(a);
  b = cellValue(b);
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  const ka = kindOf(a);
  if (ka !== kindOf(b)) return false;
  switch (ka) {
    case 'logical':
    case 'text':
      return a === b;
    case 'number':
      return a === b;
    case 'date':
      return a.days === b.days;
    case 'time':
      return a.ticks === b.ticks;
    case 'datetime':
    case 'duration':
      return a.ticks === b.ticks;
    case 'datetimezone':
      return toDtzUtcTicks(a) === toDtzUtcTicks(b);
    case 'binary':
      return a.bytes.length === b.bytes.length && a.bytes.every((x, i) => x === b.bytes[i]);
    case 'list': {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!valuesEqual(a.at(i), b.at(i))) return false;
      return true;
    }
    case 'record': {
      if (a.names.length !== b.names.length) return false;
      for (const n of a.names) {
        if (!b.has(n)) return false;
        if (!valuesEqual(a.get(n), b.get(n))) return false;
      }
      return true;
    }
    case 'table': {
      if (a.rowCount !== b.rowCount || a.columns.length !== b.columns.length) return false;
      for (let c = 0; c < a.columns.length; c++) {
        if (a.columns[c] !== b.columns[c]) return false;
        for (let r = 0; r < a.rowCount; r++) if (!valuesEqual(a.cols[c][r], b.cols[c][r])) return false;
      }
      return true;
    }
    case 'type':
      return a === b || JSON.stringify(typeShape(a)) === JSON.stringify(typeShape(b));
    default:
      return a === b;
  }
}

export function cellValue(v) {
  if (v instanceof CellError) throw v.error;
  return force(v);
}

function typeShape(t) {
  return { tk: t.tk, name: t.name, n: t.nullable, f: t.facet, i: t.item ? typeShape(t.item) : null };
}

export function compareValues(a, b) {
  a = cellValue(a);
  b = cellValue(b);
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an && bn ? 0 : an ? -1 : 1;
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka !== kb) throw expressionError(`We cannot compare values of type ${KIND_LABEL[ka]} and ${KIND_LABEL[kb]}.`);
  switch (ka) {
    case 'logical':
      return a === b ? 0 : a ? 1 : -1;
    case 'number':
      if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : -1) : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    case 'text':
      return a < b ? -1 : a > b ? 1 : 0;
    case 'date':
      return a.days - b.days;
    case 'time':
      return a.ticks - b.ticks;
    case 'datetime':
    case 'duration':
      return a.ticks < b.ticks ? -1 : a.ticks > b.ticks ? 1 : 0;
    case 'datetimezone': {
      const x = toDtzUtcTicks(a);
      const y = toDtzUtcTicks(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 'list': {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const c = compareValues(a.at(i), b.at(i));
        if (c) return c;
      }
      return a.length - b.length;
    }
    default:
      throw expressionError(`Values of type ${KIND_LABEL[ka]} cannot be compared.`);
  }
}

export function typeOfValue(v) {
  const k = kindOf(v);
  switch (k) {
    case 'null':
      return T.null;
    case 'datetimezone':
      return T.datetimezone;
    case 'table': {
      const t = new MType('table', { columns: v.columns.map((n, i) => ({ name: n, type: v.types[i] || T.any })) });
      return t;
    }
    default:
      return T[k];
  }
}

export function conforms(v, t) {
  v = cellValue(v);
  if (v === null || v === undefined) return t.nullable || t.name === 'any' || t.name === 'null';
  if (t.tk === 'primitive') {
    if (t.name === 'any') return true;
    if (t.name === 'anynonnull') return true;
    if (t.name === 'none' || t.name === 'null') return false;
    return kindOf(v) === t.name;
  }
  if (t.tk === 'list') {
    if (!(v instanceof MList)) return false;
    return !t.item || t.item.name === 'any' || v.toArray().every((x) => conforms(x, t.item));
  }
  if (t.tk === 'record') {
    if (!(v instanceof MRecord)) return false;
    for (const f of t.fields || []) {
      if (!v.has(f.name)) {
        if (!f.optional) return false;
        continue;
      }
      if (!conforms(v.get(f.name), f.type)) return false;
    }
    return true;
  }
  if (t.tk === 'table') return v instanceof MTable;
  if (t.tk === 'function') return v instanceof MFunction;
  return false;
}

export function typeName(t) {
  if (t.tk === 'primitive') return (t.nullable && t.name !== 'any' && t.name !== 'null' ? 'nullable ' : '') + t.name;
  if (t.tk === 'list') return `{${t.item ? typeName(t.item) : 'any'}}`;
  if (t.tk === 'record') return 'record';
  if (t.tk === 'table') return 'table';
  return t.tk;
}

export const tableOf = (columns, types, cols) => new MTable(columns, types, cols, cols.length ? cols[0].length : 0);

export function tableFromRows(columns, rows, types) {
  const cols = columns.map(() => new Array(rows.length));
  rows.forEach((row, r) => columns.forEach((_, c) => {
    cols[c][r] = row[c] === undefined ? null : row[c];
  }));
  return new MTable(columns, types || columns.map(() => T.any), cols, rows.length);
}

export function listOf(array) {
  return new MList(array);
}
