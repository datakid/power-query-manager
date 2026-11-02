import { runQuery, serializeTableRows } from '../core/m/engine.js';
import { MTable } from '../core/m/values.js';
import { tableToDelimited } from '../core/export/csv.js';
import { tableToJson, valueToJson } from '../core/export/json.js';
import { tableToXlsx } from '../core/export/xlsx.js';

let last = null;
const waiting = new Map();

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

function strip(r) {
  const { value, ...rest } = r;
  return rest;
}

async function run(m) {
  const requestBinding = (kind, key) => new Promise((resolve) => {
    waiting.set(`${m.id}:${key}`, resolve);
    post({ type: 'need-binding', id: m.id, kind, key });
  });
  try {
    const bindings = new Map((m.bindings || []).map(([k, v]) => [k, v]));
    const r = await runQuery({
      sectionText: m.sectionText,
      queryName: m.queryName,
      snapshot: m.snapshot,
      bindings,
      culture: m.culture,
      limits: m.limits,
      useUpstream: m.useUpstream,
      step: m.step,
      compareTo: m.compareTo,
      previewRows: m.previewRows || 200,
      now: m.now,
      localOffsetMin: m.localOffsetMin
    }, requestBinding);
    last = r.status === 'ok' ? { id: m.id, value: r.value, culture: m.culture } : null;
    post({ type: 'result', id: m.id, ...strip(r) });
  } catch (e) {
    post({ type: 'result', id: m.id, status: 'internal', message: String(e && e.message) });
  }
}

async function exportResult(m) {
  if (!last) {
    post({ type: 'exported', id: m.id, error: 'none' });
    return;
  }
  const v = last.value;
  const opts = m.options || {};
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
  else if (m.type === 'binding') {
    const resolve = waiting.get(`${m.id}:${m.key}`);
    if (resolve) {
      waiting.delete(`${m.id}:${m.key}`);
      resolve(m.binding);
    }
  } else if (m.type === 'rows') {
    const rows = last && last.value instanceof MTable ? serializeTableRows(last.value, m.start, m.count) : [];
    post({ type: 'rows', id: m.id, rows });
  } else if (m.type === 'export') exportResult(m);
};
