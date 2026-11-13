import { runQuery, serializeTableRows, serializeResult, evaluateSteps, evaluateMany } from '../core/m/engine.js';
import { ResultStore } from '../core/wb/result-store.js';
import { MTable } from '../core/m/values.js';
import { tableToDelimited } from '../core/export/csv.js';
import { tableToJson, valueToJson } from '../core/export/json.js';
import { tableToXlsx } from '../core/export/xlsx.js';

const store = new ResultStore();
let lastId = null;
const waiting = new Map();

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

function strip(r) {
  const { value, ...rest } = r;
  return rest;
}

function baseOptions(m) {
  return {
    sectionText: m.sectionText,
    queryName: m.queryName,
    snapshot: m.snapshot,
    bindings: new Map((m.bindings || []).map(([k, v]) => [k, v])),
    culture: m.culture,
    limits: m.limits,
    useUpstream: m.useUpstream,
    upTo: m.upTo || null,
    compareTo: m.compareTo,
    previewRows: m.previewRows || 200,
    now: m.now,
    localOffsetMin: m.localOffsetMin
  };
}

function keep(entry) {
  const r = store.add(entry);
  if (r.evicted.length) post({ type: 'evicted', resultIds: r.evicted });
  if (lastId && !store.has(lastId)) lastId = null;
  return r.id;
}

function askBinding(m) {
  return (kind, key) => new Promise((resolve) => {
    waiting.set(`${m.id}:${key}`, resolve);
    post({ type: 'need-binding', id: m.id, kind, key });
  });
}

function preview(value, opts) {
  return serializeResult(value, false, { maxRows: opts.previewRows });
}

async function run(m) {
  const requestBinding = askBinding(m);
  try {
    const r = await runQuery({ ...baseOptions(m), step: m.step }, requestBinding);
    let resultId = null;
    if (r.status === 'ok') {
      resultId = keep({ value: r.value, culture: m.culture, member: m.queryName, step: m.step || null });
      lastId = resultId;
    }
    post({ type: 'result', id: m.id, resultId, ...strip(r) });
  } catch (e) {
    post({ type: 'result', id: m.id, status: 'internal', message: String(e && e.message) });
  }
}

async function runSteps(m) {
  const requestBinding = askBinding(m);
  try {
    const opts = baseOptions(m);
    let r = null;
    for (let round = 0; round < 50; round++) {
      r = evaluateSteps(opts);
      if (r.status !== 'need-binding') break;
      const b = await requestBinding(r.kind, r.key);
      if (!b) {
        r = { status: 'error', error: { reason: 'DataSource.Error', message: `No file was provided for ${r.key}.`, detail: r.key } };
        break;
      }
      opts.bindings.set(r.key, b);
    }
    if (r.status !== 'ok') {
      post({ type: 'result', id: m.id, ...strip(r) });
      return;
    }
    const group = store.newGroup();
    const send = (st, name) => {
      const { value, ...rest } = st;
      let resultId = null;
      let result = null;
      if (st.status === 'ok') {
        resultId = keep({ value, culture: m.culture, member: m.queryName, step: name, group });
        result = preview(value, opts);
      }
      post({ type: 'step-result', id: m.id, resultId, result, ...rest, name });
      return resultId;
    };
    let finalId = null;
    let lastStepId = null;
    for (const st of r.steps) lastStepId = send(st, st.name);
    if (r.final) finalId = send({ ...r.final }, null);
    lastId = finalId || lastStepId || lastId;
    post({ type: 'done', id: m.id, status: 'ok', flags: r.flags, partial: !!r.partial, finalResultId: finalId, finalStatus: r.final ? r.final.status : null, finalRows: r.final && r.final.rowCount !== undefined ? r.final.rowCount : null, lastStepResultId: lastStepId, durationMs: r.durationMs });
  } catch (e) {
    post({ type: 'result', id: m.id, status: 'internal', message: String(e && e.message) });
  }
}

async function runMany(m) {
  try {
    const opts = baseOptions(m);
    const compare = m.compareToMap ? new Map(m.compareToMap) : null;
    if (compare) opts.compareTo = compare;
    const gen = evaluateMany(opts, m.names);
    let next = await gen.next();
    while (!next.done) {
      const ev = next.value;
      if (ev.status === 'need-binding') {
        const binding = await askBinding(m)(ev.kind, ev.key);
        next = await gen.next(binding);
        continue;
      }
      const { value, ...rest } = ev;
      let resultId = null;
      let result = null;
      if (ev.status === 'ok') {
        resultId = keep({ value, culture: m.culture, member: ev.name });
        result = preview(value, opts);
      }
      post({ type: 'member-result', id: m.id, resultId, result, ...rest });
      next = await gen.next();
    }
    post({ type: 'done', id: m.id, status: 'ok' });
  } catch (e) {
    post({ type: 'result', id: m.id, status: 'internal', message: String(e && e.message) });
  }
}

function lookup(m) {
  const id = m.resultId || lastId;
  return id ? store.get(id) : undefined;
}

async function exportResult(m) {
  const last = lookup(m);
  if (!last) {
    post({ type: 'exported', id: m.id, error: 'none' });
    return;
  }
  const v = last.value;
  const opts = m.options || {};
  last.culture = last.culture || m.culture;
  try {
    let bytes;
    let mime = 'text/plain';
    if (m.format === 'json') {
      bytes = v instanceof MTable ? tableToJson(v, last.culture) : valueToJson(v, last.culture);
      mime = 'application/json';
    } else if (!(v instanceof MTable)) {
      post({ type: 'exported', id: m.id, error: 'not-table' });
      return;
    } else if (m.format === 'xlsx') {
      bytes = await tableToXlsx(v, last.culture);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (m.format === 'tsv') {
      bytes = tableToDelimited(v, { delimiter: '\t', guard: opts.guard !== false });
      mime = 'text/tab-separated-values';
    } else {
      bytes = tableToDelimited(v, { delimiter: ',', bom: m.format === 'csvbom', guard: opts.guard !== false });
      mime = 'text/csv';
    }
    post({ type: 'exported', id: m.id, bytes, mime }, [bytes.buffer]);
  } catch (e) {
    post({ type: 'exported', id: m.id, error: String(e && e.message) });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'run') run(m);
  else if (m.type === 'run-steps') runSteps(m);
  else if (m.type === 'run-many') runMany(m);
  else if (m.type === 'pin') post({ type: 'pinned', id: m.id, ok: store.pin(m.resultId, m.pinned !== false) });
  else if (m.type === 'release') post({ type: 'released', id: m.id, ok: store.release(m.resultId) });
  else if (m.type === 'binding') {
    const resolve = waiting.get(`${m.id}:${m.key}`);
    if (resolve) {
      waiting.delete(`${m.id}:${m.key}`);
      resolve(m.binding);
    }
  } else if (m.type === 'rows') {
    const entry = lookup(m);
    const rows = entry && entry.value instanceof MTable ? serializeTableRows(entry.value, m.start, m.count) : [];
    post({ type: 'rows', id: m.id, rows, evicted: !entry });
  } else if (m.type === 'export') exportResult(m);
};
