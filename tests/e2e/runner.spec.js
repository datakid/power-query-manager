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
