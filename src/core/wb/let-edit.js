import { stepsOf } from './steps.js';
import { quoteIdent } from './ident.js';

export { quoteIdent };

const fail = (text, reason) => ({ ok: false, text, changes: [], reason });

function eolOf(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(^|[^\r])\n/g) || []).length;
  return crlf > lf ? '\r\n' : '\n';
}

function diffRange(a, b, base) {
  let s = 0;
  const max = Math.min(a.length, b.length);
  while (s < max && a[s] === b[s]) s++;
  let e = 0;
  while (e < max - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  if (s === a.length && s === b.length) return [];
  return [{ start: base + s, end: base + a.length - e, insert: b.slice(s, b.length - e) }];
}

function modelOf(text) {
  const model = stepsOf(text, 0);
  if (model.shape === 'invalid') return { error: `The query does not parse: ${model.error.message}` };
  if (model.shape !== 'let' && model.shape !== 'function-let') return { error: 'The query has no steps to edit.' };
  if (model.shape === 'function-let') return { error: 'The steps of a function are shown, not edited.' };
  for (const st of model.steps) {
    if (st.parts.commaStart !== null && /[^ \t]/.test(text.slice(st.parts.coreEnd, st.parts.commaStart))) return { error: `The comma after "${st.name}" is not on the same line as the step, which step edits do not support.` };
  }
  return { model };
}

function blocksOf(text, model) {
  return model.steps.map((st) => ({
    core: text.slice(st.parts.coreStart, st.parts.coreEnd),
    trail: text.slice(st.parts.trailStart, st.parts.trailEnd),
    step: st
  }));
}

function gluesOf(text, model) {
  const out = [];
  for (let i = 0; i < model.steps.length - 1; i++) out.push(text.slice(model.steps[i].parts.trailEnd, model.steps[i + 1].parts.coreStart));
  return out;
}

function defaultGlue(text, model) {
  const first = model.steps[0];
  const pre = text.slice(model.layout.letEnd, first.parts.coreStart);
  if (/[\r\n]/.test(pre)) return pre.slice(pre.search(/[\r\n]/)).replace(/^(\r\n|\r|\n)?[\s\S]*?([\r\n])([^\r\n]*)$/, (m, a, b, c) => `${eolOf(text)}${c}`);
  return `${eolOf(text)}  `;
}

function replaceIn(core, step, from, to) {
  const hits = step.refs.filter((r) => r.name === from).sort((a, b) => b.start - a.start);
  let out = core;
  for (const r of hits) {
    const s = r.start - step.parts.coreStart;
    const e = r.end - step.parts.coreStart;
    if (s < 0 || e > out.length) continue;
    out = out.slice(0, s) + quoteIdent(to) + out.slice(e);
  }
  return out;
}

function assemble(text, model, blocks, glues) {
  const first = model.steps[0].parts.coreStart;
  const last = model.steps[model.steps.length - 1].parts.trailEnd;
  let region = '';
  blocks.forEach((b, p) => {
    region += b.core + (p < blocks.length - 1 ? ',' : '') + b.trail;
    if (p < blocks.length - 1) region += glues[p];
  });
  return { text: text.slice(0, first) + region + text.slice(last), first, last, region };
}

function bodyEdit(text, model, name) {
  const b = model.body;
  return text.slice(0, b.span.start) + quoteIdent(name) + text.slice(b.span.end);
}

function result(orig, model, blocks, glues, bodyName) {
  let work = orig;
  const changes = [];
  if (bodyName !== undefined && bodyName !== null && model.body.ref !== null) {
    const next = bodyEdit(orig, model, bodyName);
    if (next !== orig) {
      changes.push({ start: model.body.span.start, end: model.body.span.end, insert: quoteIdent(bodyName) });
      work = next;
    }
  }
  const asm = assemble(work, model, blocks, glues);
  const origRegion = orig.slice(asm.first, model.steps[model.steps.length - 1].parts.trailEnd);
  const regionChanges = diffRange(origRegion, asm.region, asm.first);
  return { ok: true, text: asm.text, changes: [...regionChanges, ...changes].sort((a, b) => a.start - b.start) };
}

function orderOk(model, order) {
  const pos = new Map(order.map((idx, p) => [model.steps[idx].name, p]));
  for (const idx of order) {
    const st = model.steps[idx];
    for (const r of st.refs) {
      if (pos.get(r.name) >= pos.get(st.name)) return { ok: false, step: st.name, ref: r.name };
    }
  }
  return { ok: true };
}

function reorder(n, from, to) {
  const order = Array.from({ length: n }, (_, i) => i);
  order.splice(from, 1);
  order.splice(to, 0, from);
  return order;
}

export function canMove(model, from, to) {
  const n = model.steps.length;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n) return { ok: false, reason: 'That position does not exist.' };
  if (from === to) return { ok: false, reason: 'The step is already there.' };
  const step = model.steps[from];
  if (from === 0 && model.steps[0].kind === 'source') return { ok: false, reason: `"${step.name}" is the source and stays first.` };
  if (to === 0 && model.steps[0].kind === 'source') return { ok: false, reason: `Nothing can go above "${model.steps[0].name}", the source.` };
  const order = reorder(n, from, to);
  const plain = orderOk(model, order);
  if (plain.ok) return { ok: true, mode: 'plain', order };
  const newPrev = new Map(order.map((idx, p) => {
    let q = p - 1;
    while (q >= 0 && model.steps[order[q]].bypassed) q--;
    return [idx, q >= 0 ? order[q] : null];
  }));
  for (const idx of order) {
    const st = model.steps[idx];
    const was = st.prev;
    if (newPrev.get(idx) !== was && !st.linear) return { ok: false, reason: `"${st.name}" reads more than the step before it, so it cannot be rewired.` };
  }
  for (const idx of order) {
    const st = model.steps[idx];
    if (st.linear) continue;
    const p = order.indexOf(idx);
    for (const r of st.refs) {
      if (order.indexOf(model.steps.findIndex((x) => x.name === r.name)) >= p) return { ok: false, reason: `"${st.name}" reads "${r.name}", which would come after it.` };
    }
  }
  return { ok: true, mode: 'rewire', order };
}

export function moveStep(text, from, to, { rewire = false } = {}) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const can = canMove(model, from, to);
  if (!can.ok) return fail(text, can.reason);
  if (can.mode === 'rewire' && !rewire) return fail(text, `Moving "${model.steps[from].name}" there changes which step each one reads. Confirm the rewiring to continue.`);
  const blocks = blocksOf(text, model);
  const glues = gluesOf(text, model);
  const out = can.order.map((idx) => ({ ...blocks[idx] }));
  let bodyName = null;
  if (can.mode === 'rewire') {
    can.order.forEach((idx, p) => {
      const st = model.steps[idx];
      const was = st.prev;
      let q = p - 1;
      while (q >= 0 && model.steps[can.order[q]].bypassed) q--;
      const now = q >= 0 ? can.order[q] : null;
      if (now !== was && st.linear && now !== null && was !== null) out[p].core = replaceIn(out[p].core, st, model.steps[was].name, model.steps[now].name);
    });
    const oldLast = model.steps[model.steps.length - 1].name;
    const newLast = model.steps[can.order[can.order.length - 1]].name;
    if (model.body.ref === oldLast && newLast !== oldLast) bodyName = newLast;
  }
  return result(text, model, out, glues, bodyName);
}

export function insertStepAfter(text, index, name, exprText, { rewire = false } = {}) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const n = model.steps.length;
  if (!Number.isInteger(index) || index < 0 || index >= n) return fail(text, 'That position does not exist.');
  if (!name || !name.trim()) return fail(text, 'The step needs a name.');
  if (model.steps.some((s) => s.name === name)) return fail(text, `A step named "${name}" already exists.`);
  const blocks = blocksOf(text, model);
  const glues = gluesOf(text, model);
  const fresh = { core: `${quoteIdent(name)} = ${exprText}`, trail: '', step: null };
  const prev = model.steps[index];
  let bodyName = null;
  if (rewire) {
    const next = model.steps[index + 1];
    if (next) {
      if (!next.refs.some((r) => r.name === prev.name)) return fail(text, `"${next.name}" does not read "${prev.name}", so there is nothing to rewire.`);
      if (!next.linear) return fail(text, `"${next.name}" reads more than the step before it, so it cannot be rewired.`);
      blocks[index + 1].core = replaceIn(blocks[index + 1].core, next, prev.name, name);
    } else if (model.body.ref === prev.name) bodyName = name;
  }
  const glue = n > 1 ? glues[Math.min(index, n - 2)] : defaultGlue(text, model);
  blocks.splice(index + 1, 0, fresh);
  glues.splice(index, 0, glue);
  return result(text, model, blocks, glues, bodyName);
}

export function renameStep(text, index, newName) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const st = model.steps[index];
  if (!st) return fail(text, 'That step does not exist.');
  if (!newName || !newName.trim()) return fail(text, 'The step needs a name.');
  if (newName === st.name) return { ok: true, text, changes: [] };
  if (model.steps.some((s) => s.name === newName)) return fail(text, `A step named "${newName}" already exists.`);
  const edits = [{ start: st.nameSpan.start, end: st.nameSpan.end, insert: quoteIdent(newName) }];
  for (const other of model.steps) for (const r of other.refs) if (r.name === st.name) edits.push({ start: r.start, end: r.end, insert: quoteIdent(newName) });
  if (model.body.ref === st.name) edits.push({ start: model.body.span.start, end: model.body.span.end, insert: quoteIdent(newName) });
  edits.sort((a, b) => a.start - b.start);
  let out = text;
  for (const e of [...edits].reverse()) out = out.slice(0, e.start) + e.insert + out.slice(e.end);
  return { ok: true, text: out, changes: edits };
}

function consumersOf(model, st) {
  return model.steps.filter((o) => o.refs.some((r) => r.name === st.name));
}

function rewireOut(text, model, index) {
  const st = model.steps[index];
  const input = st.prev !== null ? model.steps[st.prev] : null;
  const users = consumersOf(model, st);
  const bodyUses = model.body.ref === st.name;
  if (!input && (users.length || bodyUses)) return { reason: `"${st.name}" is the source and other steps read it.` };
  const bad = users.find((u) => !u.linear || u.prev !== index);
  if (bad) return { reason: `"${bad.name}" reads "${st.name}" and cannot be rewired.` };
  if (!st.linear && (users.length || bodyUses)) return { reason: `"${st.name}" reads more than the step before it, so its readers cannot be rewired.` };
  return { input, users, bodyUses };
}

export function deleteStep(text, index) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const st = model.steps[index];
  if (!st) return fail(text, 'That step does not exist.');
  if (model.steps.length === 1) return fail(text, 'A query needs at least one step.');
  const plan = rewireOut(text, model, index);
  if (plan.reason) return fail(text, plan.reason);
  const blocks = blocksOf(text, model);
  const glues = gluesOf(text, model);
  if (plan.input) for (const u of plan.users) blocks[u.index].core = replaceIn(blocks[u.index].core, u, st.name, plan.input.name);
  blocks.splice(index, 1);
  glues.splice(index < glues.length ? index : index - 1, 1);
  return result(text, model, blocks, glues, plan.bodyUses ? plan.input.name : null);
}

export function bypassStep(text, index) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const st = model.steps[index];
  if (!st) return fail(text, 'That step does not exist.');
  if (index === 0) return fail(text, `"${st.name}" is the source and cannot be bypassed.`);
  if (!st.linear) return fail(text, `"${st.name}" reads more than the step before it, so it cannot be bypassed.`);
  const plan = rewireOut(text, model, index);
  if (plan.reason) return fail(text, plan.reason);
  if (!plan.users.length && !plan.bodyUses) return fail(text, `"${st.name}" is already bypassed.`);
  const blocks = blocksOf(text, model);
  const glues = gluesOf(text, model);
  for (const u of plan.users) blocks[u.index].core = replaceIn(blocks[u.index].core, u, st.name, plan.input.name);
  return result(text, model, blocks, glues, plan.bodyUses ? plan.input.name : null);
}

export function unbypassStep(text, index) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const st = model.steps[index];
  if (!st) return fail(text, 'That step does not exist.');
  if (!st.bypassed) return fail(text, `"${st.name}" is not bypassed.`);
  const input = model.steps[st.prev];
  const next = model.steps.slice(index + 1).find((s) => !s.bypassed);
  const blocks = blocksOf(text, model);
  const glues = gluesOf(text, model);
  if (next) {
    if (!next.linear || next.prev !== st.prev) return fail(text, `"${next.name}" does not read "${input.name}", so "${st.name}" cannot be put back.`);
    blocks[next.index].core = replaceIn(blocks[next.index].core, next, input.name, st.name);
    return result(text, model, blocks, glues, null);
  }
  if (model.body.ref === input.name) return result(text, model, blocks, glues, st.name);
  return fail(text, `The result does not read "${input.name}", so "${st.name}" cannot be put back.`);
}

function uniqueCopyName(model, name) {
  const taken = new Set(model.steps.map((s) => s.name));
  for (let i = 2; ; i++) {
    const c = `${name} (${i})`;
    if (!taken.has(c)) return c;
  }
}

export function duplicateStep(text, index) {
  const m = modelOf(text);
  if (m.error) return fail(text, m.error);
  const { model } = m;
  const st = model.steps[index];
  if (!st) return fail(text, 'That step does not exist.');
  const name = uniqueCopyName(model, st.name);
  const blocks = blocksOf(text, model);
  const glues = gluesOf(text, model);
  let body = text.slice(st.nameSpan.end, st.parts.coreEnd);
  if (st.linear) {
    const prev = model.steps[st.prev];
    for (const r of [...st.refs].filter((x) => x.name === prev.name).sort((a, b) => b.start - a.start)) {
      const s = r.start - st.nameSpan.end;
      body = body.slice(0, s) + quoteIdent(st.name) + body.slice(r.end - st.nameSpan.end);
    }
  }
  const copy = { core: `${quoteIdent(name)}${body}`, trail: '', step: null };
  const next = model.steps[index + 1];
  let bodyName = null;
  if (next && next.linear && next.refs.some((r) => r.name === st.name)) blocks[index + 1].core = replaceIn(blocks[index + 1].core, next, st.name, name);
  else if (!next && model.body.ref === st.name) bodyName = name;
  const n = model.steps.length;
  const glue = n > 1 ? glues[Math.min(index, n - 2)] : defaultGlue(text, model);
  blocks.splice(index + 1, 0, copy);
  glues.splice(index, 0, glue);
  return result(text, model, blocks, glues, bodyName);
}
