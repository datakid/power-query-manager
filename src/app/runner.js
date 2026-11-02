export class Runner {
  constructor() {
    this.worker = null;
    this.seq = 0;
    this.handlers = new Map();
    this.runId = null;
  }

  ensure() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../workers/m-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      const h = this.handlers.get(m.id);
      if (h) h(m);
    };
    this.worker.onerror = (ev) => {
      for (const h of this.handlers.values()) h({ type: 'result', status: 'internal', message: ev.message || 'worker error' });
      this.handlers.clear();
      this.worker = null;
    };
  }

  get running() {
    return this.runId !== null;
  }

  run(params, { onNeedBinding }) {
    this.ensure();
    const id = ++this.seq;
    this.runId = id;
    return new Promise((resolve) => {
      this.handlers.set(id, async (m) => {
        if (m.type === 'need-binding') {
          const binding = await onNeedBinding(m.kind, m.key);
          if (this.runId === id && this.worker) this.worker.postMessage({ type: 'binding', id, key: m.key, binding });
        } else if (m.type === 'result') {
          this.handlers.delete(id);
          if (this.runId === id) this.runId = null;
          resolve({ ...m, runId: id });
        }
      });
      this.worker.postMessage({ type: 'run', id, ...params });
    });
  }

  cancel() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    for (const h of this.handlers.values()) h({ type: 'result', status: 'cancelled' });
    this.handlers.clear();
    this.runId = null;
  }

  request(message) {
    this.ensure();
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.handlers.set(id, (m) => {
        this.handlers.delete(id);
        resolve(m);
      });
      this.worker.postMessage({ ...message, id });
    });
  }

  rows(start, count) {
    return this.request({ type: 'rows', start, count }).then((m) => m.rows);
  }

  export(format, options) {
    return this.request({ type: 'export', format, options });
  }
}
