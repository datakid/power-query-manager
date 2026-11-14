import { indexSection } from '../core/wb/deps.js';
import { planRun } from '../core/wb/run-plan.js';
import { StatusBook, fingerprints } from '../core/wb/status.js';
import { normalizeQueryText } from '../core/pq/section.js';

const TERMINAL = new Set(['ok', 'error', 'stopped', 'skipped']);

export class Orchestrator {
  constructor({ runner, context, prepare = null }) {
    this.runner = runner;
    this.context = context;
    this.prepare = prepare;
    this.previews = new Map();
    this.book = new StatusBook();
    this.listeners = new Set();
    this.index = null;
    this.fps = new Map();
    this.sectionKey = null;
    this.batch = { names: [], rows: new Map(), running: false, mode: null, startedAt: null, finishedAt: null };
    this.refresh();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  refresh() {
    const ctx = this.context();
    if (this.sectionKey !== ctx.sectionText) {
      this.sectionKey = ctx.sectionText;
      this.index = indexSection(ctx.sectionText, { known: ctx.known || null });
    }
    this.fps = fingerprints(this.index, {
      textOf: ctx.textOf,
      normalize: normalizeQueryText,
      culture: ctx.culture || '',
      bindingKeysOf: (n) => this.book.record(n).bindingKeys || []
    });
    return this.index;
  }

  statuses() {
    this.refresh();
    return this.book.statuses(this.index, this.fps);
  }

  counts() {
    this.refresh();
    return this.book.counts(this.index, this.fps);
  }

  get running() {
    return this.batch.running;
  }

  queue() {
    return this.batch.names.map((name) => {
      const r = this.book.record(name);
      return { name, status: r.status, durationMs: r.durationMs, rows: r.rows, compare: r.compare, resultId: r.resultId };
    });
  }

  params(ctx) {
    return {
      sectionText: ctx.sectionText,
      culture: ctx.culture,
      limits: ctx.limits,
      snapshot: ctx.snapshot,
      bindings: ctx.bindings,
      useUpstream: ctx.useUpstream,
      previewRows: ctx.previewRows || 200,
      now: ctx.now,
      localOffsetMin: ctx.localOffsetMin
    };
  }

  async run(mode, options = {}) {
    if (this.batch.running) return { status: 'busy' };
    this.refresh();
    const plan = planRun(this.index, mode, { ...options, statuses: this.statuses() });
    if (plan.kind === 'none') return { status: 'nothing', plan };
    const ctx = { ...this.context(), ...(this.prepare ? await this.prepare() : {}) };
    const fps = new Map(this.fps);
    const names = plan.kind === 'steps' ? [plan.name] : plan.names;
    if (!names.length) return { status: 'nothing', plan };
    this.batch = { names, rows: new Map(), running: true, mode, startedAt: Date.now(), finishedAt: null };
    this.book.queue(names);
    this.emit({ type: 'batch-start', names, mode });
    const hooks = { onNeedBinding: (kind, key) => ctx.askBinding(kind, key) };
    let result;
    if (plan.kind === 'steps') {
      this.book.start(plan.name);
      this.emit({ type: 'status', name: plan.name, status: 'running' });
      result = await this.runner.runSteps({ ...this.params(ctx), queryName: plan.name, upTo: plan.upTo }, {
        ...hooks,
        onEvent: (m) => {
          if (m.type === 'step-result') this.emit({ type: 'step', query: plan.name, step: m });
        }
      });
      this.finishSteps(plan.name, result, fps);
    } else {
      let stopped = false;
      const handle = (m) => {
        if (m.type === 'evicted') {
          this.emit({ type: 'evicted', resultIds: m.resultIds });
          return;
        }
        if (m.type !== 'member-result') return;
        const status = TERMINAL.has(m.status) ? m.status : 'error';
        this.book.finish(m.name, { status, fingerprint: fps.get(m.name), rows: m.rowCount === undefined ? null : m.rowCount, durationMs: m.durationMs, resultId: m.resultId || null, compare: m.compare || null, bindingKeys: this.book.record(m.name).bindingKeys });
        if (status === 'ok' && m.resultId) this.previews.set(m.name, { result: m.result, resultId: m.resultId, durationMs: m.durationMs, flags: m.flags || [], compare: m.compare || null, generation: m.generation, fingerprint: fps.get(m.name) });
        else this.previews.delete(m.name);
        this.emit({ type: 'member', name: m.name, status, event: m });
        const next = names[names.indexOf(m.name) + 1];
        if (next && !stopped) {
          this.book.start(next);
          this.emit({ type: 'status', name: next, status: 'running' });
        }
        if (plan.stopAtFirstError && (status === 'error' || status === 'stopped') && !stopped) {
          stopped = true;
          this.runner.cancel();
        }
      };
      this.book.start(names[0]);
      this.emit({ type: 'status', name: names[0], status: 'running' });
      result = await this.runner.runMany({ ...this.params(ctx), names, compareToMap: ctx.compareToMap || null }, { ...hooks, onEvent: handle });
    }
    if (result.status !== 'ok') this.book.cancelPending();
    this.batch.running = false;
    this.batch.finishedAt = Date.now();
    this.emit({ type: 'batch-end', status: result.status, names });
    return { status: result.status, plan, result };
  }

  finishSteps(name, result, fps) {
    if (result.status !== 'ok') {
      this.book.finish(name, { status: result.status === 'cancelled' ? 'cancelled' : result.status === 'stopped' ? 'stopped' : 'error', fingerprint: fps.get(name) });
      this.emit({ type: 'member', name, status: this.book.record(name).status, event: result });
      return;
    }
    if (result.partial) {
      const r = this.book.record(name);
      r.status = r.okFingerprint ? 'ok' : 'never';
      this.emit({ type: 'member', name, status: r.status, event: result });
      return;
    }
    this.previews.delete(name);
    const status = result.finalStatus === 'ok' ? 'ok' : result.finalStatus === 'stopped' ? 'stopped' : 'error';
    this.book.finish(name, { status, fingerprint: fps.get(name), rows: result.finalRows === undefined ? null : result.finalRows, durationMs: result.durationMs, resultId: result.finalResultId || null });
    this.emit({ type: 'member', name, status, event: result });
  }

  cancel() {
    if (!this.batch.running) return false;
    this.runner.cancel();
    return true;
  }
}

export function previewFor(orch, name, runner) {
  const p = orch.previews.get(name);
  if (!p) return null;
  if (!runner.isCurrent(p.generation)) return null;
  if (orch.fps.get(name) !== p.fingerprint) return null;
  return p;
}
