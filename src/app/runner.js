import { DEFAULT_LIMITS } from '../core/limits.js';

const GRACE_MS = 2000;

export class Runner {
  constructor() {
    this.worker = null;
    this.seq = 0;
    this.handlers = new Map();
    this.runId = null;
    this.generation = 0;
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
      this.generation++;
      for (const h of this.handlers.values()) h({ type: 'result', status: 'internal', message: ev.message || 'worker error' });
      this.handlers.clear();
      this.worker = null;
      this.runId = null;
    };
  }

  get running() {
    return this.runId !== null;
  }

  run(params, { onNeedBinding }) {
    this.ensure();
    const id = ++this.seq;
    this.runId = id;
    const timeoutMs = (params.limits && params.limits.timeoutMs) || DEFAULT_LIMITS.timeoutMs;
    return new Promise((resolve) => {
      let timer = null;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.stop({ type: 'result', status: 'stopped', code: 'm.timeout' }), timeoutMs + GRACE_MS);
      };
      const disarm = () => clearTimeout(timer);
      this.handlers.set(id, async (m) => {
        if (m.type === 'need-binding') {
          disarm();
          const binding = await onNeedBinding(m.kind, m.key);
          if (this.runId === id && this.worker) {
            this.worker.postMessage({ type: 'binding', id, key: m.key, binding });
            arm();
          }
        } else if (m.type === 'result') {
          disarm();
          this.handlers.delete(id);
          if (this.runId === id) this.runId = null;
          resolve({ ...m, runId: id, generation: this.generation });
        }
      });
      arm();
      this.worker.postMessage({ type: 'run', id, ...params });
    });
  }

  stream(params, { onEvent = () => {}, onNeedBinding }) {
    this.ensure();
    const id = ++this.seq;
    this.runId = id;
    const timeoutMs = (params.limits && params.limits.timeoutMs) || DEFAULT_LIMITS.timeoutMs;
    const generation = this.generation;
    return new Promise((resolve) => {
      let timer = null;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.stop({ type: 'result', status: 'stopped', code: 'm.timeout' }), timeoutMs + GRACE_MS);
      };
      const finish = (m) => {
        clearTimeout(timer);
        this.handlers.delete(id);
        if (this.runId === id) this.runId = null;
        resolve({ ...m, runId: id, generation });
      };
      this.handlers.set(id, async (m) => {
        if (m.type === 'need-binding') {
          clearTimeout(timer);
          const binding = await onNeedBinding(m.kind, m.key);
          if (this.runId === id && this.worker) {
            this.worker.postMessage({ type: 'binding', id, key: m.key, binding });
            arm();
          }
        } else if (m.type === 'step-result' || m.type === 'member-result' || m.type === 'evicted') {
          if (m.type !== 'evicted') arm();
          onEvent({ ...m, generation });
        } else if (m.type === 'done' || m.type === 'result') finish(m);
      });
      arm();
      this.worker.postMessage({ ...params, id });
    });
  }

  runSteps(params, hooks) {
    return this.stream({ type: 'run-steps', ...params }, hooks);
  }

  runMany(params, hooks) {
    return this.stream({ type: 'run-many', ...params }, hooks);
  }

  pin(resultId, pinned = true) {
    return this.request({ type: 'pin', resultId, pinned }).then((m) => !!m.ok);
  }

  release(resultId) {
    return this.request({ type: 'release', resultId }).then((m) => !!m.ok);
  }

  stop(result) {
    this.generation++;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    for (const h of this.handlers.values()) h(result);
    this.handlers.clear();
    this.runId = null;
  }

  cancel() {
    this.stop({ type: 'result', status: 'cancelled' });
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

  rows(start, count, { resultId = null, generation = null } = {}) {
    if (generation !== null && generation !== this.generation) return Promise.resolve([]);
    return this.request({ type: 'rows', start, count, resultId }).then((m) => (Array.isArray(m.rows) ? m.rows : []));
  }

  rowsOf(resultId, start, count, generation) {
    if (generation !== undefined && generation !== this.generation) return Promise.resolve({ rows: [], evicted: true });
    return this.request({ type: 'rows', start, count, resultId }).then((m) => ({ rows: Array.isArray(m.rows) ? m.rows : [], evicted: !!m.evicted }));
  }

  isCurrent(generation) {
    return generation === this.generation;
  }

  export(format, options, resultId = null) {
    return this.request({ type: 'export', format, options, resultId });
  }
}
