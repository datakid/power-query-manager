(function () {
  const M = window.M;
  const { MError, MErrCell, MDT, MDur, MBinary, MRecord, MTable, MFunc, MType, T, force, toText, equals, compare, call, display, DAY, pad, numText } = M;

  const L = Object.create(null);
  const run = { host: {}, now: null, flags: new Set(), seed: 1 };

  function def(name, min, max, fn) { L[name] = new MFunc(args => fn(...args), name, min, max); }
  function val(name, v) { L[name] = v; }

  const err = (msg, detail, reason) => new MError(reason || 'Expression.Error', msg, detail);
  const isNull = v => v === null || v === undefined;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function safe(f) {
    try { return f(); } catch (e) { if (e.isM) return new MErrCell(e); throw e; }
  }

  function tbl(v, fn) {
    v = force(v);
    if (!(v instanceof MTable)) throw err((fn ? fn + ': ' : '') + 'We cannot convert a value of type ' + cap(M.kindName(v)) + ' to type Table.', v);
    return v;
  }
  function lst(v) {
    v = force(v);
    if (!Array.isArray(v)) throw err('We cannot convert a value of type ' + cap(M.kindName(v)) + ' to type List.', v);
    return v;
  }
  function rec(v) {
    v = force(v);
    if (!(v instanceof MRecord)) throw err('We cannot convert a value of type ' + cap(M.kindName(v)) + ' to type Record.', v);
    return v;
  }
  function txt(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v !== 'string') throw err('We cannot convert the value ' + display(v) + ' to type Text.', v);
    return v;
  }
  function num(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v !== 'number') throw err('We cannot convert the value ' + display(v) + ' to type Number.', v);
    return v;
  }
  function names(v) {
    v = force(v);
    if (isNull(v)) return [];
    return typeof v === 'string' ? [v] : lst(v).map(x => force(x));
  }
  function pairs(v) {
    v = lst(v);
    if (v.length && !Array.isArray(force(v[0]))) return [v.map(force)];
    return v.map(p => lst(p).map(force));
  }
  const fnc = f => { f = force(f); if (!(f instanceof MFunc)) throw err('Expected a function.', f); return f; };
  const invoke = (f, ...a) => call(f, a);
  const cellRec = (t, r) => t.rowRecord(r);

  const MissingField = { Error: 0, Ignore: 1, UseNull: 2 };
  function colIdx(t, n, missing) {
    const i = t.index(n);
    if (i < 0 && !missing) t.colIndex(n);
    return i;
  }

  function mkTable(cols, rows, types) { return new MTable(cols, rows, types); }

  function combineTables(ts) {
    const cols = [];
    const types = [];
    ts.forEach(t => t.cols.forEach((c, i) => { if (!cols.includes(c)) { cols.push(c); types.push(t.types[i]); } }));
    const rows = [];
    ts.forEach(t => {
      const map = cols.map(c => t.index(c));
      t.rows.forEach(r => rows.push(map.map(i => (i < 0 ? null : r[i]))));
    });
    return mkTable(cols, rows, types);
  }

  function uniqueName(name, taken) {
    if (!taken.includes(name)) return name;
    let i = 1;
    while (taken.includes(name + '_' + i)) i++;
    return name + '_' + i;
  }

  const mkDate = (y, m, d) => new MDT('date', Date.UTC(y, m - 1, d) + (y < 100 ? yearFix(y) : 0));
  const yearFix = y => { const a = new Date(Date.UTC(2000, 0, 1)); a.setUTCFullYear(y); return a.getTime() - Date.UTC(2000, 0, 1) - (Date.UTC(y, 0, 1) - Date.UTC(2000, 0, 1)); };
  const OLE0 = Date.UTC(1899, 11, 30);
  const fromSerial = (n, kind) => {
    const ms = Math.round(n * DAY) + OLE0;
    return new MDT(kind, kind === 'date' ? Math.floor((ms) / DAY) * DAY : ms);
  };
  const toSerial = d => (d.ms - OLE0) / DAY;
  const dayStart = ms => Math.floor(ms / DAY) * DAY;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function parseDateText(s, kind) {
    s = s.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
    let y, mo, d, h = 0, mi = 0, sec = 0, frac = 0, tz = null;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0); frac = m[7] ? +('0.' + m[7]) : 0; tz = m[8] || null; }
    else {
      m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(s);
      if (m) {
        mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
        h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0);
        if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
      } else {
        const p = Date.parse(s + (/(Z|GMT|[+-]\d{2}:?\d{2})$/.test(s) ? '' : ' UTC'));
        if (Number.isNaN(p)) throw err("We couldn't parse the input provided as a " + cap(kind) + ' value.', s, 'DataFormat.Error');
        const dt = new Date(p);
        y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate(); h = dt.getUTCHours(); mi = dt.getUTCMinutes(); sec = dt.getUTCSeconds();
      }
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) throw err("We couldn't parse the input provided as a " + cap(kind) + ' value.', s, 'DataFormat.Error');
    const ms = Date.UTC(y, mo - 1, d, h, mi, sec) + Math.round(frac * 1000);
    let off = 0;
    if (tz && tz !== 'Z') { const t = tz.replace(':', ''); off = (t[0] === '-' ? -1 : 1) * (+t.slice(1, 3) * 60 + +t.slice(3, 5)); }
    if (kind === 'date') return new MDT('date', dayStart(ms));
    if (kind === 'datetimezone') return new MDT('datetimezone', ms, off);
    return new MDT('datetime', ms);
  }

  function parseTimeText(s) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(AM|PM)?$/i.exec(s.trim());
    if (!m) throw err("We couldn't parse the input provided as a Time value.", s, 'DataFormat.Error');
    let h = +m[1];
    if (m[5]) { const pm = m[5].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    return new MDT('time', ((h * 60 + +m[2]) * 60 + +(m[3] || 0)) * 1000 + (m[4] ? Math.round(+('0.' + m[4]) * 1000) : 0));
  }

  function parseNumberText(s) {
    let t = s.trim();
    if (t === '') throw err("We couldn't convert to Number.", s, 'DataFormat.Error');
    let pct = false, neg = false;
    if (t.endsWith('%')) { pct = true; t = t.slice(0, -1).trim(); }
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/^[$€£¥]/, '').replace(/,(?=\d{3}(\D|$))/g, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) {
      if (/^[+-]?infinity$/i.test(t)) return t[0] === '-' ? -Infinity : Infinity;
      if (/^nan$/i.test(t)) return NaN;
      throw err("We couldn't convert to Number.", s, 'DataFormat.Error');
    }
    let n = parseFloat(t);
    if (neg) n = -n;
    return pct ? n / 100 : n;
  }

  function roundMode(x, digits, mode) {
    if (isNull(x)) return null;
    const f = Math.pow(10, digits || 0);
    const v = x * f;
    let r;
    switch (mode == null ? 4 : mode) {
      case 0: r = Math.ceil(v); break;
      case 1: r = Math.floor(v); break;
      case 2: r = Math.sign(v) * Math.round(Math.abs(v)); break;
      case 3: r = Math.trunc(v); break;
      default: {
        const fl = Math.floor(v), diff = v - fl;
        if (Math.abs(diff - 0.5) < 1e-9) r = fl % 2 === 0 ? fl : fl + 1;
        else r = Math.round(v);
      }
    }
    return r / f;
  }

  function numberFrom(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') return parseNumberText(v);
    if (v instanceof MDT) return v.kind === 'time' ? v.ms / DAY : toSerial(v);
    if (v instanceof MDur) return v.ms / DAY;
    throw err('We cannot convert the value ' + display(v) + ' to type Number.', v);
  }

  function dateFrom(v, kind) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v === 'string') return kind === 'time' ? parseTimeText(v) : parseDateText(v, kind);
    if (typeof v === 'number') {
      if (kind === 'time') return new MDT('time', Math.round((v - Math.floor(v)) * DAY));
      return fromSerial(v, kind === 'datetimezone' ? 'datetime' : kind);
    }
    if (v instanceof MDT) {
      if (kind === 'date') { if (v.kind === 'time') break_(v, kind); return new MDT('date', dayStart(v.ms)); }
      if (kind === 'time') { if (v.kind === 'date') break_(v, kind); return new MDT('time', v.ms - dayStart(v.ms)); }
      if (kind === 'datetime') { if (v.kind === 'time') break_(v, kind); return new MDT('datetime', v.ms); }
      if (kind === 'datetimezone') return new MDT('datetimezone', v.ms, v.tz || 0);
    }
    return break_(v, kind);
  }
  function break_(v, kind) { throw err('We cannot convert the value ' + display(v) + ' to type ' + cap(kind) + '.', v); }

  function logicalFrom(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
    }
    throw err('We cannot convert the value ' + display(v) + ' to type Logical.', v);
  }

  function textFrom(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return toText(v);
  }

  function durFrom(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (v instanceof MDur) return v;
    if (typeof v === 'number') return new MDur(v * DAY);
    if (typeof v === 'string') {
      const m = /^(-)?(?:(\d+)\.)?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(v.trim());
      if (!m) throw err("We couldn't parse the input provided as a Duration value.", v, 'DataFormat.Error');
      const ms = ((+(m[2] || 0) * 24 + +m[3]) * 60 + +m[4]) * 60000 + +(m[5] || 0) * 1000 + (m[6] ? Math.round(+('0.' + m[6]) * 1000) : 0);
      return new MDur(m[1] ? -ms : ms);
    }
    throw err('We cannot convert the value ' + display(v) + ' to type Duration.', v);
  }

  function convert(v, t) {
    v = force(v);
    if (isNull(v) || !t) return v;
    const facet = t.facet;
    if (facet === 'Int64.Type' || facet === 'Int32.Type' || facet === 'Int16.Type' || facet === 'Int8.Type' || facet === 'Byte.Type') return roundMode(numberFrom(v), 0, 4);
    if (facet === 'Currency.Type') return roundMode(numberFrom(v), 4, 4);
    switch (t.kind) {
      case 'number': return numberFrom(v);
      case 'text': return textFrom(v);
      case 'logical': return logicalFrom(v);
      case 'date': case 'datetime': case 'time': case 'datetimezone': return dateFrom(v, t.kind);
      case 'duration': return durFrom(v);
      case 'any': return v;
      default: if (!M.isType(v, t)) throw err('We cannot convert the value ' + display(v) + ' to type ' + cap(t.kind) + '.', v); return v;
    }
  }

  function makeComparer(ic) { const f = new MFunc(([a, b]) => compare(a, b, ic), ic ? 'Comparer.OrdinalIgnoreCase' : 'Comparer.Ordinal', 2, 2); f.ic = ic; return f; }
  const isIC = c => { c = force(c); return !!(c && c.ic); };
  const eqWith = (ic) => (a, b) => (ic && typeof force(a) === 'string' && typeof force(b) === 'string') ? force(a).toLowerCase() === force(b).toLowerCase() : equals(a, b);

  function keyOf(vals) { return vals.map(v => { v = force(v); if (v instanceof MDT) return v.kind + v.ms; if (v instanceof MDur) return 'd' + v.ms; return typeof v + ':' + (typeof v === 'object' && v !== null ? display(v) : String(v)); }).join('\u0001'); }

  function sortRows(rows, getKeyCmp) {
    return rows.map((r, i) => [r, i]).sort((a, b) => getKeyCmp(a[0], b[0]) || a[1] - b[1]).map(x => x[0]);
  }

  function sortCriteria(t, crit) {
    crit = force(crit);
    let list;
    if (typeof crit === 'string' || crit instanceof MFunc) list = [crit];
    else {
      const c = lst(crit);
      if (c.length === 2 && typeof force(c[0]) === 'string' && typeof force(c[1]) === 'number') list = [c];
      else list = c;
    }
    const specs = list.map(s => {
      s = force(s);
      let key = s, order = 0;
      if (Array.isArray(s)) { key = force(s[0]); order = force(s[1]) || 0; }
      if (typeof key === 'string') { const i = t.colIndex(key); return { get: r => r[i], order }; }
      const f = fnc(key);
      if (f.max >= 2 && f.min >= 2) return { cmp: (a, b) => invoke(f, cellRec(t, a), cellRec(t, b)), order };
      return { get: r => invoke(f, cellRec(t, r)), order };
    });
    return (a, b) => {
      for (const s of specs) {
        const c = s.cmp ? s.cmp(a, b) : compare(s.get(a), s.get(b));
        if (c) return s.order === 1 ? -c : c;
      }
      return 0;
    };
  }

  function listSortCmp(crit) {
    crit = force(crit);
    if (isNull(crit)) return (a, b) => compare(a, b);
    if (typeof crit === 'number') return crit === 1 ? (a, b) => compare(b, a) : (a, b) => compare(a, b);
    const specs = (Array.isArray(crit) && crit.length === 2 && typeof force(crit[1]) === 'number' && !(Array.isArray(force(crit[0])))) ? [crit] : (Array.isArray(crit) ? crit : [crit]);
    const fs = specs.map(s => {
      s = force(s);
      let f = s, order = 0;
      if (Array.isArray(s)) { f = force(s[0]); order = force(s[1]) || 0; }
      if (typeof f === 'number') return { cmp: (a, b) => compare(a, b), order: f };
      f = fnc(f);
      if (f.min >= 2) return { cmp: (a, b) => invoke(f, a, b), order };
      return { cmp: (a, b) => compare(invoke(f, a), invoke(f, b)), order };
    });
    return (a, b) => { for (const s of fs) { const c = s.cmp(a, b); if (c) return s.order === 1 ? -c : c; } return 0; };
  }

  function countOrCond(t, arg, fromEnd) {
    arg = force(arg);
    if (typeof arg === 'number') return arg;
    const f = fnc(arg);
    const rows = fromEnd ? t.rows.slice().reverse() : t.rows;
    let n = 0;
    for (const r of rows) { if (invoke(f, cellRec(t, r)) === true) n++; else break; }
    return n;
  }

  function newRows(t, rows) { return mkTable(t.cols.slice(), rows, t.types.slice()); }

  function typeFromCols(cols, types) { return new MType('table', { cols, colTypes: types }); }

  function splitCsv(text, delim, quoteCsv) {
    const rows = [];
    let row = [], cell = '', i = 0, q = false, quotedCell = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        if (!quoteCsv && (c === '\n' || c === '\r')) { q = false; continue; }
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '' && !quotedCell) { q = true; quotedCell = true; i++; continue; }
      if (text.startsWith(delim, i)) { row.push(cell); cell = ''; quotedCell = false; i += delim.length; continue; }
      if (c === '\r' || c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = ''; quotedCell = false;
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      cell += c; i++;
    }
    if (cell !== '' || row.length || quotedCell) { row.push(cell); rows.push(row); }
    return rows;
  }

  function decodeBinary(b, enc) {
    b = force(b);
    if (typeof b === 'string') return b;
    if (!(b instanceof MBinary)) throw err('Expected a binary value.', b);
    const map = { 65001: 'utf-8', 1252: 'windows-1252', 1200: 'utf-16le', 1201: 'utf-16be', 20127: 'ascii', 28591: 'iso-8859-1' };
    let label = map[enc == null ? 65001 : enc] || 'utf-8';
    let bytes = b.bytes;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { bytes = bytes.subarray(3); label = 'utf-8'; }
    else if (bytes[0] === 0xFF && bytes[1] === 0xFE) { bytes = bytes.subarray(2); label = 'utf-16le'; }
    return new TextDecoder(label).decode(bytes);
  }

  function jsonToM(x) {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(jsonToM);
    const ks = Object.keys(x);
    return new MRecord(ks, ks.map(k => jsonToM(x[k])));
  }

  function mToJson(v) {
    v = force(v);
    if (isNull(v)) return null;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(mToJson);
    if (v instanceof MRecord) { const o = {}; v.names.forEach((n, i) => { Object.defineProperty(o, n, { value: mToJson(v.values[i]), enumerable: true }); }); return o; }
    if (v instanceof MTable) return v.rows.map(r => mToJson(cellRec(v, r)));
    if (v instanceof MDT || v instanceof MDur) return toText(v);
    return display(v);
  }

  function fmtDate(v, f) {
    const d = v.d;
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate(), dow = d.getUTCDay();
    const h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds(), ms = d.getUTCMilliseconds();
    return f.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|fff|ff|f|tt|zzz|"[^"]*"|'[^']*'|\\./g, tk => {
      switch (tk) {
        case 'yyyy': return String(y).padStart(4, '0');
        case 'yy': return pad(y % 100);
        case 'MMMM': return MONTHS[mo];
        case 'MMM': return MONTHS[mo].slice(0, 3);
        case 'MM': return pad(mo + 1);
        case 'M': return String(mo + 1);
        case 'dddd': return DAYS[dow];
        case 'ddd': return DAYS[dow].slice(0, 3);
        case 'dd': return pad(day);
        case 'd': return String(day);
        case 'HH': return pad(h);
        case 'H': return String(h);
        case 'hh': return pad(h % 12 || 12);
        case 'h': return String(h % 12 || 12);
        case 'mm': return pad(mi);
        case 'm': return String(mi);
        case 'ss': return pad(s);
        case 's': return String(s);
        case 'fff': return pad(ms, 3);
        case 'ff': return pad(Math.floor(ms / 10));
        case 'f': return String(Math.floor(ms / 100));
        case 'tt': return h < 12 ? 'AM' : 'PM';
        case 'zzz': return M.tzText(v.tz || 0);
        default: return tk[0] === '\\' ? tk[1] : tk.slice(1, -1);
      }
    });
  }

  function fmtNumber(n, f) {
    if (isNull(n)) return null;
    if (!f || f === 'G' || f === 'g') return numText(n);
    const m = /^([NnFfDdPpEeXxCc])(\d*)$/.exec(f);
    if (m) {
      const p = m[2] === '' ? null : +m[2];
      switch (m[1].toUpperCase()) {
        case 'N': return n.toLocaleString('en-US', { minimumFractionDigits: p == null ? 2 : p, maximumFractionDigits: p == null ? 2 : p });
        case 'F': return n.toFixed(p == null ? 2 : p);
        case 'D': { const s = String(Math.abs(Math.trunc(n))).padStart(p || 0, '0'); return (n < 0 ? '-' : '') + s; }
        case 'P': return (n * 100).toLocaleString('en-US', { minimumFractionDigits: p == null ? 2 : p, maximumFractionDigits: p == null ? 2 : p }) + ' %';
        case 'E': { const s = n.toExponential(p == null ? 6 : p).replace(/e([+-])(\d+)$/, (x, sg, d) => (m[1] === 'e' ? 'e' : 'E') + sg + d.padStart(3, '0')); return s; }
        case 'X': { const s = Math.trunc(n).toString(16).padStart(p || 0, '0'); return m[1] === 'X' ? s.toUpperCase() : s; }
        case 'C': return '$' + n.toLocaleString('en-US', { minimumFractionDigits: p == null ? 2 : p, maximumFractionDigits: p == null ? 2 : p });
      }
    }
    let x = n;
    const pct = f.includes('%');
    if (pct) x *= 100;
    const dot = f.indexOf('.');
    const decPart = dot >= 0 ? f.slice(dot + 1).replace(/[^0#]/g, '') : '';
    const minDec = (decPart.match(/0/g) || []).length;
    const maxDec = decPart.length;
    const group = /[0#],[0#]/.test(f);
    const intPart = (dot >= 0 ? f.slice(0, dot) : f).replace(/[^0]/g, '');
    let s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: minDec, maximumFractionDigits: maxDec, minimumIntegerDigits: Math.max(1, intPart.length), useGrouping: group });
    if (intPart.length === 0 && s.startsWith('0.')) s = s.slice(1);
    const prefix = f.match(/^[^0#.,%]*/)[0].replace(/["']/g, '');
    const suffix = f.match(/[^0#.,%]*$/)[0].replace(/["']/g, '');
    return (x < 0 ? '-' : '') + prefix + s + (pct ? '%' : '') + suffix;
  }

  function optRec(v) { v = force(v); return v instanceof MRecord ? v : null; }
  function optField(r, n, d) { return r && r.has(n) ? force(r.get(n)) : d; }

  def('Table.RowCount', 1, 1, t => tbl(t).rows.length);
  def('Table.ColumnCount', 1, 1, t => tbl(t).cols.length);
  def('Table.ColumnNames', 1, 1, t => tbl(t).cols.slice());
  def('Table.IsEmpty', 1, 1, t => tbl(t).rows.length === 0);
  def('Table.Column', 2, 2, (t, c) => { t = tbl(t); const i = t.colIndex(force(c)); return t.rows.map(r => r[i]); });
  def('Table.ToRows', 1, 1, t => tbl(t).rows.map(r => r.slice()));
  def('Table.ToRecords', 1, 1, t => { t = tbl(t); return t.rows.map(r => cellRec(t, r)); });
  def('Table.ToColumns', 1, 1, t => { t = tbl(t); return t.cols.map((c, i) => t.rows.map(r => r[i])); });
  def('Table.First', 1, 2, (t, d) => { t = tbl(t); return t.rows.length ? cellRec(t, t.rows[0]) : (d === undefined ? null : d); });
  def('Table.Last', 1, 2, (t, d) => { t = tbl(t); return t.rows.length ? cellRec(t, t.rows[t.rows.length - 1]) : (d === undefined ? null : d); });
  def('Table.Buffer', 1, 2, t => tbl(t));
  def('Table.Keys', 1, 1, t => (tbl(t).keys || []).map(k => MRecord.from({ Columns: k.cols, Primary: k.primary })));
  def('Table.AddKey', 3, 3, (t, cols, primary) => { t = tbl(t); const n = newRows(t, t.rows); n.keys = (t.keys || []).concat([{ cols: names(cols), primary: force(primary) }]); return n; });

  def('Table.FromRows', 1, 2, (rows, cols) => {
    rows = lst(rows).map(r => lst(r));
    cols = force(cols);
    let names_ = null, types = null;
    if (cols instanceof MType) { names_ = cols.cols; types = cols.colTypes; }
    else if (!isNull(cols)) names_ = names(cols);
    const w = names_ ? names_.length : rows.reduce((a, r) => Math.max(a, r.length), 0);
    if (!names_) names_ = Array.from({ length: w }, (_, i) => 'Column' + (i + 1));
    return mkTable(names_, rows.map(r => { if (r.length > w) throw err('There were more values than columns.', null); return Array.from({ length: w }, (_, i) => (i < r.length ? r[i] : null)); }), types);
  });
  def('#table', 2, 2, (cols, rows) => L['Table.FromRows'].call([rows, cols]));
  def('Table.FromRecords', 1, 3, (recs, cols, missing) => {
    recs = lst(recs).map(rec);
    cols = force(cols);
    let ns = [], types = null;
    if (cols instanceof MType) { ns = cols.cols; types = cols.colTypes; }
    else if (!isNull(cols)) ns = names(cols);
    else recs.forEach(r => r.names.forEach(n => { if (!ns.includes(n)) ns.push(n); }));
    const mf = force(missing);
    return mkTable(ns, recs.map(r => ns.map(n => { const i = r.index(n); if (i < 0) { if (mf || isNull(cols)) return null; throw err("The field '" + n + "' of the record wasn't found.", r); } return r.values[i]; })), types);
  });
  def('Table.FromColumns', 1, 2, (lists, cols) => {
    lists = lst(lists).map(lst);
    const h = lists.reduce((a, l) => Math.max(a, l.length), 0);
    cols = force(cols);
    let ns = cols instanceof MType ? cols.cols : (isNull(cols) ? lists.map((_, i) => 'Column' + (i + 1)) : names(cols));
    const rows = Array.from({ length: h }, (_, r) => lists.map(l => (r < l.length ? l[r] : null)));
    return mkTable(ns, rows, cols instanceof MType ? cols.colTypes : null);
  });
  def('Table.FromList', 1, 5, (list, splitter, cols, def_, extra) => {
    list = lst(list);
    splitter = force(splitter);
    const sp = isNull(splitter) ? L['Splitter.SplitByNothing'].call([]) : fnc(splitter);
    const rows = list.map(x => { const r = force(invoke(sp, x)); return Array.isArray(r) ? r : (r instanceof MRecord ? r.values : [r]); });
    cols = force(cols);
    let ns;
    if (cols instanceof MType) ns = cols.cols;
    else if (typeof cols === 'number') ns = Array.from({ length: cols }, (_, i) => 'Column' + (i + 1));
    else if (!isNull(cols)) ns = names(cols);
    else { const w = rows.reduce((a, r) => Math.max(a, r.length), 0); ns = Array.from({ length: w }, (_, i) => 'Column' + (i + 1)); }
    const d = isNull(def_) ? null : force(def_);
    return mkTable(ns, rows.map(r => ns.map((_, i) => (i < r.length ? r[i] : d))));
  });
  def('Splitter.SplitByNothing', 0, 0, () => new MFunc(([x]) => [x], 'Splitter', 1, 1));

  def('Table.PromoteHeaders', 1, 2, t => {
    t = tbl(t);
    if (!t.rows.length) return t;
    const ns = [];
    t.rows[0].forEach((v, i) => {
      let n;
      try { v = force(v); n = isNull(v) || v === '' ? 'Column' + (i + 1) : textFrom(v); } catch (e) { n = 'Column' + (i + 1); }
      ns.push(uniqueName(n, ns));
    });
    return mkTable(ns, t.rows.slice(1));
  });
  def('Table.DemoteHeaders', 1, 1, t => { t = tbl(t); return mkTable(t.cols.map((_, i) => 'Column' + (i + 1)), [t.cols.slice()].concat(t.rows)); });

  def('Table.TransformColumnTypes', 2, 3, (t, spec) => {
    t = tbl(t);
    const ps = pairs(spec);
    const types = t.types.slice();
    const conv = ps.map(([c, ty]) => { const i = t.colIndex(c); types[i] = ty; return [i, ty]; });
    const rows = t.rows.map(r => { const n = r.slice(); conv.forEach(([i, ty]) => { const v = n[i]; if (!(v instanceof MErrCell)) n[i] = safe(() => convert(v, ty)); }); return n; });
    return mkTable(t.cols.slice(), rows, types);
  });

  def('Table.SelectRows', 2, 2, (t, cond) => {
    t = tbl(t); const f = fnc(cond);
    return newRows(t, t.rows.filter(r => { const v = force(invoke(f, cellRec(t, r))); if (v !== true && v !== false && v !== null) throw err('We cannot convert the value ' + display(v) + ' to type Logical.', v); return v === true; }));
  });
  def('Table.SelectColumns', 2, 3, (t, cols, missing) => {
    t = tbl(t); const ns = names(cols); const mf = force(missing);
    const idx = ns.map(n => colIdx(t, n, mf));
    const keep = ns.map((n, k) => [n, idx[k]]).filter(([, i]) => i >= 0 || mf === MissingField.UseNull);
    return mkTable(keep.map(k => k[0]), t.rows.map(r => keep.map(([, i]) => (i < 0 ? null : r[i]))), keep.map(([, i]) => (i < 0 ? null : t.types[i])));
  });
  def('Table.RemoveColumns', 2, 3, (t, cols, missing) => {
    t = tbl(t); const ns = names(cols); const mf = force(missing);
    ns.forEach(n => colIdx(t, n, mf));
    const keep = t.cols.map((c, i) => i).filter(i => !ns.includes(t.cols[i]));
    return mkTable(keep.map(i => t.cols[i]), t.rows.map(r => keep.map(i => r[i])), keep.map(i => t.types[i]));
  });
  def('Table.RenameColumns', 2, 3, (t, spec, missing) => {
    t = tbl(t); const mf = force(missing);
    const cols = t.cols.slice();
    pairs(spec).forEach(([a, b]) => { const i = cols.indexOf(a); if (i < 0) { if (!mf) t.colIndex(a); return; } cols[i] = b; });
    return mkTable(cols, t.rows, t.types.slice());
  });
  def('Table.ReorderColumns', 2, 3, (t, order, missing) => {
    t = tbl(t); const mf = force(missing);
    const ns = names(order).filter(n => colIdx(t, n, mf) >= 0);
    const slots = t.cols.map((c, i) => (ns.includes(c) ? i : -1)).filter(i => i >= 0);
    const perm = t.cols.map((c, i) => i);
    slots.forEach((s, k) => { perm[s] = t.index(ns[k]); });
    return mkTable(perm.map(i => t.cols[i]), t.rows.map(r => perm.map(i => r[i])), perm.map(i => t.types[i]));
  });
  def('Table.AddColumn', 3, 4, (t, name, f, ty) => {
    t = tbl(t); f = fnc(f); name = force(name);
    if (t.index(name) >= 0) throw err("A column named '" + name + "' already exists in the table.", name);
    ty = force(ty);
    return mkTable(t.cols.concat([name]), t.rows.map(r => r.concat([safe(() => invoke(f, cellRec(t, r)))])), t.types.concat([ty instanceof MType ? ty : null]));
  });
  def('Table.AddIndexColumn', 2, 5, (t, name, start, step) => {
    t = tbl(t); const s = isNull(force(start)) ? 0 : num(start); const st = isNull(force(step)) ? 1 : num(step);
    return mkTable(t.cols.concat([force(name)]), t.rows.map((r, i) => r.concat([s + i * st])), t.types.concat([L['Int64.Type']]));
  });
  def('Table.DuplicateColumn', 3, 4, (t, c, n) => { t = tbl(t); const i = t.colIndex(force(c)); return mkTable(t.cols.concat([force(n)]), t.rows.map(r => r.concat([r[i]])), t.types.concat([t.types[i]])); });
  def('Table.TransformColumns', 2, 4, (t, spec, deflt, missing) => {
    t = tbl(t); const mf = force(missing);
    const types = t.types.slice();
    const ops = [];
    pairs(spec).forEach(p => { const i = colIdx(t, p[0], mf); if (i < 0) return; ops[i] = fnc(p[1]); if (p[2] instanceof MType) types[i] = p[2]; });
    const df = isNull(force(deflt)) ? null : fnc(deflt);
    return mkTable(t.cols.slice(), t.rows.map(r => r.map((v, i) => { const f = ops[i] || df; if (!f || v instanceof MErrCell) return v; return safe(() => invoke(f, v)); })), types);
  });
  def('Table.TransformRows', 2, 2, (t, f) => { t = tbl(t); f = fnc(f); return t.rows.map(r => invoke(f, cellRec(t, r))); });
  def('Table.ReplaceValue', 5, 5, (t, oldV, newV, replacer, cols) => {
    t = tbl(t); const rp = fnc(replacer); const idx = names(cols).map(c => t.colIndex(c));
    const ov = force(oldV), nv = force(newV);
    return newRows(t, t.rows.map(r => {
      const n = r.slice();
      idx.forEach(i => {
        if (n[i] instanceof MErrCell) return;
        n[i] = safe(() => {
          const cur = n[i];
          const o = ov instanceof MFunc ? invoke(ov, cellRec(t, r)) : ov;
          const w = nv instanceof MFunc ? invoke(nv, cellRec(t, r)) : nv;
          return invoke(rp, cur, o, w);
        });
      });
      return n;
    }));
  });
  def('Table.ReplaceErrorValues', 2, 2, (t, spec) => {
    t = tbl(t); const ps = pairs(spec).map(([c, v]) => [t.colIndex(c), v]);
    return newRows(t, t.rows.map(r => { const n = r.slice(); ps.forEach(([i, v]) => { if (n[i] instanceof MErrCell) n[i] = v; }); return n; }));
  });
  const hasErr = (r, idx) => idx.some(i => r[i] instanceof MErrCell);
  def('Table.RemoveRowsWithErrors', 1, 2, (t, cols) => { t = tbl(t); const idx = isNull(force(cols)) ? t.cols.map((_, i) => i) : names(cols).map(c => t.colIndex(c)); return newRows(t, t.rows.filter(r => !hasErr(r, idx))); });
  def('Table.SelectRowsWithErrors', 1, 2, (t, cols) => { t = tbl(t); const idx = isNull(force(cols)) ? t.cols.map((_, i) => i) : names(cols).map(c => t.colIndex(c)); return newRows(t, t.rows.filter(r => hasErr(r, idx))); });

  def('Table.Sort', 2, 2, (t, crit) => { t = tbl(t); return newRows(t, sortRows(t.rows, sortCriteria(t, crit))); });
  def('Table.Distinct', 1, 2, (t, cols) => {
    t = tbl(t); cols = force(cols);
    const idx = isNull(cols) ? t.cols.map((_, i) => i) : names(Array.isArray(cols) && Array.isArray(force(cols[0])) ? force(cols[0])[0] : (Array.isArray(cols) && cols.length === 2 && force(cols[1]) instanceof MFunc ? cols[0] : cols)).map(c => t.colIndex(c));
    const ic = Array.isArray(cols) && cols.some(c => isIC(c));
    const seen = new Set();
    return newRows(t, t.rows.filter(r => { const k = keyOf(idx.map(i => { const v = force(r[i]); return ic && typeof v === 'string' ? v.toLowerCase() : v; })); if (seen.has(k)) return false; seen.add(k); return true; }));
  });
  def('Table.FirstN', 2, 2, (t, n) => { t = tbl(t); return newRows(t, t.rows.slice(0, countOrCond(t, n))); });
  def('Table.LastN', 2, 2, (t, n) => { t = tbl(t); const k = countOrCond(t, n, true); return newRows(t, k ? t.rows.slice(-k) : []); });
  def('Table.Skip', 1, 2, (t, n) => { t = tbl(t); return newRows(t, t.rows.slice(isNull(force(n)) ? 1 : countOrCond(t, n))); });
  def('Table.RemoveFirstN', 1, 2, (t, n) => L['Table.Skip'].call([t, n]));
  def('Table.RemoveLastN', 1, 2, (t, n) => { t = tbl(t); const k = isNull(force(n)) ? 1 : countOrCond(t, n, true); return newRows(t, t.rows.slice(0, Math.max(0, t.rows.length - k))); });
  def('Table.Range', 2, 3, (t, off, cnt) => { t = tbl(t); off = num(off); cnt = force(cnt); return newRows(t, t.rows.slice(off, isNull(cnt) ? undefined : off + cnt)); });
  def('Table.InsertRows', 3, 3, (t, off, recs) => { t = tbl(t); const rs = lst(recs).map(r => { r = rec(r); return t.cols.map(c => (r.has(c) ? r.get(c) : null)); }); const rows = t.rows.slice(); rows.splice(num(off), 0, ...rs); return newRows(t, rows); });
  def('Table.RemoveMatchingRows', 2, 3, (t, recs) => { t = tbl(t); const rs = lst(recs).map(rec); return newRows(t, t.rows.filter(r => !rs.some(m => m.names.every((n, k) => equals(r[t.colIndex(n)], m.values[k]))))); });
  def('Table.Contains', 2, 3, (t, r) => { t = tbl(t); r = rec(r); return t.rows.some(row => r.names.every((n, k) => equals(row[t.colIndex(n)], r.values[k]))); });
  def('Table.MatchesAnyRows', 2, 2, (t, f) => { t = tbl(t); f = fnc(f); return t.rows.some(r => invoke(f, cellRec(t, r)) === true); });
  def('Table.MatchesAllRows', 2, 2, (t, f) => { t = tbl(t); f = fnc(f); return t.rows.every(r => invoke(f, cellRec(t, r)) === true); });
  const tMinMax = sign => (t, crit, d) => { t = tbl(t); if (!t.rows.length) return d === undefined ? null : d; const c = sortCriteria(t, crit); let best = t.rows[0]; t.rows.forEach(r => { if (sign * c(r, best) > 0) best = r; }); return cellRec(t, best); };
  def('Table.Max', 2, 3, tMinMax(1));
  def('Table.Min', 2, 3, tMinMax(-1));

  def('Table.Group', 3, 5, (t, keys, aggs, kind, cmp) => {
    t = tbl(t); const ks = names(keys); const ki = ks.map(k => t.colIndex(k));
    const ag = pairs(aggs);
    const local = force(kind) === 0;
    const ic = isIC(cmp);
    const groups = [];
    const map = new Map();
    t.rows.forEach(r => {
      const kv = ki.map(i => force(r[i]));
      const k = keyOf(kv.map(v => (ic && typeof v === 'string' ? v.toLowerCase() : v)));
      if (local) {
        const last = groups[groups.length - 1];
        if (last && last.k === k) last.rows.push(r); else groups.push({ k, kv, rows: [r] });
      } else {
        let g = map.get(k);
        if (!g) { g = { k, kv, rows: [] }; map.set(k, g); groups.push(g); }
        g.rows.push(r);
      }
    });
    const out = groups.map(g => { const sub = newRows(t, g.rows); return g.kv.concat(ag.map(a => safe(() => invoke(fnc(a[1]), sub)))); });
    return mkTable(ks.concat(ag.map(a => a[0])), out, ki.map(i => t.types[i]).concat(ag.map(a => (a[2] instanceof MType ? a[2] : null))));
  });

  const JoinKind = { Inner: 0, LeftOuter: 1, RightOuter: 2, FullOuter: 3, LeftAnti: 4, RightAnti: 5 };
  function joinMatches(t1, k1, t2, k2) {
    const i1 = names(k1).map(c => t1.colIndex(c)), i2 = names(k2).map(c => t2.colIndex(c));
    const idx = new Map();
    t2.rows.forEach((r, j) => { const kv = i2.map(i => force(r[i])); if (kv.some(isNull)) return; const k = keyOf(kv); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(j); });
    const matched2 = new Set();
    const res = t1.rows.map(r => { const kv = i1.map(i => force(r[i])); const m = kv.some(isNull) ? [] : (idx.get(keyOf(kv)) || []); m.forEach(j => matched2.add(j)); return m; });
    return { res, matched2 };
  }
  def('Table.NestedJoin', 6, 8, (t1, k1, t2, k2, newCol, kind) => {
    t1 = tbl(t1); t2 = tbl(t2); kind = force(kind); if (isNull(kind)) kind = 1;
    const { res, matched2 } = joinMatches(t1, k1, t2, k2);
    const rows = [];
    t1.rows.forEach((r, i) => {
      const m = res[i];
      const keep = kind === 4 ? m.length === 0 : kind === 0 ? m.length > 0 : kind === 5 || kind === 2 ? m.length > 0 : true;
      if (kind === 5) return;
      if (keep) rows.push(r.concat([newRows(t2, kind === 4 ? [] : m.map(j => t2.rows[j]))]));
    });
    if (kind === 2 || kind === 3 || kind === 5) {
      t2.rows.forEach((r, j) => { if (!matched2.has(j)) rows.push(t1.cols.map(() => null).concat([newRows(t2, [r])])); });
    }
    return mkTable(t1.cols.concat([force(newCol)]), rows, t1.types.concat([typeFromCols(t2.cols, t2.types)]));
  });
  def('Table.Join', 4, 7, (t1, k1, t2, k2, kind) => {
    t1 = tbl(t1); t2 = tbl(t2); kind = force(kind); if (isNull(kind)) kind = 0;
    t2.cols.forEach(c => { if (t1.index(c) >= 0) throw err("A join operation cannot result in a table with duplicate column names ('" + c + "').", c); });
    const { res, matched2 } = joinMatches(t1, k1, t2, k2);
    const rows = [];
    const nulls2 = t2.cols.map(() => null), nulls1 = t1.cols.map(() => null);
    t1.rows.forEach((r, i) => {
      if (kind === 5) return;
      if (kind === 4) { if (!res[i].length) rows.push(r.concat(nulls2)); return; }
      if (res[i].length) res[i].forEach(j => rows.push(r.concat(t2.rows[j])));
      else if (kind === 1 || kind === 3) rows.push(r.concat(nulls2));
    });
    if (kind === 2 || kind === 3 || kind === 5) t2.rows.forEach((r, j) => { if (!matched2.has(j)) rows.push(nulls1.concat(r)); });
    return mkTable(t1.cols.concat(t2.cols), rows, t1.types.concat(t2.types));
  });
  def('Table.ExpandTableColumn', 3, 4, (t, col, cols, newNames) => {
    t = tbl(t); const ci = t.colIndex(force(col)); const ns = names(cols); const nn = isNull(force(newNames)) ? ns : names(newNames);
    const outCols = t.cols.slice(0, ci).concat(nn, t.cols.slice(ci + 1));
    const rows = [];
    t.rows.forEach(r => {
      const sub = force(r[ci]);
      const pre = r.slice(0, ci), post = r.slice(ci + 1);
      if (isNull(sub) || !(sub instanceof MTable) || !sub.rows.length) { rows.push(pre.concat(ns.map(() => null), post)); return; }
      const idx = ns.map(n => sub.index(n));
      sub.rows.forEach(sr => rows.push(pre.concat(idx.map(i => (i < 0 ? null : sr[i])), post)));
    });
    return mkTable(outCols, rows);
  });
  def('Table.ExpandRecordColumn', 3, 4, (t, col, fields, newNames) => {
    t = tbl(t); const ci = t.colIndex(force(col)); const ns = names(fields); const nn = isNull(force(newNames)) ? ns : names(newNames);
    return mkTable(t.cols.slice(0, ci).concat(nn, t.cols.slice(ci + 1)), t.rows.map(r => { const v = force(r[ci]); return r.slice(0, ci).concat(ns.map(n => (v instanceof MRecord && v.has(n) ? v.get(n) : null)), r.slice(ci + 1)); }));
  });
  def('Table.ExpandListColumn', 2, 2, (t, col) => {
    t = tbl(t); const ci = t.colIndex(force(col)); const rows = [];
    t.rows.forEach(r => { const v = force(r[ci]); if (Array.isArray(v) && v.length) v.forEach(x => { const n = r.slice(); n[ci] = x; rows.push(n); }); else { const n = r.slice(); n[ci] = null; rows.push(n); } });
    return newRows(t, rows);
  });
  def('Table.Combine', 1, 2, ts => combineTables(lst(ts).map(x => tbl(x))));
  def('Table.UnpivotOtherColumns', 4, 4, (t, keep, attr, value) => {
    t = tbl(t); const ks = names(keep); const ki = ks.map(k => t.colIndex(k));
    const others = t.cols.map((c, i) => i).filter(i => !ks.includes(t.cols[i]));
    const rows = [];
    t.rows.forEach(r => others.forEach(i => { if (!isNull(r[i])) rows.push(ki.map(k => r[k]).concat([t.cols[i], r[i]])); }));
    return mkTable(ks.concat([force(attr), force(value)]), rows);
  });
  def('Table.Unpivot', 4, 4, (t, cols, attr, value) => {
    t = tbl(t); const cs = names(cols); cs.forEach(c => t.colIndex(c));
    const keep = t.cols.map((c, i) => i).filter(i => !cs.includes(t.cols[i]));
    const rows = [];
    t.rows.forEach(r => cs.forEach(c => { const i = t.index(c); if (!isNull(r[i])) rows.push(keep.map(k => r[k]).concat([c, r[i]])); }));
    return mkTable(keep.map(i => t.cols[i]).concat([force(attr), force(value)]), rows);
  });
  def('Table.Pivot', 4, 5, (t, pvals, attr, value, agg) => {
    t = tbl(t); const pv = lst(pvals).map(x => textFrom(x)); const ai = t.colIndex(force(attr)), vi = t.colIndex(force(value));
    const keep = t.cols.map((c, i) => i).filter(i => i !== ai && i !== vi);
    const groups = new Map(); const order = [];
    t.rows.forEach(r => { const k = keyOf(keep.map(i => r[i])); let g = groups.get(k); if (!g) { g = { base: keep.map(i => r[i]), cells: pv.map(() => []) }; groups.set(k, g); order.push(g); } const p = pv.indexOf(textFrom(r[ai])); if (p >= 0) g.cells[p].push(r[vi]); });
    const af = isNull(force(agg)) ? null : fnc(agg);
    const rows = order.map(g => g.base.concat(g.cells.map(c => { if (af) return safe(() => invoke(af, c)); if (c.length > 1) return new MErrCell(err('There are too many elements in the enumeration to complete the operation.')); return c.length ? c[0] : null; })));
    return mkTable(keep.map(i => t.cols[i]).concat(pv), rows);
  });
  const fill = up => (t, cols) => {
    t = tbl(t); const idx = names(cols).map(c => t.colIndex(c));
    const rows = t.rows.map(r => r.slice());
    const seq = up ? rows.slice().reverse() : rows;
    idx.forEach(i => { let last = null; seq.forEach(r => { if (isNull(r[i])) r[i] = last; else last = r[i]; }); });
    return newRows(t, rows);
  };
  def('Table.FillDown', 2, 2, fill(false));
  def('Table.FillUp', 2, 2, fill(true));
  def('Table.SplitColumn', 3, 6, (t, col, splitter, cols, deflt) => {
    t = tbl(t); const name = force(col); const ci = t.colIndex(name); const sp = fnc(splitter);
    const parts = t.rows.map(r => { const v = force(r[ci]); const p = force(invoke(sp, v)); return Array.isArray(p) ? p : [p]; });
    cols = force(cols);
    let ns;
    if (typeof cols === 'number') ns = Array.from({ length: cols }, (_, i) => name + '.' + (i + 1));
    else if (!isNull(cols)) ns = names(cols);
    else { const w = parts.reduce((a, p) => Math.max(a, p.length), 0); ns = Array.from({ length: w }, (_, i) => name + '.' + (i + 1)); }
    const d = isNull(force(deflt)) ? null : force(deflt);
    return mkTable(t.cols.slice(0, ci).concat(ns, t.cols.slice(ci + 1)), t.rows.map((r, k) => r.slice(0, ci).concat(ns.map((_, i) => (i < parts[k].length ? parts[k][i] : d)), r.slice(ci + 1))));
  });
  def('Table.CombineColumns', 4, 4, (t, cols, comb, name) => {
    t = tbl(t); const cs = names(cols); const idx = cs.map(c => t.colIndex(c)); const f = fnc(comb);
    const first = Math.min(...idx);
    const keep = t.cols.map((c, i) => i).filter(i => !idx.includes(i));
    const pos = keep.filter(i => i < first).length;
    const outCols = keep.map(i => t.cols[i]); outCols.splice(pos, 0, force(name));
    return mkTable(outCols, t.rows.map(r => { const o = keep.map(i => r[i]); o.splice(pos, 0, safe(() => invoke(f, idx.map(i => r[i])))); return o; }));
  });
  def('Table.Transpose', 1, 2, (t, cols) => {
    t = tbl(t); const h = t.cols.length;
    const ns = isNull(force(cols)) ? t.rows.map((_, i) => 'Column' + (i + 1)) : names(cols);
    return mkTable(ns, Array.from({ length: h }, (_, c) => t.rows.map(r => r[c])));
  });
  def('Table.Schema', 1, 1, t => {
    t = tbl(t);
    return mkTable(['Name', 'Position', 'TypeName', 'Kind', 'IsNullable'], t.cols.map((c, i) => { const ty = t.types[i]; return [c, i, ty ? (ty.facet || cap(ty.kind) + '.Type') : 'Any.Type', ty ? ty.kind : 'any', ty ? !!ty.nullable : true]; }));
  });
  def('Table.Profile', 1, 2, t => {
    t = tbl(t);
    return mkTable(['Column', 'Min', 'Max', 'Average', 'Count', 'NullCount', 'DistinctCount'], t.cols.map((c, i) => {
      const vs = t.rows.map(r => r[i]).filter(v => !(v instanceof MErrCell));
      const nn = vs.filter(v => !isNull(v));
      const sorted = nn.slice().sort((a, b) => compare(a, b));
      const nums = nn.filter(v => typeof v === 'number');
      return [c, sorted.length ? sorted[0] : null, sorted.length ? sorted[sorted.length - 1] : null, nums.length === nn.length && nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, t.rows.length, vs.length - nn.length, new Set(nn.map(v => keyOf([v]))).size];
    }));
  });
  def('Table.Partition', 4, 4, (t, col, groups, hash) => { t = tbl(t); const ci = t.colIndex(force(col)); const g = num(groups); const h = fnc(hash); const out = Array.from({ length: g }, () => []); t.rows.forEach(r => out[((invoke(h, r[ci]) % g) + g) % g].push(r)); return out.map(rs => newRows(t, rs)); });
  def('Table.ReplaceRows', 4, 4, (t, off, cnt, recs) => { t = tbl(t); const rows = t.rows.slice(); rows.splice(num(off), num(cnt), ...lst(recs).map(r => { r = rec(r); return t.cols.map(c => (r.has(c) ? r.get(c) : null)); })); return newRows(t, rows); });
  def('Table.FuzzyNestedJoin', 0, 99, () => { throw err('Table.FuzzyNestedJoin is not available in Quoin.', null, 'Quoin.Unsupported'); });

  const nums = l => lst(l).map(force).filter(v => !isNull(v));
  def('List.Count', 1, 1, l => lst(l).length);
  def('List.NonNullCount', 1, 1, l => nums(l).length);
  def('List.Sum', 1, 2, l => { const v = nums(l); if (!v.length) return null; if (v[0] instanceof MDur) return new MDur(v.reduce((a, b) => a + b.ms, 0)); return v.reduce((a, b) => M.arith('+', a, b)); });
  def('List.Product', 1, 2, l => { const v = nums(l); return v.length ? v.reduce((a, b) => a * b, 1) : null; });
  def('List.Average', 1, 2, l => { const v = nums(l); if (!v.length) return null; if (v[0] instanceof MDT) { const avg = v.reduce((a, b) => a + b.ms, 0) / v.length; return new MDT(v[0].kind, avg); } return v.reduce((a, b) => a + num(b), 0) / v.length; });
  const lMinMax = s => (l, d, crit) => { const v = nums(l); if (!v.length) return d === undefined ? null : force(d); const c = listSortCmp(crit); return v.reduce((a, b) => (s * c(b, a) > 0 ? b : a)); };
  def('List.Min', 1, 4, lMinMax(-1));
  def('List.Max', 1, 4, lMinMax(1));
  def('List.Median', 1, 2, l => { const v = nums(l).sort((a, b) => compare(a, b)); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (typeof v[m] === 'number' ? (v[m - 1] + v[m]) / 2 : v[m - 1]); });
  def('List.Mode', 1, 2, l => { const v = nums(l); if (!v.length) throw err('The list is empty.'); const c = new Map(); let best = null, bc = 0; v.forEach(x => { const k = keyOf([x]); const n = (c.get(k) || 0) + 1; c.set(k, n); if (n > bc) { bc = n; best = x; } }); return best; });
  def('List.StandardDeviation', 1, 1, l => { const v = nums(l); if (v.length < 2) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1)); });
  def('List.Percentile', 2, 3, (l, p) => { const v = nums(l).sort((a, b) => a - b); const ps = force(p); const one = q => { if (!v.length) return null; const h = (v.length - 1) * q; const lo = Math.floor(h); return v[lo] + (h - lo) * ((v[lo + 1] ?? v[lo]) - v[lo]); }; return Array.isArray(ps) ? ps.map(x => one(force(x))) : one(ps); });
  def('List.Distinct', 1, 2, (l, c) => { const ic = isIC(c); const seen = new Set(); return lst(l).filter(x => { let v = force(x); if (ic && typeof v === 'string') v = v.toLowerCase(); const k = keyOf([v]); if (seen.has(k)) return false; seen.add(k); return true; }); });
  def('List.Sort', 1, 2, (l, c) => sortRows(lst(l).slice(), listSortCmp(c)));
  def('List.Select', 2, 2, (l, f) => { f = fnc(f); return lst(l).filter(x => invoke(f, x) === true); });
  def('List.Transform', 2, 2, (l, f) => { f = fnc(f); return lst(l).map(x => invoke(f, x)); });
  def('List.TransformMany', 3, 3, (l, cf, rf) => { cf = fnc(cf); rf = fnc(rf); const out = []; lst(l).forEach(x => lst(invoke(cf, x)).forEach(y => out.push(invoke(rf, x, y)))); return out; });
  def('List.Accumulate', 3, 3, (l, seed, f) => { f = fnc(f); return lst(l).reduce((a, x) => invoke(f, a, x), seed); });
  def('List.Generate', 3, 4, (init, cond, next, sel) => { const out = []; let s = invoke(fnc(init)); const c = fnc(cond), n = fnc(next); const se = isNull(force(sel)) ? null : fnc(sel); let guard = 0; while (invoke(c, s) === true) { out.push(se ? invoke(se, s) : s); s = invoke(n, s); if (++guard > 1e7) throw err('List.Generate produced too many items.'); } return out; });
  def('List.Combine', 1, 1, ls => [].concat(...lst(ls).map(lst)));
  def('List.Zip', 1, 1, ls => { ls = lst(ls).map(lst); const h = ls.reduce((a, l) => Math.max(a, l.length), 0); return Array.from({ length: h }, (_, i) => ls.map(l => (i < l.length ? l[i] : null))); });
  def('List.First', 1, 2, (l, d) => { l = lst(l); return l.length ? l[0] : (d === undefined ? null : d); });
  def('List.Last', 1, 2, (l, d) => { l = lst(l); return l.length ? l[l.length - 1] : (d === undefined ? null : d); });
  const listN = (l, n, end) => { l = lst(l); n = force(n); if (n instanceof MFunc) { let k = 0; const seq = end ? l.slice().reverse() : l; for (const x of seq) { if (invoke(n, x) === true) k++; else break; } n = k; } return n; };
  def('List.FirstN', 2, 2, (l, n) => lst(l).slice(0, listN(l, n)));
  def('List.LastN', 2, 2, (l, n) => { const k = listN(l, n, true); return k ? lst(l).slice(-k) : []; });
  def('List.Skip', 1, 2, (l, n) => lst(l).slice(isNull(force(n)) ? 1 : listN(l, n)));
  def('List.RemoveFirstN', 1, 2, (l, n) => L['List.Skip'].call([l, n]));
  def('List.RemoveLastN', 1, 2, (l, n) => { l = lst(l); const k = isNull(force(n)) ? 1 : listN(l, n, true); return l.slice(0, Math.max(0, l.length - k)); });
  def('List.Range', 2, 3, (l, off, cnt) => { off = num(off); cnt = force(cnt); return lst(l).slice(off, isNull(cnt) ? undefined : off + cnt); });
  def('List.Contains', 2, 3, (l, v, c) => { const e = eqWith(isIC(c)); return lst(l).some(x => e(x, v)); });
  def('List.ContainsAny', 2, 3, (l, vs, c) => { const e = eqWith(isIC(c)); const a = lst(l); return lst(vs).some(v => a.some(x => e(x, v))); });
  def('List.ContainsAll', 2, 3, (l, vs, c) => { const e = eqWith(isIC(c)); const a = lst(l); return lst(vs).every(v => a.some(x => e(x, v))); });
  def('List.PositionOf', 2, 4, (l, v, occ, c) => { const e = eqWith(isIC(c)); l = lst(l); occ = force(occ); const ps = l.map((x, i) => (e(x, v) ? i : -1)).filter(i => i >= 0); if (occ === 2) return ps; if (occ === 1) return ps.length ? ps[ps.length - 1] : -1; return ps.length ? ps[0] : -1; });
  def('List.Positions', 1, 1, l => lst(l).map((_, i) => i));
  def('List.Numbers', 2, 3, (s, c, inc) => { s = num(s); c = num(c); const d = isNull(force(inc)) ? 1 : num(inc); return Array.from({ length: c }, (_, i) => s + i * d); });
  def('List.Dates', 3, 3, (s, c, step) => { s = force(s); c = num(c); step = force(step); return Array.from({ length: c }, (_, i) => M.addDur(s, step.ms * i)); });
  def('List.DateTimes', 3, 3, (s, c, step) => L['List.Dates'].call([s, c, step]));
  def('List.Reverse', 1, 1, l => lst(l).slice().reverse());
  def('List.RemoveNulls', 1, 1, l => lst(l).filter(x => !isNull(force(x))));
  def('List.RemoveItems', 2, 2, (l, r) => { r = lst(r); return lst(l).filter(x => !r.some(y => equals(x, y))); });
  def('List.RemoveMatchingItems', 2, 3, (l, r, c) => { const e = eqWith(isIC(c)); r = lst(r); return lst(l).filter(x => !r.some(y => e(x, y))); });
  def('List.ReplaceValue', 4, 4, (l, o, n, rp) => { rp = fnc(rp); return lst(l).map(x => invoke(rp, x, o, n)); });
  def('List.Union', 1, 2, ls => { const out = []; lst(ls).forEach(l => { const cnt = new Map(); lst(l).forEach(x => { const k = keyOf([x]); cnt.set(k, (cnt.get(k) || 0) + 1); const have = out.filter(y => keyOf([y]) === k).length; if (have < cnt.get(k)) out.push(x); }); }); return out; });
  def('List.Intersect', 1, 2, ls => { ls = lst(ls).map(lst); if (!ls.length) return []; return ls[0].filter((x, i, a) => a.findIndex(y => equals(x, y)) === i && ls.every(l => l.some(y => equals(x, y)))); });
  def('List.Difference', 2, 3, (a, b, c) => { const e = eqWith(isIC(c)); const rest = lst(b).slice(); return lst(a).filter(x => { const i = rest.findIndex(y => e(x, y)); if (i >= 0) { rest.splice(i, 1); return false; } return true; }); });
  def('List.IsEmpty', 1, 1, l => lst(l).length === 0);
  def('List.Buffer', 1, 1, l => lst(l));
  def('List.MatchesAll', 2, 2, (l, f) => { f = fnc(f); return lst(l).every(x => invoke(f, x) === true); });
  def('List.MatchesAny', 2, 2, (l, f) => { f = fnc(f); return lst(l).some(x => invoke(f, x) === true); });
  def('List.AllTrue', 1, 1, l => lst(l).every(x => force(x) === true));
  def('List.AnyTrue', 1, 1, l => lst(l).some(x => force(x) === true));
  def('List.Split', 2, 2, (l, n) => { l = lst(l); n = num(n); const out = []; for (let i = 0; i < l.length; i += n) out.push(l.slice(i, i + n)); return out; });
  def('List.Single', 1, 1, l => { l = lst(l); if (l.length !== 1) throw err(l.length ? 'There are too many elements in the enumeration to complete the operation.' : "There weren't enough elements in the enumeration to complete the operation."); return l[0]; });
  def('List.SingleOrDefault', 1, 2, (l, d) => { l = lst(l); if (l.length > 1) throw err('There are too many elements in the enumeration to complete the operation.'); return l.length ? l[0] : (d === undefined ? null : d); });
  def('List.Repeat', 2, 2, (l, n) => { l = lst(l); let out = []; for (let i = 0; i < num(n); i++) out = out.concat(l); return out; });
  def('List.Alternate', 2, 4, (l, c, r, o) => { l = lst(l); c = num(c); r = isNull(force(r)) ? 1 : num(r); o = isNull(force(o)) ? 0 : num(o); return l.filter((_, i) => { if (i < o) return true; const k = (i - o) % (c + r); return k >= c; }); });
  def('List.InsertRange', 3, 3, (l, i, v) => { const out = lst(l).slice(); out.splice(num(i), 0, ...lst(v)); return out; });
  def('List.RemoveRange', 2, 3, (l, i, c) => { const out = lst(l).slice(); out.splice(num(i), isNull(force(c)) ? 1 : num(c)); return out; });

  def('Text.Upper', 1, 2, s => { s = txt(s); return s === null ? null : s.toUpperCase(); });
  def('Text.Lower', 1, 2, s => { s = txt(s); return s === null ? null : s.toLowerCase(); });
  def('Text.Proper', 1, 2, s => { s = txt(s); return s === null ? null : s.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); });
  const trimChars = c => { c = force(c); if (isNull(c)) return null; return Array.isArray(c) ? c.map(force) : [c]; };
  const trimWith = (s, cs, start, end) => { if (!cs) { if (start && end) return s.replace(/^\s+|\s+$/g, ''); if (start) return s.replace(/^\s+/, ''); return s.replace(/\s+$/, ''); } let a = 0, b = s.length; if (start) while (a < b && cs.includes(s[a])) a++; if (end) while (b > a && cs.includes(s[b - 1])) b--; return s.slice(a, b); };
  def('Text.Trim', 1, 2, (s, c) => { s = txt(s); return s === null ? null : trimWith(s, trimChars(c), true, true); });
  def('Text.TrimStart', 1, 2, (s, c) => { s = txt(s); return s === null ? null : trimWith(s, trimChars(c), true, false); });
  def('Text.TrimEnd', 1, 2, (s, c) => { s = txt(s); return s === null ? null : trimWith(s, trimChars(c), false, true); });
  def('Text.Clean', 1, 1, s => { s = txt(s); return s === null ? null : s.replace(/[\x00-\x1F\x7F]/g, ''); });
  def('Text.Length', 1, 1, s => { s = txt(s); return s === null ? null : s.length; });
  def('Text.Start', 2, 2, (s, n) => { s = txt(s); return s === null ? null : s.slice(0, num(n)); });
  def('Text.End', 2, 2, (s, n) => { s = txt(s); return s === null ? null : (num(n) ? s.slice(-num(n)) : ''); });
  def('Text.Middle', 2, 3, (s, a, c) => { s = txt(s); if (s === null) return null; a = num(a); c = force(c); return s.substr(a, isNull(c) ? undefined : c); });
  def('Text.Range', 2, 3, (s, a, c) => { s = txt(s); if (s === null) return null; a = num(a); c = force(c); if (a > s.length || (!isNull(c) && a + c > s.length)) throw err('The offset is out of range.', s); return s.substr(a, isNull(c) ? undefined : c); });
  const icTxt = (s, c) => (isIC(c) ? s.toLowerCase() : s);
  def('Text.Contains', 2, 3, (s, sub, c) => { s = txt(s); if (s === null) return null; return icTxt(s, c).includes(icTxt(txt(sub), c)); });
  def('Text.StartsWith', 2, 3, (s, sub, c) => { s = txt(s); if (s === null) return null; return icTxt(s, c).startsWith(icTxt(txt(sub), c)); });
  def('Text.EndsWith', 2, 3, (s, sub, c) => { s = txt(s); if (s === null) return null; return icTxt(s, c).endsWith(icTxt(txt(sub), c)); });
  def('Text.PositionOf', 2, 4, (s, sub, occ, c) => { s = icTxt(txt(s), c); sub = icTxt(txt(sub), c); occ = force(occ); const ps = []; let i = s.indexOf(sub); while (i >= 0 && sub.length) { ps.push(i); i = s.indexOf(sub, i + sub.length); } if (occ === 2) return ps; if (occ === 1) return ps.length ? ps[ps.length - 1] : -1; return ps.length ? ps[0] : -1; });
  def('Text.PositionOfAny', 2, 3, (s, cs, occ) => { s = txt(s); cs = lst(cs).map(force); occ = force(occ); const ps = []; for (let i = 0; i < s.length; i++) if (cs.includes(s[i])) ps.push(i); if (occ === 2) return ps; if (occ === 1) return ps.length ? ps[ps.length - 1] : -1; return ps.length ? ps[0] : -1; });
  def('Text.Replace', 3, 3, (s, a, b) => { s = txt(s); if (s === null) return null; a = txt(a); return a ? s.split(a).join(txt(b)) : s; });
  def('Text.Remove', 2, 2, (s, cs) => { s = txt(s); if (s === null) return null; cs = force(cs); const set = Array.isArray(cs) ? cs.map(force) : [cs]; const rx = set.flatMap(x => (x.length === 1 ? [x] : expandRange(x))); return [...s].filter(ch => !rx.includes(ch)).join(''); });
  def('Text.Select', 2, 2, (s, cs) => { s = txt(s); if (s === null) return null; cs = force(cs); const set = Array.isArray(cs) ? cs.map(force) : [cs]; const rx = set.flatMap(x => (x.length === 1 ? [x] : expandRange(x))); return [...s].filter(ch => rx.includes(ch)).join(''); });
  function expandRange(x) { return [x]; }
  def('Text.Split', 2, 2, (s, sep) => { s = txt(s); if (s === null) return null; return s.split(txt(sep)); });
  def('Text.SplitAny', 2, 2, (s, seps) => { s = txt(s); const cs = [...txt(seps)]; const out = []; let cur = ''; for (const ch of s) { if (cs.includes(ch)) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; });
  def('Text.Combine', 1, 2, (l, sep) => lst(l).map(force).filter(x => !isNull(x)).map(x => (typeof x === 'string' ? x : textFrom(x))).join(isNull(force(sep)) ? '' : txt(sep)));
  def('Text.PadStart', 2, 3, (s, n, c) => { s = txt(s); if (s === null) return null; return s.padStart(num(n), isNull(force(c)) ? ' ' : txt(c)); });
  def('Text.PadEnd', 2, 3, (s, n, c) => { s = txt(s); if (s === null) return null; return s.padEnd(num(n), isNull(force(c)) ? ' ' : txt(c)); });
  def('Text.From', 1, 2, v => textFrom(v));
  def('Text.Format', 2, 3, (f, args) => { f = txt(f); args = force(args); return f.replace(/#\{(\d+)\}|#\[([^\]]+)\]/g, (m, i, n) => { const v = i !== undefined ? args[+i] : args.get(n); return isNull(force(v)) ? '' : textFrom(v); }); });
  const delimIndex = (idx, s, d, fromEndDefault) => {
    idx = force(idx);
    let n = 0, fromEnd = false;
    if (Array.isArray(idx)) { n = force(idx[0]); fromEnd = force(idx[1]) === 1; } else if (!isNull(idx)) n = idx;
    const ps = []; let i = s.indexOf(d); while (i >= 0) { ps.push(i); i = s.indexOf(d, i + d.length); }
    const k = fromEnd ? ps.length - 1 - n : n;
    return k >= 0 && k < ps.length ? ps[k] : -1;
  };
  def('Text.BeforeDelimiter', 2, 3, (s, d, i) => { s = txt(s); if (s === null) return null; d = txt(d); const p = delimIndex(i, s, d); return p < 0 ? s : s.slice(0, p); });
  def('Text.AfterDelimiter', 2, 3, (s, d, i) => { s = txt(s); if (s === null) return null; d = txt(d); const p = delimIndex(i, s, d); return p < 0 ? '' : s.slice(p + d.length); });
  def('Text.BetweenDelimiters', 3, 5, (s, a, b, ia, ib) => { s = txt(s); if (s === null) return null; a = txt(a); b = txt(b); const p = delimIndex(ia, s, a); if (p < 0) return ''; const rest = s.slice(p + a.length); const q = delimIndex(ib, rest, b); return q < 0 ? rest : rest.slice(0, q); });
  def('Text.Insert', 3, 3, (s, o, v) => { s = txt(s); o = num(o); return s.slice(0, o) + txt(v) + s.slice(o); });
  def('Text.Repeat', 2, 2, (s, n) => { s = txt(s); return s === null ? null : s.repeat(num(n)); });
  def('Text.Reverse', 1, 1, s => { s = txt(s); return s === null ? null : [...s].reverse().join(''); });
  def('Text.ToList', 1, 1, s => [...txt(s)]);
  def('Text.NewGuid', 0, 0, () => crypto.randomUUID());
  def('Text.ToBinary', 1, 3, s => { s = txt(s); return s === null ? null : new MBinary(new TextEncoder().encode(s)); });
  def('Text.FromBinary', 1, 2, (b, e) => (isNull(force(b)) ? null : decodeBinary(b, force(e))));
  def('Character.FromNumber', 1, 1, n => (isNull(force(n)) ? null : String.fromCodePoint(num(n))));
  def('Character.ToNumber', 1, 1, s => (isNull(force(s)) ? null : txt(s).codePointAt(0)));

  def('Number.From', 1, 2, v => numberFrom(v));
  def('Number.FromText', 1, 2, s => { s = txt(s); return s === null ? null : parseNumberText(s); });
  def('Number.ToText', 1, 3, (n, f) => fmtNumber(num(n), isNull(force(f)) ? null : txt(f)));
  def('Number.Round', 1, 3, (n, d, m) => roundMode(num(n), isNull(force(d)) ? 0 : num(d), isNull(force(m)) ? 4 : num(m)));
  def('Number.RoundUp', 1, 2, (n, d) => roundMode(num(n), isNull(force(d)) ? 0 : num(d), 0));
  def('Number.RoundDown', 1, 2, (n, d) => roundMode(num(n), isNull(force(d)) ? 0 : num(d), 1));
  def('Number.RoundAwayFromZero', 1, 2, (n, d) => roundMode(num(n), isNull(force(d)) ? 0 : num(d), 2));
  def('Number.RoundTowardZero', 1, 2, (n, d) => roundMode(num(n), isNull(force(d)) ? 0 : num(d), 3));
  const n1 = f => (x) => { x = num(x); return x === null ? null : f(x); };
  def('Number.Abs', 1, 1, n1(Math.abs));
  def('Number.Sqrt', 1, 1, n1(Math.sqrt));
  def('Number.Sign', 1, 1, n1(Math.sign));
  def('Number.Exp', 1, 1, n1(Math.exp));
  def('Number.Ln', 1, 1, n1(Math.log));
  def('Number.Log10', 1, 1, n1(Math.log10));
  def('Number.Log', 1, 2, (x, b) => { x = num(x); return x === null ? null : (isNull(force(b)) ? Math.log(x) : Math.log(x) / Math.log(num(b))); });
  def('Number.IsNaN', 1, 1, x => Number.isNaN(num(x)));
  def('Number.IsEven', 1, 1, x => num(x) % 2 === 0);
  def('Number.IsOdd', 1, 1, x => Math.abs(num(x) % 2) === 1);
  def('Number.Mod', 2, 3, (a, b) => { a = num(a); b = num(b); if (a === null || b === null) return null; return a % b; });
  def('Number.IntegerDivide', 2, 3, (a, b) => { a = num(a); b = num(b); if (a === null || b === null) return null; return Math.trunc(a / b); });
  def('Number.Power', 2, 2, (a, b) => { a = num(a); b = num(b); if (a === null || b === null) return null; return Math.pow(a, b); });
  def('Number.Factorial', 1, 1, n1(x => { let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; }));
  def('Number.Random', 0, 0, () => { run.flags.add('random'); run.seed = (run.seed * 16807) % 2147483647; return (run.seed - 1) / 2147483646; });
  def('Number.RandomBetween', 2, 2, (a, b) => { const r = L['Number.Random'].call([]); return num(a) + r * (num(b) - num(a)); });
  def('Int64.From', 1, 3, (v, c, m) => roundMode(numberFrom(v), 0, isNull(force(m)) ? 4 : num(m)));
  def('Int32.From', 1, 3, (v, c, m) => roundMode(numberFrom(v), 0, isNull(force(m)) ? 4 : num(m)));
  def('Decimal.From', 1, 2, v => numberFrom(v));
  def('Double.From', 1, 2, v => numberFrom(v));
  def('Currency.From', 1, 3, v => roundMode(numberFrom(v), 4, 4));
  def('Percentage.From', 1, 2, v => numberFrom(v));
  val('Number.PI', Math.PI);
  val('Number.E', Math.E);
  val('Number.Epsilon', Number.MIN_VALUE);
  val('Number.MaxValue', Number.MAX_VALUE);
  val('Number.MinValue', -Number.MAX_VALUE);
  val('Number.NaN', NaN);
  val('Number.PositiveInfinity', Infinity);
  val('Number.NegativeInfinity', -Infinity);
  val('#nan', NaN);
  val('#infinity', Infinity);

  const dt = v => { v = force(v); if (isNull(v)) return null; if (!(v instanceof MDT)) throw err('We cannot convert the value ' + display(v) + ' to type Date.', v); return v; };
  const dOnly = (f) => v => { v = dt(v); return v === null ? null : f(v); };
  const sameKind = (v, ms) => (v.kind === 'date' ? new MDT('date', dayStart(ms)) : new MDT(v.kind, ms, v.tz));
  const startOfWeek = (v, fd) => { const dow = (v.d.getUTCDay() - (fd || 0) + 7) % 7; return dayStart(v.ms) - dow * DAY; };
  def('#date', 3, 3, (y, m, d) => mkDate(num(y), num(m), num(d)));
  def('#datetime', 6, 6, (y, mo, d, h, mi, s) => new MDT('datetime', mkDate(num(y), num(mo), num(d)).ms + ((num(h) * 60 + num(mi)) * 60 + num(s)) * 1000));
  def('#datetimezone', 8, 8, (y, mo, d, h, mi, s, oh, om) => new MDT('datetimezone', mkDate(num(y), num(mo), num(d)).ms + ((num(h) * 60 + num(mi)) * 60 + num(s)) * 1000, num(oh) * 60 + num(om)));
  def('#time', 3, 3, (h, m, s) => new MDT('time', ((num(h) * 60 + num(m)) * 60 + num(s)) * 1000));
  def('#duration', 4, 4, (d, h, m, s) => new MDur((((num(d) * 24 + num(h)) * 60 + num(m)) * 60 + num(s)) * 1000));
  def('#binary', 1, 1, v => { v = force(v); if (typeof v === 'string') return new MBinary(Uint8Array.from(atob(v), c => c.charCodeAt(0))); return new MBinary(lst(v).map(force)); });
  def('Date.From', 1, 2, v => dateFrom(v, 'date'));
  def('Date.FromText', 1, 2, v => dateFrom(txt(v), 'date'));
  def('DateTime.From', 1, 2, v => dateFrom(v, 'datetime'));
  def('DateTime.FromText', 1, 2, v => dateFrom(txt(v), 'datetime'));
  def('DateTimeZone.From', 1, 2, v => dateFrom(v, 'datetimezone'));
  def('DateTimeZone.FromText', 1, 2, v => dateFrom(txt(v), 'datetimezone'));
  def('Time.From', 1, 2, v => dateFrom(v, 'time'));
  def('Time.FromText', 1, 2, v => dateFrom(txt(v), 'time'));
  def('Duration.From', 1, 1, v => durFrom(v));
  def('Duration.FromText', 1, 1, v => durFrom(txt(v)));
  const toTextOpts = (v, f, kind) => { v = dt(v); if (v === null) return null; f = force(f); if (f instanceof MRecord) f = optField(f, 'Format', null); if (isNull(f)) return toText(v); return fmtDate(v, f); };
  def('Date.ToText', 1, 3, (v, f) => toTextOpts(v, f, 'date'));
  def('DateTime.ToText', 1, 3, (v, f) => toTextOpts(v, f, 'datetime'));
  def('DateTimeZone.ToText', 1, 3, (v, f) => toTextOpts(v, f, 'datetimezone'));
  def('Time.ToText', 1, 3, (v, f) => toTextOpts(v, f, 'time'));
  def('Duration.ToText', 1, 2, v => { v = force(v); return isNull(v) ? null : toText(v); });
  def('Date.Year', 1, 1, dOnly(v => v.y));
  def('Date.Month', 1, 1, dOnly(v => v.mo));
  def('Date.Day', 1, 1, dOnly(v => v.day));
  def('Date.DayOfWeek', 1, 2, (v, fd) => { v = dt(v); if (v === null) return null; return (v.d.getUTCDay() - (force(fd) || 0) + 7) % 7; });
  def('Date.DayOfYear', 1, 1, dOnly(v => Math.floor((dayStart(v.ms) - Date.UTC(v.y, 0, 1)) / DAY) + 1));
  def('Date.DaysInMonth', 1, 1, dOnly(v => new Date(Date.UTC(v.y, v.mo, 0)).getUTCDate()));
  def('Date.IsLeapYear', 1, 1, dOnly(v => (v.y % 4 === 0 && v.y % 100 !== 0) || v.y % 400 === 0));
  def('Date.WeekOfYear', 1, 2, (v, fd) => { v = dt(v); if (v === null) return null; fd = force(fd) || 0; const jan1 = new Date(Date.UTC(v.y, 0, 1)); const off = (jan1.getUTCDay() - fd + 7) % 7; const doy = Math.floor((dayStart(v.ms) - jan1.getTime()) / DAY); return Math.floor((doy + off) / 7) + 1; });
  def('Date.WeekOfMonth', 1, 2, (v, fd) => { v = dt(v); if (v === null) return null; fd = force(fd) || 0; const f1 = new Date(Date.UTC(v.y, v.mo - 1, 1)); const off = (f1.getUTCDay() - fd + 7) % 7; return Math.floor((v.day - 1 + off) / 7) + 1; });
  def('Date.QuarterOfYear', 1, 1, dOnly(v => Math.ceil(v.mo / 3)));
  def('Date.AddDays', 2, 2, (v, n) => { v = dt(v); return v === null ? null : sameKind(v, v.ms + num(n) * DAY); });
  def('Date.AddWeeks', 2, 2, (v, n) => { v = dt(v); return v === null ? null : sameKind(v, v.ms + num(n) * 7 * DAY); });
  const addMonths = (v, n) => { const d = v.d; const y = d.getUTCFullYear(), m = d.getUTCMonth() + n; const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); const nd = new Date(d.getTime()); nd.setUTCDate(1); nd.setUTCFullYear(y, m, Math.min(d.getUTCDate(), last)); return sameKind(v, nd.getTime()); };
  def('Date.AddMonths', 2, 2, (v, n) => { v = dt(v); return v === null ? null : addMonths(v, num(n)); });
  def('Date.AddQuarters', 2, 2, (v, n) => { v = dt(v); return v === null ? null : addMonths(v, 3 * num(n)); });
  def('Date.AddYears', 2, 2, (v, n) => { v = dt(v); return v === null ? null : addMonths(v, 12 * num(n)); });
  def('Date.StartOfDay', 1, 1, dOnly(v => sameKind(v, dayStart(v.ms))));
  def('Date.EndOfDay', 1, 1, dOnly(v => sameKind(v, dayStart(v.ms) + DAY - 1)));
  def('Date.StartOfMonth', 1, 1, dOnly(v => sameKind(v, Date.UTC(v.y, v.mo - 1, 1))));
  def('Date.EndOfMonth', 1, 1, dOnly(v => sameKind(v, v.kind === 'date' ? Date.UTC(v.y, v.mo, 0) : Date.UTC(v.y, v.mo, 1) - 1)));
  def('Date.StartOfYear', 1, 1, dOnly(v => sameKind(v, Date.UTC(v.y, 0, 1))));
  def('Date.EndOfYear', 1, 1, dOnly(v => sameKind(v, v.kind === 'date' ? Date.UTC(v.y, 11, 31) : Date.UTC(v.y + 1, 0, 1) - 1)));
  def('Date.StartOfQuarter', 1, 1, dOnly(v => sameKind(v, Date.UTC(v.y, Math.floor((v.mo - 1) / 3) * 3, 1))));
  def('Date.EndOfQuarter', 1, 1, dOnly(v => sameKind(v, v.kind === 'date' ? Date.UTC(v.y, Math.floor((v.mo - 1) / 3) * 3 + 3, 0) : Date.UTC(v.y, Math.floor((v.mo - 1) / 3) * 3 + 3, 1) - 1)));
  def('Date.StartOfWeek', 1, 2, (v, fd) => { v = dt(v); return v === null ? null : sameKind(v, startOfWeek(v, force(fd))); });
  def('Date.EndOfWeek', 1, 2, (v, fd) => { v = dt(v); return v === null ? null : sameKind(v, startOfWeek(v, force(fd)) + 6 * DAY + (v.kind === 'date' ? 0 : DAY - 1)); });
  def('Date.MonthName', 1, 2, dOnly(v => MONTHS[v.mo - 1]));
  def('Date.DayOfWeekName', 1, 2, dOnly(v => DAYS[v.d.getUTCDay()]));
  def('Date.ToRecord', 1, 1, dOnly(v => MRecord.from({ Year: v.y, Month: v.mo, Day: v.day })));
  const now = () => { run.flags.add('time'); if (!run.now) run.now = Date.now() - new Date().getTimezoneOffset() * 60000; return run.now; };
  const inPrev = (unit) => (v, n) => { v = dt(v); if (v === null) return null; const t = dayStart(now()); const d = dayStart(v.ms); n = num(n); if (unit === 'd') return d < t && d >= t - n * DAY; return false; };
  def('Date.IsInPreviousNDays', 2, 2, inPrev('d'));
  def('Date.IsInNextNDays', 2, 2, (v, n) => { v = dt(v); if (v === null) return null; const t = dayStart(now()); const d = dayStart(v.ms); return d > t && d <= t + num(n) * DAY; });
  def('Date.IsInCurrentYear', 1, 1, dOnly(v => new Date(now()).getUTCFullYear() === v.y));
  def('Date.IsInCurrentMonth', 1, 1, dOnly(v => { const d = new Date(now()); return d.getUTCFullYear() === v.y && d.getUTCMonth() + 1 === v.mo; }));
  def('DateTime.Date', 1, 1, dOnly(v => new MDT('date', dayStart(v.ms))));
  def('DateTime.Time', 1, 1, dOnly(v => new MDT('time', v.ms - dayStart(v.ms))));
  def('DateTime.LocalNow', 0, 0, () => new MDT('datetime', now()));
  def('DateTime.FixedLocalNow', 0, 0, () => new MDT('datetime', now()));
  def('DateTime.IsInPreviousNDays', 2, 2, inPrev('d'));
  def('DateTime.AddZone', 2, 3, (v, h, m) => { v = dt(v); return v === null ? null : new MDT('datetimezone', v.ms, num(h) * 60 + (num(m) || 0)); });
  def('DateTimeZone.UtcNow', 0, 0, () => { run.flags.add('time'); return new MDT('datetimezone', Date.now(), 0); });
  def('DateTimeZone.LocalNow', 0, 0, () => new MDT('datetimezone', now(), -new Date().getTimezoneOffset()));
  def('DateTimeZone.FixedUtcNow', 0, 0, () => L['DateTimeZone.UtcNow'].call([]));
  def('DateTimeZone.ToLocal', 1, 1, dOnly(v => { const off = -new Date().getTimezoneOffset(); return new MDT('datetimezone', v.ms - v.tz * 60000 + off * 60000, off); }));
  def('DateTimeZone.ToUtc', 1, 1, dOnly(v => new MDT('datetimezone', v.ms - v.tz * 60000, 0)));
  def('DateTimeZone.SwitchZone', 2, 3, (v, h, m) => { v = dt(v); if (v === null) return null; const off = num(h) * 60 + (force(m) || 0); return new MDT('datetimezone', v.ms - v.tz * 60000 + off * 60000, off); });
  def('DateTimeZone.RemoveZone', 1, 1, dOnly(v => new MDT('datetime', v.ms)));
  def('DateTimeZone.ZoneHours', 1, 1, dOnly(v => Math.trunc(v.tz / 60)));
  def('DateTimeZone.ZoneMinutes', 1, 1, dOnly(v => v.tz % 60));
  def('Time.Hour', 1, 1, dOnly(v => v.h));
  def('Time.Minute', 1, 1, dOnly(v => v.mi));
  def('Time.Second', 1, 1, dOnly(v => v.s));
  def('Time.StartOfHour', 1, 1, dOnly(v => sameKind(v, Math.floor(v.ms / 3600000) * 3600000)));
  const du = f => v => { v = force(v); if (isNull(v)) return null; if (!(v instanceof MDur)) throw err('We cannot convert the value ' + display(v) + ' to type Duration.', v); return f(v.ms); };
  def('Duration.Days', 1, 1, du(ms => Math.trunc(ms / DAY)));
  def('Duration.Hours', 1, 1, du(ms => Math.trunc((ms % DAY) / 3600000)));
  def('Duration.Minutes', 1, 1, du(ms => Math.trunc((ms % 3600000) / 60000)));
  def('Duration.Seconds', 1, 1, du(ms => (ms % 60000) / 1000));
  def('Duration.TotalDays', 1, 1, du(ms => ms / DAY));
  def('Duration.TotalHours', 1, 1, du(ms => ms / 3600000));
  def('Duration.TotalMinutes', 1, 1, du(ms => ms / 60000));
  def('Duration.TotalSeconds', 1, 1, du(ms => ms / 1000));
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach((d, i) => val('Day.' + d, i));

  def('Record.Field', 2, 2, (r, f) => M.fieldOf(rec(r), force(f)));
  def('Record.FieldOrDefault', 2, 3, (r, f, d) => { r = force(r); if (isNull(r)) return d === undefined ? null : d; r = rec(r); f = force(f); return r.has(f) ? r.get(f) : (d === undefined ? null : d); });
  def('Record.FieldNames', 1, 1, r => rec(r).names.slice());
  def('Record.FieldValues', 1, 1, r => rec(r).values.slice());
  def('Record.FieldCount', 1, 1, r => rec(r).names.length);
  def('Record.HasFields', 2, 2, (r, f) => { r = rec(r); return names(f).every(n => r.has(n)); });
  def('Record.AddField', 3, 4, (r, n, v) => { r = rec(r); n = force(n); if (r.has(n)) throw err("The field '" + n + "' already exists in the record.", r); return new MRecord(r.names.concat([n]), r.values.concat([v])); });
  def('Record.RemoveFields', 2, 3, (r, f, mf) => { r = rec(r); const ns = names(f); if (!force(mf)) ns.forEach(n => { if (!r.has(n)) throw err("The field '" + n + "' of the record wasn't found.", r); }); const keep = r.names.map((n, i) => i).filter(i => !ns.includes(r.names[i])); return new MRecord(keep.map(i => r.names[i]), keep.map(i => r.values[i])); });
  def('Record.RenameFields', 2, 3, (r, spec, mf) => { r = rec(r); const ns = r.names.slice(); pairs(spec).forEach(([a, b]) => { const i = ns.indexOf(a); if (i < 0) { if (!force(mf)) throw err("The field '" + a + "' of the record wasn't found.", r); return; } ns[i] = b; }); return new MRecord(ns, r.values.slice()); });
  def('Record.SelectFields', 2, 3, (r, f, mf) => { r = rec(r); mf = force(mf); const ns = names(f).filter(n => { if (r.has(n)) return true; if (mf === 2) return true; if (mf === 1) return false; throw err("The field '" + n + "' of the record wasn't found.", r); }); return new MRecord(ns, ns.map(n => (r.has(n) ? r.get(n) : null))); });
  def('Record.ReorderFields', 2, 3, (r, f) => { r = rec(r); const ns = names(f); const slots = r.names.map((n, i) => (ns.includes(n) ? i : -1)).filter(i => i >= 0); const out = r.names.slice(); slots.forEach((s, k) => { out[s] = ns[k]; }); return new MRecord(out, out.map(n => r.get(n))); });
  def('Record.TransformFields', 2, 3, (r, spec, mf) => { r = rec(r); const vals = r.values.slice(); pairs(spec).forEach(([n, f]) => { const i = r.index(n); if (i < 0) { if (!force(mf)) throw err("The field '" + n + "' of the record wasn't found.", r); return; } vals[i] = safe(() => invoke(fnc(f), vals[i])); }); return new MRecord(r.names.slice(), vals); });
  def('Record.Combine', 1, 1, rs => lst(rs).reduce((a, r) => M.arith('&', a, rec(r)), new MRecord([], [])));
  def('Record.FromList', 2, 2, (vs, f) => { vs = lst(vs); f = force(f); const ns = f instanceof MType ? (f.fields || []).map(x => x.name) : names(f); if (ns.length !== vs.length) throw err('The number of fields and values must match.'); return new MRecord(ns, vs.slice()); });
  def('Record.ToList', 1, 1, r => rec(r).values.slice());
  def('Record.ToTable', 1, 1, r => { r = rec(r); return mkTable(['Name', 'Value'], r.names.map((n, i) => [n, r.values[i]])); });
  def('Record.FromTable', 1, 1, t => { t = tbl(t); const ni = t.colIndex('Name'), vi = t.colIndex('Value'); return new MRecord(t.rows.map(r => force(r[ni])), t.rows.map(r => r[vi])); });

  const splitterFn = (name, f) => { const fn = new MFunc(([s]) => { s = force(s); if (isNull(s)) return [null]; return f(txt(s)); }, name, 1, 1); return fn; };
  def('Splitter.SplitTextByDelimiter', 1, 3, (d, qs) => { d = txt(d); qs = force(qs); return splitterFn('Splitter', s => (qs === 1 ? splitCsv(s, d, true)[0] || [''] : s.split(d))); });
  def('Splitter.SplitTextByEachDelimiter', 1, 3, (ds, qs, rev) => { ds = lst(ds).map(txt); rev = force(rev); return splitterFn('Splitter', s => { const out = []; let rest = s; if (rev) { const parts = []; for (const d of ds) { const i = rest.lastIndexOf(d); if (i < 0) break; parts.unshift(rest.slice(i + d.length)); rest = rest.slice(0, i); } return [rest].concat(parts); } for (const d of ds) { const i = rest.indexOf(d); if (i < 0) break; out.push(rest.slice(0, i)); rest = rest.slice(i + d.length); } out.push(rest); return out; }); });
  def('Splitter.SplitTextByAnyDelimiter', 1, 3, ds => { ds = lst(ds).map(txt).sort((a, b) => b.length - a.length); return splitterFn('Splitter', s => { const out = []; let cur = ''; for (let i = 0; i < s.length;) { const d = ds.find(x => x && s.startsWith(x, i)); if (d) { out.push(cur); cur = ''; i += d.length; } else { cur += s[i]; i++; } } out.push(cur); return out; }); });
  def('Splitter.SplitTextByPositions', 1, 2, ps => { ps = lst(ps).map(num); return splitterFn('Splitter', s => ps.map((p, i) => s.slice(p, i + 1 < ps.length ? ps[i + 1] : undefined))); });
  def('Splitter.SplitTextByLengths', 1, 2, ls => { ls = lst(ls).map(num); return splitterFn('Splitter', s => { let p = 0; return ls.map(l => { const r = s.substr(p, l); p += l; return r; }); }); });
  def('Splitter.SplitTextByRepeatedLengths', 1, 2, l => { l = num(l); return splitterFn('Splitter', s => { const out = []; for (let i = 0; i < s.length; i += l) out.push(s.substr(i, l)); return out.length ? out : ['']; }); });
  def('Splitter.SplitTextByWhitespace', 0, 1, () => splitterFn('Splitter', s => s.split(/\s+/).filter(x => x !== '')));
  def('Splitter.SplitTextByCharacterTransition', 2, 2, (a, b) => {
    const test = x => { x = force(x); if (x instanceof MFunc) return c => invoke(x, c) === true; const l = lst(x).map(force); return c => l.includes(c); };
    const ta = test(a), tb = test(b);
    return splitterFn('Splitter', s => { const out = []; let cur = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && ta(s[i - 1]) && tb(s[i])) { out.push(cur); cur = ''; } cur += s[i]; } out.push(cur); return out; });
  });
  def('Combiner.CombineTextByDelimiter', 1, 2, d => { d = txt(d); return new MFunc(([l]) => lst(l).map(x => { x = force(x); return isNull(x) ? '' : textFrom(x); }).join(d), 'Combiner', 1, 1); });
  def('Combiner.CombineTextByLengths', 1, 2, ls => { ls = lst(ls).map(num); return new MFunc(([l]) => lst(l).map((x, i) => (textFrom(x) || '').padEnd(ls[i] || 0).slice(0, ls[i])).join(''), 'Combiner', 1, 1); });
  val('Comparer.Ordinal', makeComparer(false));
  val('Comparer.OrdinalIgnoreCase', makeComparer(true));
  def('Comparer.FromCulture', 0, 2, (c, ic) => makeComparer(!!force(ic)));
  def('Comparer.Equals', 3, 3, (c, a, b) => invoke(fnc(c), a, b) === 0);
  def('Replacer.ReplaceText', 3, 3, (v, o, n) => { v = force(v); if (typeof v !== 'string') return v; o = txt(o); return o ? v.split(o).join(txt(n) || '') : v; });
  def('Replacer.ReplaceValue', 3, 3, (v, o, n) => (equals(v, o) ? n : v));

  def('Value.Is', 2, 2, (v, t) => M.isType(force(v), force(t)));
  def('Value.As', 2, 2, (v, t) => { if (!M.isType(force(v), force(t))) throw err('We cannot convert the value ' + display(v) + ' to the requested type.', v); return v; });
  def('Value.Type', 1, 1, v => M.typeOf(force(v)));
  def('Value.Equals', 2, 3, (a, b) => equals(a, b));
  def('Value.NullableEquals', 2, 3, (a, b) => (isNull(force(a)) || isNull(force(b)) ? null : equals(a, b)));
  def('Value.Compare', 2, 3, (a, b) => Math.sign(compare(a, b)));
  def('Value.ReplaceType', 2, 2, (v, t) => { v = force(v); t = force(t); if (v instanceof MTable && t instanceof MType && t.cols) { const ns = t.cols.length === v.cols.length ? t.cols : v.cols; return mkTable(ns.slice(), v.rows, t.colTypes ? t.colTypes.slice() : v.types); } return v; });
  def('Value.Metadata', 1, 1, () => new MRecord([], []));
  def('Value.RemoveMetadata', 1, 2, v => v);
  def('Value.ReplaceMetadata', 2, 2, v => v);
  def('Value.FromText', 1, 2, s => { s = txt(s); if (s === null) return null; const t = s.trim(); if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'; try { return parseNumberText(t); } catch (e) {} try { return parseDateText(t, /\d:\d/.test(t) ? 'datetime' : 'date'); } catch (e) {} return s; });
  def('Value.NativeQuery', 0, 99, () => { throw err('Value.NativeQuery is not available offline.', null, 'Quoin.Unsupported'); });
  def('Logical.From', 1, 2, v => logicalFrom(v));
  def('Logical.FromText', 1, 1, v => logicalFrom(txt(v)));
  def('Logical.ToText', 1, 1, v => { v = force(v); return isNull(v) ? null : (v ? 'true' : 'false'); });
  def('Type.Is', 2, 2, (a, b) => { a = force(a); b = force(b); return b.kind === 'any' || (a.kind === b.kind && (!a.nullable || !!b.nullable)); });
  def('Type.ListItem', 1, 1, t => force(t).item || T.any);
  def('Type.TableSchema', 1, 1, t => { t = force(t); return mkTable(['Name', 'Position', 'TypeName', 'Kind'], (t.cols || []).map((c, i) => { const ty = (t.colTypes || [])[i]; return [c, i, ty ? (ty.facet || cap(ty.kind) + '.Type') : 'Any.Type', ty ? ty.kind : 'any']; })); });
  def('Type.NonNullable', 1, 1, t => { t = force(t); return new MType(t.kind, Object.assign({}, t, { nullable: false })); });
  def('Type.IsNullable', 1, 1, t => !!force(t).nullable);
  def('Type.ForRecord', 2, 2, (fs, open) => { fs = rec(fs); return new MType('record', { fields: fs.names.map((n, i) => ({ name: n, type: force(force(fs.values[i]).get('Type')) })), open: force(open) }); });
  def('Type.RecordFields', 1, 1, t => { t = force(t); const fs = t.fields || []; return new MRecord(fs.map(f => f.name), fs.map(f => MRecord.from({ Type: f.type, Optional: !!f.optional }))); });
  def('Error.Record', 1, 3, (r, m, d) => MRecord.from({ Reason: force(r), Message: m === undefined ? null : force(m), Detail: d === undefined ? null : force(d) }));
  def('Function.Invoke', 2, 2, (f, a) => call(fnc(f), lst(a)));
  def('Function.InvokeAfter', 2, 2, f => invoke(fnc(f)));
  def('Diagnostics.Trace', 3, 4, (lvl, msg, v, delayed) => (force(delayed) ? invoke(fnc(v)) : v));
  def('Expression.Evaluate', 1, 2, (s, env) => { s = txt(s); env = force(env); const vars = new Map(); if (env instanceof MRecord) env.names.forEach((n, i) => { const x = env.values[i]; vars.set(n, { get: () => force(x) }); }); return M.ev(M.parse(s), new M.Env(null, vars), { queries: new Map(), ops: 0 }); });
  def('Expression.Constant', 1, 1, v => { v = force(v); if (typeof v === 'string') return '"' + v.replace(/"/g, '""') + '"'; return toText(v); });
  def('Expression.Identifier', 1, 1, s => M.quoteName(txt(s)));

  def('Binary.Buffer', 1, 1, b => force(b));
  def('Binary.FromText', 1, 2, (s, e) => { s = txt(s); if (s === null) return null; if (force(e) === 1) return new MBinary(Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16))); return new MBinary(Uint8Array.from(atob(s), c => c.charCodeAt(0))); });
  def('Binary.ToText', 1, 2, (b, e) => { b = force(b); if (isNull(b)) return null; if (force(e) === 1) return [...b.bytes].map(x => x.toString(16).padStart(2, '0')).join(''); let s = ''; b.bytes.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); });
  def('Binary.Length', 1, 1, b => force(b).bytes.length);
  def('Binary.FromList', 1, 1, l => new MBinary(lst(l).map(force)));
  def('Binary.ToList', 1, 1, b => [...force(b).bytes]);
  def('Lines.FromBinary', 1, 4, (b, qs, inc, enc) => decodeBinary(b, force(enc)).split(/\r\n|\n|\r/).filter((l, i, a) => !(i === a.length - 1 && l === '')));
  def('Lines.FromText', 1, 3, s => txt(s).split(/\r\n|\n|\r/));
  def('Lines.ToText', 1, 2, (l, sep) => lst(l).map(force).join(isNull(force(sep)) ? '\r\n' : txt(sep)) + (isNull(force(sep)) ? '\r\n' : txt(sep)));
  def('Csv.Document', 1, 5, (src, cols, delim, extra, enc) => {
    const opts = optRec(cols);
    let d = ',', ncols = null, colNames = null, qs = 0, e = 65001;
    if (opts) { d = optField(opts, 'Delimiter', ','); const c = optField(opts, 'Columns', null); if (typeof c === 'number') ncols = c; else if (Array.isArray(c)) colNames = c.map(force); e = optField(opts, 'Encoding', 65001); qs = optField(opts, 'QuoteStyle', 0); }
    else { cols = force(cols); if (typeof cols === 'number') ncols = cols; else if (Array.isArray(cols)) colNames = cols.map(force); if (!isNull(force(delim))) d = force(delim); if (!isNull(force(enc))) e = force(enc); }
    const text = decodeBinary(src, e);
    const rows = splitCsv(text, d, qs === 1);
    const w = colNames ? colNames.length : ncols || rows.reduce((a, r) => Math.max(a, r.length), 0);
    const ns = colNames || Array.from({ length: w }, (_, i) => 'Column' + (i + 1));
    return mkTable(ns, rows.map(r => ns.map((_, i) => (i < r.length ? r[i] : null))));
  });
  def('Json.Document', 1, 2, (src, enc) => { const s = decodeBinary(src, force(enc)); try { return jsonToM(JSON.parse(s)); } catch (e) { throw err('We found an error while parsing the JSON document.', s.slice(0, 80), 'DataFormat.Error'); } });
  def('Json.FromValue', 1, 2, v => new MBinary(new TextEncoder().encode(JSON.stringify(mToJson(v)))));
  const host = (name, ...a) => { const h = run.host[name]; if (!h) throw err(name + ' is not available here.', null, 'Quoin.Unsupported'); return h(...a); };
  def('Excel.CurrentWorkbook', 0, 0, () => host('currentWorkbook'));
  def('Excel.Workbook', 1, 3, (b, hdr) => host('excelWorkbook', force(b), !!force(hdr)));
  def('File.Contents', 1, 2, p => host('bind', 'File.Contents', txt(p)));
  def('Web.Contents', 1, 2, (u, o) => { let key = txt(u); o = optRec(o); if (o) { const rp = optField(o, 'RelativePath', null); if (rp) key = key.replace(/\/$/, '') + '/' + rp; const q = optField(o, 'Query', null); if (q instanceof MRecord) key += '?' + q.names.map((n, i) => n + '=' + toText(q.values[i])).join('&'); } return host('bind', 'Web.Contents', key); });
  ['Folder.Files', 'Folder.Contents', 'Web.Page', 'Web.BrowserContents', 'Xml.Tables', 'Xml.Document', 'Html.Table', 'Pdf.Tables', 'Access.Database', 'SharePoint.Files', 'SharePoint.Contents', 'SharePoint.Tables', 'OData.Feed', 'Sql.Database', 'Sql.Databases', 'Odbc.Query', 'Odbc.DataSource', 'OleDb.DataSource', 'Cube.Transform', 'R.Execute', 'Python.Execute', 'AnalysisServices.Database'].forEach(n => def(n, 0, 99, () => { throw err(n + ' is not available offline. Map it to a local file.', null, 'Quoin.Unsupported'); }));

  const tf = (kind, facet) => new MType(kind, facet ? { facet } : null);
  [['Int64', 'number'], ['Int32', 'number'], ['Int16', 'number'], ['Int8', 'number'], ['Byte', 'number'], ['Single', 'number'], ['Double', 'number'], ['Decimal', 'number'], ['Currency', 'number'], ['Percentage', 'number']].forEach(([n, k]) => val(n + '.Type', tf(k, n + '.Type')));
  [['Text', 'text'], ['Number', 'number'], ['Date', 'date'], ['DateTime', 'datetime'], ['DateTimeZone', 'datetimezone'], ['Time', 'time'], ['Duration', 'duration'], ['Logical', 'logical'], ['Any', 'any'], ['Binary', 'binary'], ['List', 'list'], ['Record', 'record'], ['Table', 'table'], ['Function', 'function'], ['Null', 'null'], ['None', 'none'], ['Type', 'type']].forEach(([n, k]) => val(n + '.Type', T[k]));
  const enums = { Order: { Ascending: 0, Descending: 1 }, JoinKind, MissingField, ExtraValues: { List: 0, Error: 1, Ignore: 2 }, QuoteStyle: { None: 0, Csv: 1 }, RoundingMode: { Up: 0, Down: 1, AwayFromZero: 2, TowardZero: 3, ToEven: 4 }, Occurrence: { First: 0, Last: 1, All: 2 }, GroupKind: { Local: 0, Global: 1 }, JoinAlgorithm: { Dynamic: 0, PairwiseHash: 1, SortMerge: 2, LeftHash: 3, RightHash: 4, LeftIndex: 5, RightIndex: 6 }, RelativePosition: { FromStart: 0, FromEnd: 1 }, TextEncoding: { Utf8: 65001, Utf16: 1200, Unicode: 1200, BigEndianUnicode: 1201, Windows: 1252, Ascii: 20127 }, BinaryEncoding: { Base64: 0, Hex: 1 }, JoinSide: { Left: 0, Right: 1 }, TraceLevel: { Critical: 1, Error: 2, Warning: 3, Information: 4, Verbose: 5 }, Precision: { Double: 0, Decimal: 1 } };
  Object.keys(enums).forEach(g => Object.keys(enums[g]).forEach(k => val(g + '.' + k, enums[g][k])));
  val('Culture.Current', 'en-US');

  function beginRun(h) { run.host = h || {}; run.now = null; run.flags = new Set(); run.seed = 1; }

  M.lib = { table: L, combineTables, beginRun, run, convert, splitCsv, fromSerial, mToJson, fmtNumber };
})();
