(function (root) {
  const Q = root.Q || (root.Q = {});

  function encode(v, depth) {
    const M = root.M;
    depth = depth || 0;
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (v instanceof M.MErrCell) return { t: 'err', r: v.err.reason, m: v.err.msg };
    if (v instanceof M.MDT) return { t: 'dt', k: v.kind, ms: v.ms, tz: v.tz };
    if (v instanceof M.MDur) return { t: 'du', ms: v.ms };
    if (depth > 6) return { t: 'deep' };
    if (v instanceof M.MTable) return { t: 'tbl', cols: v.cols.slice(), types: v.types.map(typeLabel), rows: v.rows.map(r => r.map(c => encode(c, depth + 1))) };
    if (Array.isArray(v)) return { t: 'list', items: v.map(x => encode(x, depth + 1)) };
    if (v instanceof M.MRecord) return { t: 'rec', names: v.names.slice(), values: v.values.map(x => encode(x, depth + 1)) };
    if (v instanceof M.MBinary) return { t: 'bin', n: v.bytes.length };
    if (v instanceof M.MFunc) return { t: 'fn' };
    if (v instanceof M.MType) return { t: 'type', name: typeLabel(v) };
    return { t: 'other' };
  }

  function typeLabel(ty) {
    if (!ty) return 'any';
    if (ty.facet) return ty.facet;
    return ty.kind || 'any';
  }

  function decode(c) {
    const M = root.M;
    if (c === null || typeof c !== 'object') return c;
    switch (c.t) {
      case 'dt': return new M.MDT(c.k, c.ms, c.tz);
      case 'du': return new M.MDur(c.ms);
      case 'err': return new M.MErrCell(new M.MError(c.r, c.m));
      case 'tbl': return new M.MTable(c.cols, c.rows.map(r => r.map(decode)), null);
      case 'list': return c.items.map(decode);
      case 'rec': return new M.MRecord(c.names, c.values.map(decode));
      case 'bin': return new M.MBinary(new Uint8Array(0));
      default: return null;
    }
  }

  Q.codec = { encode, decode, typeLabel };
})(typeof window !== 'undefined' ? window : self);
