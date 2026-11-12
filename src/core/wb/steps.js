import { lex } from '../m/lexer.js';
import { parseExpressionText } from '../m/parser.js';
import { freeRefs } from './ast-walk.js';
import { quoteIdent } from './ident.js';
import { kindOfCall } from './step-kinds.js';

const NAVIGATE = new Set(['Item', 'Field', 'Project']);

function shift(tokens, base) {
  return tokens.map((t) => ({ ...t, start: t.start + base, end: t.end + base }));
}

function unwrap(node) {
  let n = node;
  while (n && n.t === 'Paren') n = n.expr;
  return n;
}

function callOf(node) {
  const n = unwrap(node);
  if (n && n.t === 'Invoke' && n.fn && n.fn.t === 'Identifier') return n.fn.name;
  return null;
}

function innermostInvoke(node) {
  let n = unwrap(node);
  while (n && NAVIGATE.has(n.t)) n = unwrap(n.target);
  return n && n.t === 'Invoke' ? n : null;
}

function classify(expr, index, hasInput) {
  const n = unwrap(expr);
  if (n && NAVIGATE.has(n.t)) {
    const inv = innermostInvoke(n);
    const call = inv && inv.fn && inv.fn.t === 'Identifier' ? inv.fn.name : null;
    if (call && !hasInput && kindOfCall(call) === 'source') return { call, kind: 'source' };
    return { call, kind: 'navigate' };
  }
  const call = callOf(n);
  let kind = kindOfCall(call);
  if (kind === 'custom' && index === 0 && !hasInput && n && n.t === 'Invoke') kind = call && /^[A-Z][A-Za-z]*\./.test(call) && !/^(Table|List|Text|Number|Record|Value|Date|DateTime|Duration|Time|Logical|Function|Splitter|Combiner|Comparer|Replacer|Error|Int|Currency|Percentage|Single|Double|Decimal|Byte|Binary)\./.test(call) ? 'source' : 'custom';
  return { call, kind };
}

function isLinear(expr, prev, refs, prevName) {
  if (!prev) return false;
  const n = unwrap(expr);
  const count = refs.filter((r) => r.name === prevName).length;
  if (count !== 1) return false;
  if (n && n.t === 'Identifier' && n.name === prevName) return true;
  if (n && n.t === 'Invoke' && n.args && n.args.length) {
    const first = unwrap(n.args[0]);
    return !!first && first.t === 'Identifier' && first.name === prevName;
  }
  return false;
}

export function stepsOf(exprText, baseOffset = 0, { members = null } = {}) {
  let ast;
  try {
    ast = parseExpressionText(exprText, baseOffset);
  } catch (e) {
    return { shape: 'invalid', steps: [], body: null, error: { message: e.message, start: e.start, end: e.end } };
  }
  let letNode = null;
  let shape = 'expression';
  let params = null;
  if (ast.t === 'Let') {
    letNode = ast;
    shape = 'let';
  } else if (ast.t === 'Function') {
    params = ast.params;
    if (ast.body && ast.body.t === 'Let') {
      letNode = ast.body;
      shape = 'function-let';
    } else shape = 'function';
  }
  if (!letNode) return { shape, steps: [], body: null, params, error: null };
  const tokens = shift(lex(exprText), baseOffset);
  const bindings = letNode.bindings;
  const names = new Set(bindings.map((b) => b.name));
  const letTok = tokens.find((t) => t.kind === 'keyword' && t.value === 'let' && t.start === letNode.start);
  const lastExprEnd = bindings[bindings.length - 1].expr.end;
  const inTok = tokens.find((t) => t.kind === 'keyword' && t.value === 'in' && t.start >= lastExprEnd && t.end <= letNode.body.start);
  const steps = [];
  const held = [];
  let anchorEnd = letTok ? letTok.end : letNode.start + 3;
  bindings.forEach((b, i) => {
    const nameTok = tokens.find((t) => t.start === b.start && (t.kind === 'ident' || t.kind === 'qident' || t.kind === 'keyword'));
    const exprEnd = b.expr.end;
    const afterExpr = tokens.filter((t) => t.start >= exprEnd && t.start < (bindings[i + 1] ? bindings[i + 1].start : inTok ? inTok.start : letNode.body.start));
    const commaIdx = afterExpr.findIndex((t) => t.kind === 'op' && t.value === ',');
    const comma = commaIdx >= 0 ? afterExpr[commaIdx] : null;
    const trivia = comma ? afterExpr.slice(commaIdx + 1) : afterExpr;
    let trail = null;
    let seenNewline = false;
    const rest = [];
    for (const t of trivia) {
      if (t.kind === 'ws') {
        if (/[\r\n\u2028\u2029\u0085]/.test(t.value)) seenNewline = true;
        if (seenNewline) rest.push(t);
        continue;
      }
      if (t.kind === 'comment' && !seenNewline) trail = t;
      else rest.push(t);
    }
    const gap = tokens.filter((t) => t.start >= anchorEnd && t.end <= (nameTok ? nameTok.start : b.start));
    let leadStart = nameTok ? nameTok.start : b.start;
    let nl = i === 0;
    for (const t of gap) {
      if (t.kind === 'ws' && /[\r\n\u2028\u2029\u0085]/.test(t.value)) nl = true;
      else if (t.kind === 'comment' && nl) {
        leadStart = t.start;
        break;
      }
    }
    const coreStart = leadStart;
    const refs = freeRefs(b.expr).filter((r) => r.kind === 'identifier' && names.has(r.name));
    const earlier = new Set(bindings.slice(0, i).map((x) => x.name));
    const later = new Set(bindings.slice(i + 1).map((x) => x.name));
    const inputs = [];
    const forward = [];
    for (const r of refs) {
      if (r.name === b.name) continue;
      if (earlier.has(r.name) && !inputs.includes(r.name)) inputs.push(r.name);
      if (later.has(r.name) && !forward.includes(r.name)) forward.push(r.name);
    }
    const queryRefs = members ? [...new Set(freeRefs(b.expr).filter((r) => !names.has(r.name) && members.has(r.name)).map((r) => r.name))] : [];
    const prev = i > 0 ? bindings[i - 1].name : null;
    const { call, kind } = classify(b.expr, i, inputs.length > 0);
    const trailStart = comma ? comma.end : exprEnd;
    const trailEnd = trail ? trail.end : trailStart;
    steps.push({
      index: i,
      name: b.name,
      quotedName: quoteIdent(b.name),
      span: { start: coreStart, end: exprEnd },
      nameSpan: { start: nameTok ? nameTok.start : b.start, end: nameTok ? nameTok.end : b.start + b.name.length },
      exprSpan: { start: b.expr.start, end: exprEnd },
      parts: { coreStart, coreEnd: exprEnd, commaStart: comma ? comma.start : null, commaEnd: comma ? comma.end : null, trailStart, trailEnd },
      inputs,
      forward,
      queries: queryRefs,
      refs: refs.filter((r) => r.name !== b.name).map((r) => ({ name: r.name, start: r.start, end: r.end })),
      selfRef: refs.some((r) => r.name === b.name),
      call,
      kind,
      linear: isLinear(b.expr, prev, refs, prev)
    });
    held.push({ expr: b.expr, refs });
    anchorEnd = comma ? comma.end : exprEnd;
    void rest;
  });
  const bodyRef = letNode.body.t === 'Identifier' && names.has(letNode.body.name) ? letNode.body.name : null;
  for (const st of steps) {
    st.consumers = steps.filter((o) => o.refs.some((r) => r.name === st.name)).map((o) => o.name);
    st.bodyUses = bodyRef === st.name;
    st.bypassed = st.index > 0 && st.linear && st.consumers.length === 0 && !st.bodyUses;
  }
  steps.forEach((st, i) => {
    let j = i - 1;
    while (j >= 0 && steps[j].bypassed) j--;
    st.prev = j >= 0 ? j : null;
    if (j >= 0 && j !== i - 1) st.linear = isLinear(held[i].expr, steps[j], held[i].refs, steps[j].name);
  });
  return {
    shape,
    params,
    steps,
    body: { span: { start: letNode.body.start, end: letNode.body.end }, ref: bodyRef },
    layout: { letStart: letNode.start, letEnd: letTok ? letTok.end : letNode.start + 3, inStart: inTok ? inTok.start : letNode.body.start, inEnd: inTok ? inTok.end : letNode.body.start },
    error: null
  };
}
