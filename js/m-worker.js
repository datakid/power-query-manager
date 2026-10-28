self.window = self;
importScripts('m-core.js', 'm-runtime.js', 'm-lib.js', 'core/codec.js', '../vendor/xlsx.full.min.js');

const { codec } = self.Q;

function decodeSnapshot(snap) {
  const rows = (snap || []).map(s => [codec.decode(s.table), s.name]);
  return new M.MTable(['Content', 'Name'], rows);
}

function excelWorkbook(bin, useHeaders) {
  if (!(bin instanceof M.MBinary)) throw new M.MError('Expression.Error', 'Excel.Workbook needs a binary value.');
  const wb = XLSX.read(bin.bytes, { type: 'array', cellDates: true, UTC: true });
  const toCell = v => {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return new M.MDT('datetime', v.getTime());
    return v;
  };
  const rows = [];
  wb.SheetNames.forEach(name => {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const w = aoa.reduce((a, r) => Math.max(a, r.length), 0);
    let cols = Array.from({ length: w }, (_, i) => 'Column' + (i + 1));
    let data = aoa.map(r => cols.map((_, i) => toCell(r[i])));
    if (useHeaders && data.length) {
      const seen = [];
      cols = data[0].map((v, i) => { let n = v === null ? 'Column' + (i + 1) : String(v); let k = n, j = 1; while (seen.includes(k)) k = n + '_' + (j++); seen.push(k); return k; });
      data = data.slice(1);
    }
    rows.push([name, new M.MTable(cols, data), name, 'Sheet', false]);
  });
  (wb.Workbook && wb.Workbook.Names || []).forEach(n => rows.push([n.Name, new M.MTable(['Ref'], [[n.Ref]]), n.Name, 'DefinedName', false]));
  return new M.MTable(['Name', 'Data', 'Item', 'Kind', 'Hidden'], rows);
}

class NeedBinding extends Error {
  constructor(kind, key) { super('binding'); this.kind = kind; this.key = key; this.needBinding = true; }
}

self.onmessage = e => {
  const msg = e.data;
  if (msg.type !== 'run') return;
  const started = performance.now();
  const deadline = started + (msg.limits && msg.limits.timeoutMs || 30000);
  try {
    const cw = decodeSnapshot(msg.snapshot);
    M.lib.beginRun({
      currentWorkbook: () => cw,
      excelWorkbook,
      bind: (kind, key) => {
        const b = msg.bindings && msg.bindings[kind + '|' + key];
        if (!b) {
          if (msg.skipped && msg.skipped.includes(kind + '|' + key)) throw new M.MError('DataSource.Error', 'No local file was chosen for ' + key + '.', key);
          throw new NeedBinding(kind, key);
        }
        return new M.MBinary(b.bytes, b.name);
      }
    });
    const ctx = M.makeContext({
      members: msg.members,
      tick: () => { if (performance.now() > deadline) throw new M.MError('Quoin.Timeout', 'The query took longer than the time limit.'); }
    });
    const target = msg.members.find(m => m.name === msg.queryName);
    let value = M.evaluateStep(ctx, target.text, msg.step || null);
    value = M.force(value);
    if (value instanceof M.MTable && value.rows.length > (msg.limits && msg.limits.rowCap || 1000000)) throw new M.MError('Quoin.Limit', 'The result has more rows than the row cap.');
    const steps = M.steps(target.text) || [];
    self.postMessage({ type: 'result', runId: msg.runId, value: codec.encode(value), isTable: value instanceof M.MTable, steps: steps.map(s => s.name), durationMs: performance.now() - started, flags: [...M.lib.run.flags] });
  } catch (err) {
    if (err && err.needBinding) { self.postMessage({ type: 'need-binding', runId: msg.runId, kind: err.kind, key: err.key }); return; }
    const out = { type: 'error', runId: msg.runId, durationMs: performance.now() - started };
    if (err && err.isM) Object.assign(out, { reason: err.reason, message: err.msg, detail: typeof err.detail === 'string' ? err.detail : null });
    else if (err && err.isSyntax) Object.assign(out, { reason: 'Syntax', message: err.message, pos: err.pos });
    else if (err instanceof RangeError) Object.assign(out, { reason: 'Quoin.Limit', message: 'The query recursed too deeply.' });
    else Object.assign(out, { reason: 'Quoin.Internal', message: 'Something unexpected happened while running this query.', detail: String(err && err.message || err) });
    let steps = [];
    try { const msgT = msg.members.find(m => m.name === msg.queryName); steps = (M.steps(msgT.text) || []).map(s => s.name); } catch (x) {}
    out.steps = steps;
    self.postMessage(out);
  }
};
