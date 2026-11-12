import { splitSection } from '../pq/section.js';
import { parseExpressionText } from '../m/parser.js';
import { freeRefs } from './ast-walk.js';

const DYNAMIC = new Set(['#shared', '#sections']);
const INTRINSIC = /^#/;

function parseMember(sectionText, m) {
  const text = sectionText.slice(m.exprStart, m.exprEnd);
  try {
    return { ast: parseExpressionText(text, m.exprStart, sectionText), error: null };
  } catch (e) {
    return { ast: null, error: { message: e.message, start: e.start === undefined ? m.exprStart : e.start, end: e.end === undefined ? m.exprEnd : e.end } };
  }
}

function analyse(ast, names, own, known) {
  const refs = new Set();
  const unresolved = [];
  let dynamic = false;
  for (const r of freeRefs(ast)) {
    if (DYNAMIC.has(r.name)) {
      dynamic = true;
      continue;
    }
    if (r.kind === 'identifier' && r.name === own && r.inclusive) continue;
    if (names.has(r.name)) {
      refs.add(r.name);
      continue;
    }
    if (INTRINSIC.test(r.name) || r.name.includes('.') || (known && known.has(r.name))) continue;
    unresolved.push({ ident: r.name, start: r.start, end: r.end });
  }
  return { refs, unresolved, dynamic };
}

function isFn(ast) {
  return !!ast && ast.t === 'Function';
}

function finish(members, refs, dynamic, unknown, known) {
  const usedBy = new Map(members.map((m) => [m.name, new Set()]));
  for (const [name, set] of refs) for (const r of set) if (usedBy.has(r)) usedBy.get(r).add(name);
  const { cycles, layers } = graph(members.map((m) => m.name), refs);
  return { members, refs, usedBy, layers, cycles, dynamic, unknown, known };
}

function graph(names, refs) {
  let counter = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const comp = new Map();
  const comps = [];
  const strong = (v) => {
    const frames = [{ v, it: [...(refs.get(v) || [])][Symbol.iterator]() }];
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    while (frames.length) {
      const f = frames[frames.length - 1];
      const nx = f.it.next();
      if (!nx.done) {
        const w = nx.value;
        if (!idx.has(w)) {
          idx.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          frames.push({ v: w, it: [...(refs.get(w) || [])][Symbol.iterator]() });
        } else if (onStack.has(w)) low.set(f.v, Math.min(low.get(f.v), idx.get(w)));
      } else {
        frames.pop();
        if (frames.length) {
          const p = frames[frames.length - 1].v;
          low.set(p, Math.min(low.get(p), low.get(f.v)));
        }
        if (low.get(f.v) === idx.get(f.v)) {
          const c = [];
          let w;
          do {
            w = stack.pop();
            onStack.delete(w);
            comp.set(w, comps.length);
            c.push(w);
          } while (w !== f.v);
          comps.push(c);
        }
      }
    }
  };
  for (const n of names) if (!idx.has(n)) strong(n);
  const order = new Map(names.map((n, i) => [n, i]));
  const cycles = comps
    .filter((c) => c.length > 1 || (refs.get(c[0]) && refs.get(c[0]).has(c[0])))
    .map((c) => c.slice().sort((a, b) => order.get(a) - order.get(b)))
    .sort((a, b) => order.get(a[0]) - order.get(b[0]));
  const compLayer = new Array(comps.length).fill(-1);
  const layerOf = (ci) => {
    if (compLayer[ci] >= 0) return compLayer[ci];
    let best = 0;
    for (const v of comps[ci]) for (const w of refs.get(v) || []) {
      const cj = comp.get(w);
      if (cj === undefined || cj === ci) continue;
      best = Math.max(best, layerOf(cj) + 1);
    }
    compLayer[ci] = best;
    return best;
  };
  const layers = new Map();
  for (const n of names) layers.set(n, layerOf(comp.get(n)));
  return { cycles, layers };
}

export function indexSection(sectionText, { known = null } = {}) {
  const split = splitSection(sectionText);
  const names = new Set(split.members.map((m) => m.name));
  const members = [];
  const refs = new Map();
  const dynamic = new Set();
  const unknown = new Set();
  for (const sm of split.members) {
    const { ast, error } = parseMember(sectionText, sm);
    const member = { name: sm.name, start: sm.start, end: sm.end, exprStart: sm.exprStart, exprEnd: sm.exprEnd, isFunction: isFn(ast), parseError: error, unresolved: [] };
    if (ast) {
      const a = analyse(ast, names, sm.name, known);
      refs.set(sm.name, a.refs);
      member.unresolved = a.unresolved;
      if (a.dynamic) dynamic.add(sm.name);
    } else {
      refs.set(sm.name, new Set());
      unknown.add(sm.name);
    }
    members.push(member);
  }
  const index = finish(members, refs, dynamic, unknown, known);
  index.unresolved = new Map(members.filter((m) => m.unresolved.length).map((m) => [m.name, m.unresolved]));
  return index;
}

export function updateMember(index, name, newExprText, { sectionText = null } = {}) {
  const at = index.members.findIndex((m) => m.name === name);
  if (at < 0) return index;
  const old = index.members[at];
  const delta = newExprText.length - (old.exprEnd - old.exprStart);
  const names = new Set(index.members.map((m) => m.name));
  const members = index.members.map((m, i) => {
    if (i < at) return m;
    if (i === at) return { ...m, end: m.end + delta, exprEnd: m.exprEnd + delta };
    return { ...m, start: m.start + delta, end: m.end + delta, exprStart: m.exprStart + delta, exprEnd: m.exprEnd + delta, unresolved: m.unresolved.map((u) => ({ ...u, start: u.start + delta, end: u.end + delta })), parseError: m.parseError ? { ...m.parseError, start: m.parseError.start + delta, end: m.parseError.end + delta } : null };
  });
  const refs = new Map([...index.refs].map(([k, v]) => [k, new Set(v)]));
  const dynamic = new Set(index.dynamic);
  const unknown = new Set(index.unknown);
  const target = members[at];
  let ast = null;
  let error = null;
  try {
    ast = parseExpressionText(newExprText, target.exprStart, sectionText);
  } catch (e) {
    error = { message: e.message, start: e.start === undefined ? target.exprStart : e.start, end: e.end === undefined ? target.exprEnd : e.end };
  }
  if (ast) {
    const a = analyse(ast, names, name, index.known);
    refs.set(name, a.refs);
    target.unresolved = a.unresolved;
    target.isFunction = isFn(ast);
    target.parseError = null;
    unknown.delete(name);
    if (a.dynamic) dynamic.add(name);
    else dynamic.delete(name);
  } else {
    target.parseError = error;
    unknown.add(name);
  }
  const next = finish(members, refs, dynamic, unknown, index.known);
  next.unresolved = new Map(members.filter((m) => m.unresolved.length).map((m) => [m.name, m.unresolved]));
  return next;
}

function walk(index, names, next, transitive) {
  const out = new Set();
  const queue = [...names];
  const seen = new Set(queue);
  while (queue.length) {
    const n = queue.shift();
    for (const m of next(n)) {
      if (!out.has(m)) out.add(m);
      if (transitive && !seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return out;
}

export function upstreamOf(index, names, { transitive = true } = {}) {
  const list = Array.isArray(names) ? names : [names];
  const out = walk(index, list, (n) => {
    const set = new Set(index.refs.get(n) || []);
    if (index.dynamic.has(n)) for (const m of index.members) if (m.name !== n && !index.dynamic.has(m.name)) set.add(m.name);
    return set;
  }, transitive);
  return out;
}

export function downstreamOf(index, names, { transitive = true } = {}) {
  const list = Array.isArray(names) ? names : [names];
  return walk(index, list, (n) => {
    const set = new Set(index.usedBy.get(n) || []);
    for (const d of index.dynamic) if (d !== n) set.add(d);
    return set;
  }, transitive);
}

export function topoOrder(index, names = null) {
  const order = new Map(index.members.map((m, i) => [m.name, i]));
  const pick = names ? new Set(names) : new Set(order.keys());
  const done = new Set();
  const out = [];
  const visiting = new Set();
  const visit = (n) => {
    if (done.has(n) || visiting.has(n)) return;
    visiting.add(n);
    const deps = [...(index.refs.get(n) || [])].filter((d) => pick.has(d)).sort((a, b) => order.get(a) - order.get(b));
    for (const d of deps) visit(d);
    visiting.delete(n);
    done.add(n);
    out.push(n);
  };
  for (const n of [...pick].sort((a, b) => order.get(a) - order.get(b))) visit(n);
  return out;
}
