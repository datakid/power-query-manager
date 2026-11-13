export const STATUSES = ['never', 'queued', 'running', 'ok', 'error', 'stopped', 'stale', 'cancelled', 'skipped'];

export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function fingerprints(index, { textOf, normalize = (t) => t, culture = '', bindingKeysOf = () => [] }) {
  const out = new Map();
  const visiting = new Set();
  const compute = (name) => {
    if (out.has(name)) return out.get(name);
    if (visiting.has(name)) return `cycle:${name}`;
    visiting.add(name);
    const ups = [...(index.refs.get(name) || [])].sort();
    const parts = [normalize(textOf(name) || ''), ups.map((u) => `${u}=${compute(u)}`).join('|'), [...bindingKeysOf(name)].sort().join('|'), culture, index.dynamic.has(name) ? [...index.members.map((m) => m.name)].sort().join(',') : ''];
    visiting.delete(name);
    const fp = fnv1a(parts.join('\u0001'));
    out.set(name, fp);
    return fp;
  };
  for (const m of index.members) compute(m.name);
  return out;
}

export class StatusBook {
  constructor() {
    this.records = new Map();
    this.history = new Map();
  }

  record(name) {
    let r = this.records.get(name);
    if (!r) {
      r = { status: 'never', fingerprint: null, okFingerprint: null, rows: null, durationMs: null, resultId: null, compare: null, bindingKeys: [] };
      this.records.set(name, r);
    }
    return r;
  }

  queue(names) {
    for (const n of names) this.record(n).status = 'queued';
  }

  start(name) {
    this.record(name).status = 'running';
  }

  finish(name, { status, fingerprint = null, rows = null, durationMs = null, resultId = null, compare = null, bindingKeys = [] }) {
    const r = this.record(name);
    r.status = status;
    r.fingerprint = fingerprint;
    r.rows = rows;
    r.durationMs = durationMs;
    r.resultId = resultId;
    r.compare = compare;
    r.bindingKeys = bindingKeys;
    if (status === 'ok') r.okFingerprint = fingerprint;
    const list = this.history.get(name) || [];
    list.unshift({ fingerprint, status, rows, durationMs, resultId });
    this.history.set(name, list.slice(0, 10));
  }

  cancelPending() {
    for (const r of this.records.values()) if (r.status === 'queued' || r.status === 'running') r.status = 'cancelled';
  }

  statusOf(name, fps, isFunction = false) {
    if (isFunction) return 'skipped';
    const r = this.records.get(name);
    if (!r) return 'never';
    if (r.status === 'ok' && fps && fps.get(name) !== r.okFingerprint) return 'stale';
    return r.status;
  }

  statuses(index, fps) {
    const out = new Map();
    for (const m of index.members) out.set(m.name, this.statusOf(m.name, fps, m.isFunction));
    return out;
  }

  counts(index, fps) {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const s of this.statuses(index, fps).values()) c[s]++;
    return c;
  }

  previous(name) {
    const list = this.history.get(name) || [];
    return list.length > 1 ? list[1] : null;
  }

  rowDelta(name) {
    const list = this.history.get(name) || [];
    if (list.length < 2 || list[0].status !== 'ok' || list[1].status !== 'ok' || list[0].rows === null || list[1].rows === null) return null;
    return list[0].rows - list[1].rows;
  }
}
