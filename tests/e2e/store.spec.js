import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('T-WB-08: two pinned results keep paging rows after many more runs while the oldest unpinned one is evicted', async ({ page }) => {
  const problems = await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const section = (n) => `section Section1;\r\n\r\nshared Q = #table({"a"}, {{${n}}, {${n + 1}}, {${n + 2}}});`;
    const r = new Runner();
    const base = { culture: 'en-US', limits: {}, previewRows: 5, queryName: 'Q' };
    const first = await r.run({ ...base, sectionText: section(1) }, { onNeedBinding: async () => null });
    const p1 = await r.run({ ...base, sectionText: section(10) }, { onNeedBinding: async () => null });
    const p2 = await r.run({ ...base, sectionText: section(20) }, { onNeedBinding: async () => null });
    await r.pin(p1.resultId);
    await r.pin(p2.resultId);
    for (let i = 0; i < 40; i++) await r.run({ ...base, sectionText: section(100 + i) }, { onNeedBinding: async () => null });
    const a = await r.rowsOf(p1.resultId, 0, 10, r.generation);
    const b = await r.rowsOf(p2.resultId, 0, 10, r.generation);
    const gone = await r.rowsOf(first.resultId, 0, 10, r.generation);
    return { a, b, gone };
  });
  expect(out.a.evicted).toBe(false);
  expect(out.a.rows.map((x) => x[0])).toEqual([10, 11, 12]);
  expect(out.b.rows.map((x) => x[0])).toEqual([20, 21, 22]);
  expect(out.gone.evicted).toBe(true);
  expect(problems).toEqual([]);
});

test('T-WB-08: run-many streams a result per member then done, each kept in the store', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const r = new Runner();
    const events = [];
    const text = 'section Section1;\r\n\r\nshared A = #table({"x"}, {{1}, {2}});\r\n\r\nshared B = Table.AddColumn(A, "y", each [x] * 2);\r\n\r\nshared F = (n) => n;\r\n\r\nshared Bad = error "no";';
    const done = await r.runMany({ sectionText: text, names: ['A', 'B', 'F', 'Bad'], culture: 'en-US', limits: {}, previewRows: 10 }, { onEvent: (m) => events.push(m), onNeedBinding: async () => null });
    const rows = await r.rowsOf(events[1].resultId, 0, 10, r.generation);
    return { done: done.status, seq: events.map((e) => [e.name, e.status, !!e.resultId]), rows: rows.rows };
  });
  expect(out.done).toBe('ok');
  expect(out.seq).toEqual([['A', 'ok', true], ['B', 'ok', true], ['F', 'skipped', false], ['Bad', 'error', false]]);
  expect(out.rows).toEqual([[1, 2], [2, 4]]);
});

test('T-WB-08: run-steps streams every step with its own result and a final', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const r = new Runner();
    const events = [];
    const text = 'section Section1;\r\n\r\nshared Q = let S = #table({"x"}, {{1}, {2}, {3}}), F = Table.SelectRows(S, each [x] > 1), Bad = error "stop", After = Bad in F;';
    const done = await r.runSteps({ sectionText: text, queryName: 'Q', culture: 'en-US', limits: {}, previewRows: 10 }, { onEvent: (m) => events.push(m), onNeedBinding: async () => null });
    return { done: done.status, finalId: !!done.finalResultId, steps: events.map((e) => [e.name, e.status, e.rowCount === undefined ? null : e.rowCount]) };
  });
  expect(out.done).toBe('ok');
  expect(out.finalId).toBe(true);
  expect(out.steps).toEqual([['S', 'ok', 3], ['F', 'ok', 2], ['Bad', 'error', null], ['After', 'skipped', null], [null, 'ok', 2]]);
});

test('T-WB-08: cancelling a batch drops the store, old results report as evicted and a new run works', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { Runner } = await import('/src/app/runner.js');
    const r = new Runner();
    const text = 'section Section1;\r\n\r\nshared A = #table({"x"}, {{1}});\r\n\r\nshared Slow = List.Count(List.Generate(() => 0, each true, each _ + 1));';
    const events = [];
    const p = r.runMany({ sectionText: text, names: ['A', 'Slow'], culture: 'en-US', limits: {}, previewRows: 5 }, { onEvent: (m) => events.push(m), onNeedBinding: async () => null });
    await new Promise((res) => setTimeout(res, 600));
    const gen = r.generation;
    const keptId = events[0] && events[0].resultId;
    const t0 = performance.now();
    r.cancel();
    const res = await p;
    const ms = performance.now() - t0;
    const old = await r.rowsOf(keptId, 0, 5, gen);
    const again = await r.run({ sectionText: 'section Section1;\r\n\r\nshared Q = #table({"a"}, {{7}});', queryName: 'Q', culture: 'en-US', limits: {}, previewRows: 5 }, { onNeedBinding: async () => null });
    const rows = await r.rowsOf(again.resultId, 0, 5, r.generation);
    return { status: res.status, ms, kept: !!keptId, old, rows: rows.rows };
  });
  expect(out.status).toBe('cancelled');
  expect(out.ms).toBeLessThan(200);
  expect(out.kept).toBe(true);
  expect(out.old).toEqual({ rows: [], evicted: true });
  expect(out.rows).toEqual([[7]]);
});
