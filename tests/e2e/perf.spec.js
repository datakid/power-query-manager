import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fx, ext, openApp, loadFile, item, runButton } from './helpers.js';
import { readZip } from '../../src/core/zip-read.js';
import { Package } from '../../src/core/opc.js';

test('T-PERF-1: first load transfers under 400 KB with gzip, fonts included', async ({ page }) => {
  const sizes = [];
  page.on('response', async (r) => {
    try {
      sizes.push(gzipSync(await r.body()).length);
    } catch {
      return;
    }
  });
  await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const total = sizes.reduce((a, b) => a + b, 0);
  expect(total).toBeLessThan(400 * 1024);
});

test('T-PERF-2: a 20 MB workbook shows its rail within two seconds', async ({ page }) => {
  const pkg = new Package(readZip(new Uint8Array(readFileSync(ext('pq_simple.xlsx')))));
  pkg.set('xl/media/filler.bin', new Uint8Array(randomBytes(20 * 1024 * 1024)));
  const file = join(mkdtempSync(join(tmpdir(), 'q-')), 'big.xlsx');
  writeFileSync(file, await pkg.write());
  await openApp(page);
  const t0 = Date.now();
  await page.setInputFiles('input[type=file]', file);
  await page.waitForSelector('[role=treeitem][data-type=query]');
  expect(Date.now() - t0).toBeLessThan(2000);
});

test('T-PERF-3: scrolling a 1,000,000 by 12 result stays smooth', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await loadFile(page, fx('big-grid.xlsx'));
  await item(page, 'Big').click();
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('0', { timeout: 60000 });
  const stats = await page.evaluate(() => new Promise((resolve) => {
    const grid = document.querySelector('.grid');
    const gaps = [];
    let last = performance.now();
    let steps = 0;
    const tick = (now) => {
      gaps.push(now - last);
      last = now;
      grid.scrollTop += 3000;
      steps++;
      if (steps < 240) requestAnimationFrame(tick);
      else resolve({ gaps, top: grid.scrollTop });
    };
    requestAnimationFrame(tick);
  }));
  const sorted = [...stats.gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  expect(stats.top).toBeGreaterThan(100000);
  expect(median).toBeLessThan(25);
  expect(p95).toBeLessThan(60);
});

test('T-PERF-5: typing in the editor does not drop input events', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  const ta = page.locator('.editor-wrap textarea');
  await ta.focus();
  await page.keyboard.press('Control+End');
  const text = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(3);
  const before = (await ta.inputValue()).length;
  await page.keyboard.type(text, { delay: 5 });
  expect((await ta.inputValue()).length).toBe(before + text.length);
});
