import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('T-B-08: a worker crash resolves the run, clears the running state and the next run works', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const RealWorker = window.Worker;
    let mode = 'crash';
    window.Worker = class {
      constructor() {
        this.terminated = false;
      }

      postMessage(m) {
        setTimeout(() => {
          if (mode === 'crash') this.onerror({ message: 'boom' });
          else this.onmessage({ data: { type: 'result', id: m.id, status: 'ok' } });
        }, 10);
      }

      terminate() {
        this.terminated = true;
      }
    };
    const runner = new Runner();
    const first = await runner.run({}, { onNeedBinding: async () => null });
    const runningAfterCrash = runner.running;
    mode = 'ok';
    const second = await runner.run({}, { onNeedBinding: async () => null });
    const runningAfterSecond = runner.running;
    window.Worker = RealWorker;
    return { first: first.status, runningAfterCrash, second: second.status, runningAfterSecond };
  });
  expect(out).toEqual({ first: 'internal', runningAfterCrash: false, second: 'ok', runningAfterSecond: false });
});

test('T-B-08: a worker crash while rows are requested does not leave the request hanging', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const RealWorker = window.Worker;
    window.Worker = class {
      postMessage() {
        setTimeout(() => this.onerror({ message: 'boom' }), 10);
      }

      terminate() {}
    };
    const runner = new Runner();
    const rows = await Promise.race([runner.rows(0, 10), new Promise((r) => setTimeout(() => r('hung'), 1500))]);
    window.Worker = RealWorker;
    return Array.isArray(rows) ? 'array' : String(rows);
  });
  expect(out).toBe('array');
});

test('T-B-09: the main thread stops a run that never answers and the runner stays usable', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const RealWorker = window.Worker;
    const made = [];
    let silent = true;
    window.Worker = class {
      constructor() {
        this.terminated = false;
        made.push(this);
      }

      postMessage(m) {
        if (silent) return;
        setTimeout(() => this.onmessage({ data: { type: 'result', id: m.id, status: 'ok' } }), 5);
      }

      terminate() {
        this.terminated = true;
      }
    };
    const runner = new Runner();
    const started = performance.now();
    const first = await runner.run({ limits: { timeoutMs: 100 } }, { onNeedBinding: async () => null });
    const elapsed = performance.now() - started;
    const stillRunning = runner.running;
    silent = false;
    const second = await runner.run({ limits: { timeoutMs: 100 } }, { onNeedBinding: async () => null });
    window.Worker = RealWorker;
    return { status: first.status, code: first.code, elapsed, terminated: made[0].terminated, stillRunning, second: second.status, workers: made.length };
  });
  expect(out.status).toBe('stopped');
  expect(out.code).toBe('m.timeout');
  expect(out.elapsed).toBeGreaterThan(2000);
  expect(out.elapsed).toBeLessThan(3500);
  expect(out.terminated).toBe(true);
  expect(out.stillRunning).toBe(false);
  expect(out.second).toBe('ok');
  expect(out.workers).toBe(2);
});
