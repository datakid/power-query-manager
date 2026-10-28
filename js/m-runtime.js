(function () {
  const M = window.M;

  class MError extends Error {
    constructor(reason, message, detail) {
      super(message || reason || 'Error');
      this.reason = reason || 'Expression.Error';
      this.msg = message || '';
      this.detail = detail === undefined ? null : detail;
      this.isM = true;
    }
    toRecord() { return MRecord.from({ Reason: this.reason, Message: this.msg, Detail: this.detail }); }
  }

  class MErrCell {
    constructor(err) { this.err = err; }
  }

  class MDT {
    constructor(kind, ms, tz) { this.kind = kind; this.ms = ms; this.tz = tz || 0; }
    get d() { return new Date(this.ms); }
    get y() { return this.d.getUTCFullYear(); }
    get mo() { return this.d.getUTCMonth() + 1; }
    get day() { return this.d.getUTCDate(); }
    get h() { return this.d.getUTCHours(); }
    get mi() { return this.d.getUTCMinutes(); }
    get s() { return this.d.getUTCSeconds() + this.d.getUTCMilliseconds() / 1000; }
  }

  class MDur {
    constructor(ms) { this.ms = ms; }
  }

  class MBinary {
    constructor(bytes, name) { this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); this.name = name || null; }
  }

  class MRecord {
    constructor(names, values) { this.names = names; this.values = values; this._idx = null; }
    static from(obj) { return new MRecord(Object.keys(obj), Object.values(obj)); }
    index(n) {
      if (!this._idx) { this._idx = new Map(); this.names.forEach((k, i) => this._idx.set(k, i)); }
      const i = this._idx.get(n);
      return i === undefined ? -1 : i;
    }
    has(n) { return this.index(n) >= 0; }
    get(n) { const i = this.index(n); return i < 0 ? undefined : this.values[i]; }
  }

  class MTable {
    constructor(cols, rows, types) {
      this.cols = cols;
      this.rows = rows;
      this.types = types || cols.map(() => null);
      this._idx = null;
    }
    index(n) {
      if (!this._idx) { this._idx = new Map(); this.cols.forEach((k, i) => this._idx.set(k, i)); }
      const i = this._idx.get(n);
      return i === undefined ? -1 : i;
    }
    colIndex(n) {
      const i = this.index(n);
      if (i < 0) throw new MError('Expression.Error', "The column '" + n + "' of the table wasn't found.", n);
      return i;
    }
    rowRecord(r) { return new MRecord(this.cols, r); }
  }

  class MFunc {
    constructor(fn, name, minArgs, maxArgs) { this.fn = fn; this.name = name || 'function'; this.min = minArgs == null ? 0 : minArgs; this.max = maxArgs == null ? Infinity : maxArgs; }
    call(args) {
      if (args.length < this.min) throw new MError('Expression.Error', (this.name !== 'function' ? this.name + ': ' : '') + 'expected at least ' + this.min + ' argument' + (this.min === 1 ? '' : 's') + ', got ' + args.length + '.');
      return this.fn(args);
    }
  }

  class MType {
    constructor(kind, o) { this.kind = kind; Object.assign(this, o || {}); }
  }

  const T = {};
  ['any', 'anynonnull', 'none', 'null', 'logical', 'number', 'text', 'date', 'datetime', 'datetimezone', 'time', 'duration', 'binary', 'list', 'record', 'table', 'function', 'type'].forEach(k => { T[k] = new MType(k); });

  function typeOf(v) {
    if (v === null || v === undefined) return T.null;
    if (typeof v === 'boolean') return T.logical;
    if (typeof v === 'number') return T.number;
    if (typeof v === 'string') return T.text;
    if (v instanceof MDT) return T[v.kind];
    if (v instanceof MDur) return T.duration;
    if (v instanceof MBinary) return T.binary;
    if (Array.isArray(v)) return T.list;
    if (v instanceof MRecord) return T.record;
    if (v instanceof MTable) return new MType('table', { cols: v.cols, colTypes: v.types });
    if (v instanceof MFunc) return T.function;
    if (v instanceof MType) return T.type;
    if (v instanceof MErrCell) throw v.err;
    return T.any;
  }

  function kindName(v) { return typeOf(v).kind; }

  function isType(v, t) {
    if (!t) return true;
    if (t.nullable && v === null) return true;
    switch (t.kind) {
      case 'any': return true;
      case 'anynonnull': return v !== null;
      case 'none': return false;
      case 'null': return v === null;
      default: {
        if (v === null) return t.kind === 'null';
        const k = kindName(v);
        return k === t.kind;
      }
    }
  }

  function typeName(t) {
    if (!t) return 'any';
    if (t.facet) return t.facet;
    return (t.nullable ? 'nullable ' : '') + t.kind;
  }

  function force(v) {
    if (v instanceof MErrCell) throw v.err;
    return v;
  }

  const pad = (n, w) => String(n).padStart(w || 2, '0');

  function numText(n) {
    if (Number.isNaN(n)) return 'NaN';
    if (n === Infinity) return 'Infinity';
    if (n === -Infinity) return '-Infinity';
    if (Object.is(n, -0)) return '0';
    const p = +n.toPrecision(15);
    let s = String(p);
    if (/e/.test(s)) {
      const abs = Math.abs(p);
      if (abs >= 1e-7 && abs < 1e21) s = p.toFixed(20).replace(/\.?0+$/, '');
      else s = s.replace('e+', 'E+').replace('e-', 'E-');
    }
    return s;
  }

  function dateText(v) { return v.mo + '/' + v.day + '/' + v.y; }
  function timeText(v) {
    const h = v.h, h12 = h % 12 === 0 ? 12 : h % 12;
    const sec = Math.floor(v.s);
    return h12 + ':' + pad(v.mi) + ':' + pad(sec) + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function tzText(min) {
    const sgn = min < 0 ? '-' : '+', a = Math.abs(min);
    return sgn + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  function durText(ms) {
    const neg = ms < 0;
    let a = Math.abs(ms);
    const d = Math.floor(a / 86400000); a -= d * 86400000;
    const h = Math.floor(a / 3600000); a -= h * 3600000;
    const mi = Math.floor(a / 60000); a -= mi * 60000;
    const s = Math.floor(a / 1000); a -= s * 1000;
    let out = (neg ? '-' : '') + d + '.' + pad(h) + ':' + pad(mi) + ':' + pad(s);
    if (a) out += '.' + String(Math.round(a * 10000)).padStart(7, '0').replace(/0+$/, '');
    return out;
  }

  function toText(v) {
    v = force(v);
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return numText(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v instanceof MDT) {
      if (v.kind === 'date') return dateText(v);
      if (v.kind === 'time') return timeText(v);
      if (v.kind === 'datetime') return dateText(v) + ' ' + timeText(v);
      return dateText(v) + ' ' + timeText(v) + ' ' + tzText(v.tz);
    }
    if (v instanceof MDur) return durText(v.ms);
    throw new MError('Expression.Error', 'We cannot convert a value of type ' + kindName(v) + ' to type Text.', v);
  }

  function display(v) {
    if (v instanceof MErrCell) return 'Error';
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return 'List';
    if (v instanceof MRecord) return 'Record';
    if (v instanceof MTable) return 'Table';
    if (v instanceof MFunc) return 'Function';
    if (v instanceof MType) return 'Type';
    if (v instanceof MBinary) return 'Binary';
    return toText(v);
  }

  function equals(a, b) {
    a = force(a); b = force(b);
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b));
    if (a instanceof MDT && b instanceof MDT) return a.kind === b.kind && (a.ms - a.tz * 60000) === (b.ms - b.tz * 60000);
    if (a instanceof MDur && b instanceof MDur) return a.ms === b.ms;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
    if (a instanceof MRecord && b instanceof MRecord) {
      if (a.names.length !== b.names.length) return false;
      return a.names.every((n, i) => b.has(n) && equals(a.values[i], b.get(n)));
    }
    if (a instanceof MTable && b instanceof MTable) {
      if (a.cols.length !== b.cols.length || a.rows.length !== b.rows.length) return false;
      if (!a.cols.every(c => b.index(c) >= 0)) return false;
      const map = a.cols.map(c => b.index(c));
      return a.rows.every((r, i) => r.every((x, j) => equals(x, b.rows[i][map[j]])));
    }
    if (a instanceof MBinary && b instanceof MBinary) return a.bytes.length === b.bytes.length && a.bytes.every((x, i) => x === b.bytes[i]);
    return false;
  }

  const rank = v => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'boolean') return 1;
    if (typeof v === 'number') return 2;
    if (v instanceof MDT) return 3;
    if (v instanceof MDur) return 4;
    if (typeof v === 'string') return 5;
    return 6;
  };

  function compare(a, b, ignoreCase) {
    a = force(a); b = force(b);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return 0;
    if (ra === 1) return (a ? 1 : 0) - (b ? 1 : 0);
    if (ra === 2) return a < b ? -1 : a > b ? 1 : 0;
    if (ra === 3) { const x = a.ms - a.tz * 60000, y = b.ms - b.tz * 60000; return x < y ? -1 : x > y ? 1 : 0; }
    if (ra === 4) return a.ms - b.ms;
    if (ra === 5) {
      if (ignoreCase) { a = a.toLowerCase(); b = b.toLowerCase(); }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    return 0;
  }

  function relational(op, a, b) {
    a = force(a); b = force(b);
    if (a === null || b === null) return null;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb || ra >= 6 || (ra === 3 && a.kind !== b.kind)) throw new MError('Expression.Error', "We cannot apply operator " + op + " to types " + cap(kindName(a)) + ' and ' + cap(kindName(b)) + '.');
    const c = compare(a, b);
    switch (op) { case '<': return c < 0; case '>': return c > 0; case '<=': return c <= 0; default: return c >= 0; }
  }

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const DAY = 86400000;

  function opErr(op, a, b) {
    return new MError('Expression.Error', 'We cannot apply operator ' + op + ' to types ' + cap(kindName(a)) + ' and ' + cap(kindName(b)) + '.', null);
  }

  function arith(op, a, b) {
    a = force(a); b = force(b);
    if (op === '&') {
      if (a === null || b === null) {
        if ((a === null && (typeof b === 'string' || b === null)) || (b === null && typeof a === 'string')) return null;
      }
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      if (a instanceof MRecord && b instanceof MRecord) {
        const names = a.names.slice(), values = a.values.slice();
        b.names.forEach((n, i) => { const k = names.indexOf(n); if (k >= 0) values[k] = b.values[i]; else { names.push(n); values.push(b.values[i]); } });
        return new MRecord(names, values);
      }
      if (a instanceof MTable && b instanceof MTable) return M.lib.combineTables([a, b]);
      if (a instanceof MDT && b instanceof MDT && a.kind === 'date' && b.kind === 'time') return new MDT('datetime', a.ms + b.ms);
      throw opErr('&', a, b);
    }
    if (a === null || b === null) return null;
    if (typeof a === 'number' && typeof b === 'number') {
      switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; }
    }
    if (op === '+') {
      if (a instanceof MDT && b instanceof MDur) return addDur(a, b.ms);
      if (a instanceof MDur && b instanceof MDT) return addDur(b, a.ms);
      if (a instanceof MDur && b instanceof MDur) return new MDur(a.ms + b.ms);
    }
    if (op === '-') {
      if (a instanceof MDT && b instanceof MDur) return addDur(a, -b.ms);
      if (a instanceof MDT && b instanceof MDT && a.kind === b.kind) return new MDur((a.ms - a.tz * 60000) - (b.ms - b.tz * 60000));
      if (a instanceof MDur && b instanceof MDur) return new MDur(a.ms - b.ms);
    }
    if (op === '*') {
      if (a instanceof MDur && typeof b === 'number') return new MDur(a.ms * b);
      if (typeof a === 'number' && b instanceof MDur) return new MDur(a * b.ms);
    }
    if (op === '/') {
      if (a instanceof MDur && typeof b === 'number') return new MDur(a.ms / b);
      if (a instanceof MDur && b instanceof MDur) return a.ms / b.ms;
    }
    throw opErr(op, a, b);
  }

  function addDur(dt, ms) {
    if (dt.kind === 'date') return new MDT('date', Math.floor((dt.ms + ms) / DAY) * DAY);
    if (dt.kind === 'time') return new MDT('time', (((dt.ms + ms) % DAY) + DAY) % DAY);
    return new MDT(dt.kind, dt.ms + ms, dt.tz);
  }

  class Thunk {
    constructor(f) { this.f = f; this.st = 0; this.v = undefined; }
    get() {
      if (this.st === 2) return this.v;
      if (this.st === 3) throw this.v;
      if (this.st === 1) throw new MError('Expression.Error', 'A cyclic reference was encountered during evaluation.');
      this.st = 1;
      try { this.v = this.f(); this.st = 2; return this.v; }
      catch (e) { this.st = 3; this.v = e; throw e; }
    }
  }

  class Env {
    constructor(parent, vars) { this.parent = parent; this.vars = vars || new Map(); }
    find(n) {
      let e = this;
      while (e) {
        const t = e.vars.get(n);
        if (t !== undefined) return t;
        e = e.parent;
      }
      return undefined;
    }
  }

  const SOURCE_HINT = /^(Sql|Odbc|OleDb|Oracle|MySQL|PostgreSQL|Teradata|Sybase|Informix|DB2|SharePoint|OData|Exchange|ActiveDirectory|AnalysisServices|AzureStorage|AzureDataLake|Salesforce|Access|Pdf|Hdfs|Snowflake|GoogleAnalytics|PowerPlatform|CommonDataService|Dataverse|Cube|Essbase|SapHana|SapBusinessWarehouse|AdobeAnalytics|Facebook|Hive|Impala|Spark|Databricks|Vertica|Netezza|Kusto|AzureDevOps|VSTS|Python|R)\./;

  function lookupGlobal(name, ctx) {
    const lib = M.lib.table;
    if (Object.prototype.hasOwnProperty.call(lib, name)) return lib[name];
    if (ctx && ctx.queries && ctx.queries.has(name)) return ctx.queries.get(name).get();
    if (SOURCE_HINT.test(name)) {
      return new MFunc(() => { throw new MError('Quoin.Unsupported', name + ' is not available offline. Quoin runs entirely in this tab.'); }, name);
    }
    if (name === '#shared' || name === '#sections') {
      const names = Object.keys(lib);
      return new MRecord(names, names.map(n => lib[n]));
    }
    throw new MError('Expression.Error', "The name '" + name + "' wasn't recognized. Make sure it's spelled correctly.", name);
  }

  function evalType(t, env, ctx) {
    switch (t.k) {
      case 'tprim': return T[t.name] || T.any;
      case 'tnullable': { const inner = evalType(t.inner, env, ctx); return new MType(inner.kind, Object.assign({}, inner, { nullable: true })); }
      case 'tlist': return new MType('list', { item: evalType(t.item, env, ctx) });
      case 'trecord': return new MType('record', { fields: t.fields.map(f => ({ name: f.name, type: evalType(f.type, env, ctx), optional: f.optional })), open: !!t.fields.open });
      case 'ttable': {
        if (t.fromType) {
          const rt = evalType(t.fromType, env, ctx);
          return new MType('table', { cols: (rt.fields || []).map(f => f.name), colTypes: (rt.fields || []).map(f => f.type) });
        }
        return new MType('table', { cols: t.fields.map(f => f.name), colTypes: t.fields.map(f => evalType(f.type, env, ctx)) });
      }
      case 'texpr': {
        const v = ev(t.e, env, ctx);
        if (v instanceof MType) return v;
        throw new MError('Expression.Error', 'Expected a type value.');
      }
    }
    return T.any;
  }

  function fieldOf(target, name, opt) {
    target = force(target);
    if (target instanceof MRecord) {
      const i = target.index(name);
      if (i < 0) {
        if (opt) return null;
        throw new MError('Expression.Error', "The field '" + name + "' of the record wasn't found.", target);
      }
      return force(target.values[i]);
    }
    if (target instanceof MTable) {
      const i = target.index(name);
      if (i < 0) {
        if (opt) return null;
        throw new MError('Expression.Error', "The column '" + name + "' of the table wasn't found.", name);
      }
      return target.rows.map(r => r[i]);
    }
    if (target === null && opt) return null;
    throw new MError('Expression.Error', 'We cannot apply field access to the type ' + cap(kindName(target)) + '.', target);
  }

  function project(target, names, opt) {
    target = force(target);
    if (target instanceof MRecord) {
      return new MRecord(names.slice(), names.map(n => {
        const i = target.index(n);
        if (i < 0) { if (opt) return null; throw new MError('Expression.Error', "The field '" + n + "' of the record wasn't found."); }
        return target.values[i];
      }));
    }
    if (target instanceof MTable) {
      const idx = names.map(n => { const i = target.index(n); if (i < 0 && !opt) target.colIndex(n); return i; });
      return new MTable(names.slice(), target.rows.map(r => idx.map(i => (i < 0 ? null : r[i]))), idx.map(i => (i < 0 ? null : target.types[i])));
    }
    throw new MError('Expression.Error', 'We cannot apply field access to the type ' + cap(kindName(target)) + '.');
  }

  function itemOf(target, index, opt) {
    target = force(target);
    index = force(index);
    if (Array.isArray(target)) {
      if (typeof index !== 'number') throw new MError('Expression.Error', 'List index must be a number.');
      if (index < 0 || index >= target.length || index !== Math.floor(index)) {
        if (opt) return null;
        throw new MError('Expression.Error', 'There weren\'t enough elements in the enumeration to complete the operation.', target);
      }
      return force(target[index]);
    }
    if (target instanceof MTable) {
      if (typeof index === 'number') {
        if (index < 0 || index >= target.rows.length) {
          if (opt) return null;
          throw new MError('Expression.Error', 'There weren\'t enough elements in the enumeration to complete the operation.', target);
        }
        return target.rowRecord(target.rows[index]);
      }
      if (index instanceof MRecord) {
        const idx = index.names.map(n => target.colIndex(n));
        const hits = target.rows.filter(r => idx.every((ci, k) => equals(r[ci], index.values[k])));
        if (hits.length === 1) return target.rowRecord(hits[0]);
        if (opt && hits.length === 0) return null;
        throw new MError('Expression.Error', hits.length ? 'The key matched more than one row in the table.' : 'The key didn\'t match any rows in the table.', index);
      }
    }
    if (target === null && opt) return null;
    throw new MError('Expression.Error', 'We cannot apply indexing to the type ' + cap(kindName(target)) + '.');
  }

  function truthy(v, op) {
    v = force(v);
    if (typeof v === 'boolean') return v;
    if (v === null) return null;
    throw new MError('Expression.Error', 'We cannot convert the value ' + display(v) + ' to type Logical.', v);
  }

  function call(f, args) {
    f = force(f);
    if (!(f instanceof MFunc)) throw new MError('Expression.Error', 'We cannot convert a value of type ' + cap(kindName(f)) + ' to type Function.', f);
    return f.call(args);
  }

  function makeClosure(params, body, env, ctx) {
    const required = params.filter(p => !p.optional).length;
    return new MFunc(args => {
      if (args.length > params.length) throw new MError('Expression.Error', 'Too many arguments were passed to the function: expected ' + params.length + ', got ' + args.length + '.');
      const vars = new Map();
      params.forEach((p, i) => { const v = i < args.length ? args[i] : null; vars.set(p.name, { get: () => v }); });
      return ev(body, new Env(env, vars), ctx);
    }, 'function', required, params.length);
  }

  function letEnv(node, env, ctx) {
    const vars = new Map();
    const scope = new Env(env, vars);
    node.binds.forEach(b => vars.set(b.name, new Thunk(() => ev(b.e, scope, ctx))));
    return scope;
  }

  function ev(n, env, ctx) {
    if (ctx.tick && ++ctx.ops % 4096 === 0) ctx.tick();
    switch (n.k) {
      case 'lit': return n.v;
      case 'id': {
        const t = env.find(n.name);
        if (t !== undefined) return t.get();
        return lookupGlobal(n.name, ctx);
      }
      case 'let': return ev(n.body, letEnv(n, env, ctx), ctx);
      case 'if': {
        const c = truthy(ev(n.c, env, ctx));
        if (c === null) throw new MError('Expression.Error', 'We cannot convert the value null to type Logical.');
        return c ? ev(n.a, env, ctx) : ev(n.b, env, ctx);
      }
      case 'each': return makeClosure([{ name: '_' }], n.body, env, ctx);
      case 'fn': return makeClosure(n.params, n.body, env, ctx);
      case 'try': {
        try {
          const v = ev(n.e, env, ctx);
          if (n.other) return v;
          if (n.catchBody) return v;
          return MRecord.from({ HasError: false, Value: v });
        } catch (e) {
          if (!e.isM) throw e;
          if (n.other) return ev(n.other, env, ctx);
          if (n.catchBody) {
            const vars = new Map();
            if (n.catchName) { const r = e.toRecord(); vars.set(n.catchName, { get: () => r }); }
            return ev(n.catchBody, new Env(env, vars), ctx);
          }
          return MRecord.from({ HasError: true, Error: e.toRecord() });
        }
      }
      case 'error': {
        const v = force(ev(n.e, env, ctx));
        if (typeof v === 'string') throw new MError('Expression.Error', v);
        if (v instanceof MRecord) throw new MError(v.get('Reason') || 'Expression.Error', v.get('Message') || '', v.has('Detail') ? v.get('Detail') : null);
        throw new MError('Expression.Error', display(v));
      }
      case 'coalesce': {
        let l;
        try { l = force(ev(n.l, env, ctx)); } catch (e) { throw e; }
        return l === null ? ev(n.r, env, ctx) : l;
      }
      case 'or': {
        const l = truthy(ev(n.l, env, ctx));
        if (l === true) return true;
        const r = truthy(ev(n.r, env, ctx));
        if (r === true) return true;
        if (l === null || r === null) return null;
        return false;
      }
      case 'and': {
        const l = truthy(ev(n.l, env, ctx));
        if (l === false) return false;
        const r = truthy(ev(n.r, env, ctx));
        if (r === false) return false;
        if (l === null || r === null) return null;
        return true;
      }
      case 'is': return isType(force(ev(n.e, env, ctx)), evalType(n.type, env, ctx));
      case 'as': {
        const v = force(ev(n.e, env, ctx));
        const t = evalType(n.type, env, ctx);
        if (!isType(v, t)) throw new MError('Expression.Error', 'We cannot convert the value ' + display(v) + ' to type ' + cap(typeName(t)) + '.', v);
        return v;
      }
      case 'bin': {
        const a = ev(n.l, env, ctx), b = ev(n.r, env, ctx);
        switch (n.op) {
          case '=': return equals(a, b);
          case '<>': return !equals(a, b);
          case '<': case '>': case '<=': case '>=': return relational(n.op, a, b);
          default: return arith(n.op, a, b);
        }
      }
      case 'unary': {
        const v = force(ev(n.e, env, ctx));
        if (n.op === 'not') { const t = truthy(v); return t === null ? null : !t; }
        if (v === null) return null;
        if (n.op === '-') {
          if (typeof v === 'number') return -v;
          if (v instanceof MDur) return new MDur(-v.ms);
        } else {
          if (typeof v === 'number' || v instanceof MDur) return v;
        }
        throw new MError('Expression.Error', 'We cannot apply operator ' + n.op + ' to type ' + cap(kindName(v)) + '.');
      }
      case 'meta': return ev(n.e, env, ctx);
      case 'typeval': return evalType(n.type, env, ctx);
      case 'list': {
        const out = [];
        for (const it of n.items) {
          if (it.e) out.push(ev(it.e, env, ctx));
          else {
            const a = force(ev(it.from, env, ctx)), b = force(ev(it.to, env, ctx));
            if (typeof a === 'number' && typeof b === 'number') { for (let x = a; x <= b; x++) out.push(x); }
            else if (typeof a === 'string' && typeof b === 'string' && a.length === 1 && b.length === 1) {
              for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) out.push(String.fromCharCode(c));
            } else throw new MError('Expression.Error', 'List ranges need two numbers or two single characters.');
          }
        }
        return out;
      }
      case 'record': {
        const vars = new Map();
        const scope = new Env(env, vars);
        const thunks = n.fields.map(f => { const t = new Thunk(() => ev(f.e, scope, ctx)); vars.set(f.name, t); return t; });
        const names = n.fields.map(f => f.name);
        const values = thunks.map(t => { try { return t.get(); } catch (e) { if (e.isM) return new MErrCell(e); throw e; } });
        return new MRecord(names, values);
      }
      case 'field': {
        const target = n.target ? ev(n.target, env, ctx) : implicit(env, ctx);
        return fieldOf(target, n.name, n.opt);
      }
      case 'proj': {
        const target = n.target ? ev(n.target, env, ctx) : implicit(env, ctx);
        return project(target, n.names, n.opt);
      }
      case 'item': return itemOf(ev(n.target, env, ctx), ev(n.index, env, ctx), n.opt);
      case 'call': {
        const f = ev(n.fn, env, ctx);
        const args = n.args.map(a => ev(a, env, ctx));
        return call(f, args);
      }
      case 'notimpl': throw new MError('Expression.Error', 'Not implemented');
    }
    throw new MError('Expression.Error', 'Unknown expression.');
  }

  function implicit(env, ctx) {
    const t = env.find('_');
    if (t === undefined) throw new MError('Expression.Error', 'A field reference like [Column] needs to be inside an “each” or a function.');
    return t.get();
  }

  function makeContext(opts) {
    opts = opts || {};
    const ctx = { queries: new Map(), ops: 0, tick: opts.tick || null, host: opts.host || {}, parsed: new Map() };
    (opts.members || []).forEach(m => {
      ctx.queries.set(m.name, new Thunk(() => {
        const ast = parseCached(ctx, m.name, m.text);
        return ev(ast, new Env(null), ctx);
      }));
    });
    return ctx;
  }

  function parseCached(ctx, name, text) {
    const key = name + '\u0000' + text;
    let ast = ctx.parsed.get(key);
    if (!ast) { ast = M.parse(text); ctx.parsed.set(key, ast); }
    return ast;
  }

  function evaluateStep(ctx, text, step) {
    const ast = M.parse(text);
    if (step && ast.k === 'let') {
      const scope = letEnv(ast, new Env(null), ctx);
      const t = scope.vars.get(step);
      if (t) return t.get();
    }
    return ev(ast, new Env(null), ctx);
  }

  function steps(text) {
    try {
      const ast = M.parse(text);
      if (ast.k !== 'let') return [];
      return ast.binds.map(b => ({ name: b.name, start: b.s, vs: b.vs, ve: b.ve }));
    } catch (e) { return null; }
  }

  Object.assign(M, {
    MError, MErrCell, MDT, MDur, MBinary, MRecord, MTable, MFunc, MType, T,
    typeOf, kindName, isType, typeName, force, toText, numText, display, equals, compare, arith, relational, addDur,
    Thunk, Env, ev, call, fieldOf, itemOf, makeContext, evaluateStep, steps, DAY, cap, pad, durText, tzText
  });
})();
