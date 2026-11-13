const ASCII = /^[\x00-\x7f]*$/;
const MARKS = /\p{M}/gu;
const SEPARATORS = new Set([' ', '_', '.', '-', '/', '\\', '#', '"', '(', ')', '[', ']', ':', ',']);
const MATCH = 16;
const CONSECUTIVE = 8;
const START = 14;
const BOUNDARY = 12;
const HUMP = 9;
const CASE = 1;
const GAP = 0.5;
const LEAD = 0.3;
const NEG = -1e9;

function prepare(text) {
  if (ASCII.test(text)) {
    const n = text.length;
    const base = new Array(n);
    const orig = new Array(n);
    const from = new Array(n);
    const to = new Array(n);
    for (let i = 0; i < n; i++) {
      base[i] = text[i].toLowerCase();
      orig[i] = text[i];
      from[i] = i;
      to[i] = i + 1;
    }
    return { base, orig, from, to };
  }
  const base = [];
  const orig = [];
  const from = [];
  const to = [];
  let at = 0;
  for (const cp of text) {
    const span = cp.length;
    const norm = cp.normalize('NFD').replace(MARKS, '').toLowerCase();
    for (const ch of norm) {
      base.push(ch);
      orig.push(cp);
      from.push(at);
      to.push(at + span);
    }
    at += span;
  }
  return { base, orig, from, to };
}

function isSubsequence(q, t) {
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) if (t[i] === q[j]) j++;
  return j === q.length;
}

function bonusAt(t, i) {
  if (i === 0) return START;
  const prev = t.orig[i - 1];
  const cur = t.orig[i];
  if (SEPARATORS.has(prev)) return BOUNDARY;
  const lower = prev !== prev.toUpperCase() && prev === prev.toLowerCase();
  const upper = cur !== cur.toLowerCase() && cur === cur.toUpperCase();
  if (lower && upper) return HUMP;
  return 0;
}

export function match(query, text) {
  if (!query) return { score: 0, ranges: [] };
  const q = prepare(query);
  const t = prepare(text);
  const m = q.base.length;
  const n = t.base.length;
  if (m === 0) return { score: 0, ranges: [] };
  if (m > n || !isSubsequence(q.base, t.base)) return null;
  const M = new Float64Array(m * n).fill(NEG);
  const G = new Float64Array(m * n).fill(NEG);
  const GA = new Int32Array(m * n).fill(-1);
  const FROM = new Int32Array(m * n).fill(-1);
  for (let j = 0; j < m; j++) {
    for (let i = j; i < n; i++) {
      const k = j * n + i;
      if (t.base[i] === q.base[j]) {
        const own = MATCH + bonusAt(t, i) + (t.orig[i] === q.orig[j] ? CASE : 0);
        if (j === 0) {
          M[k] = own - LEAD * i;
          FROM[k] = -1;
        } else if (i > 0) {
          const pk = (j - 1) * n + (i - 1);
          const viaRun = M[pk] > NEG ? M[pk] + CONSECUTIVE : NEG;
          const viaGap = G[pk];
          if (viaRun >= viaGap && viaRun > NEG) {
            M[k] = own + viaRun;
            FROM[k] = i - 1;
          } else if (viaGap > NEG) {
            M[k] = own + viaGap;
            FROM[k] = GA[pk];
          }
        }
      }
      const left = i > 0 && G[k - 1] > NEG ? G[k - 1] - GAP : NEG;
      if (M[k] >= left) {
        G[k] = M[k];
        GA[k] = i;
      } else {
        G[k] = left;
        GA[k] = i > 0 ? GA[k - 1] : -1;
      }
    }
  }
  let best = NEG;
  let at = -1;
  for (let i = m - 1; i < n; i++) {
    const v = M[(m - 1) * n + i];
    if (v > best) {
      best = v;
      at = i;
    }
  }
  if (at < 0) return null;
  const positions = new Array(m);
  let i = at;
  for (let j = m - 1; j >= 0; j--) {
    positions[j] = i;
    i = FROM[j * n + i];
  }
  const ranges = [];
  for (const p of positions) {
    const s = t.from[p];
    const e = t.to[p];
    const last = ranges[ranges.length - 1];
    if (last && last[1] >= s) last[1] = Math.max(last[1], e);
    else ranges.push([s, e]);
  }
  return { score: best, ranges };
}

export function rank(query, items, key = (x) => x, limit = Infinity) {
  const out = [];
  if (!query) {
    items.forEach((item, index) => {
      const text = key(item);
      if (typeof text === 'string') out.push({ item, index, score: 0, ranges: [], length: text.length });
    });
    return out.length > limit ? out.slice(0, limit) : out;
  }
  items.forEach((item, index) => {
    const text = key(item);
    if (typeof text !== 'string') return;
    const hit = match(query, text);
    if (hit) out.push({ item, index, score: hit.score, ranges: hit.ranges, length: text.length });
  });
  out.sort((a, b) => b.score - a.score || a.length - b.length || a.index - b.index);
  return out.length > limit ? out.slice(0, limit) : out;
}
