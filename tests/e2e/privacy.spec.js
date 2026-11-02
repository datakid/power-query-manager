import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fx, ext, openApp, loadFile, item, editor, runButton, downloadButton } from './helpers.js';
import { root } from '../unit/helpers.js';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

test('T-PRIV-1: every request is same-origin and listed in the asset manifest', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
  const manifest = JSON.parse(readFileSync(join(root, 'asset-manifest.json'), 'utf8'));
  const allowed = new Set(manifest.files.map((f) => new URL(f, 'http://localhost:5173/').pathname));
  allowed.add('/sw.js');
  allowed.add('/asset-manifest.json');
  for (const u of requests) {
    if (u.startsWith('blob:') || u.startsWith('data:')) continue;
    const url = new URL(u);
    expect(url.origin).toBe('http://localhost:5173');
    expect(allowed.has(url.pathname), url.pathname).toBe(true);
  }
});

test('T-PRIV-2: with network primitives disabled after load, every core flow still works', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const boom = () => {
      throw new Error('network blocked');
    };
    window.fetch = boom;
    window.XMLHttpRequest = boom;
    window.WebSocket = boom;
    window.EventSource = boom;
    navigator.sendBeacon = boom;
  });
  await loadFile(page, fx('csv-query.xlsx'));
  await item(page, 'Sales').click();
  await runButton(page).click();
  await page.locator('#bind-file').setInputFiles(fx('sales.csv'));
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('North');
  await editor(page).fill(`${await editor(page).inputValue()}\n// x`);
  await downloadButton(page).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.popover .btn-primary').click()]);
  expect((await dl.path()) !== null).toBe(true);
});

test('T-PRIV-3: no cookies, no web storage except the theme, no IndexedDB databases', async ({ page, context }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByRole('button', { name: 'Save' }).click();
  expect(await context.cookies()).toEqual([]);
  const stores = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0
  }));
  expect(stores).toEqual({ local: ['quoin.theme'], session: [], idb: 0 });
});

test('T-PRIV-4: the page sets the strict policy and the dialog refuses inline script', async ({ page }) => {
  await openApp(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  const violation = await page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('securitypolicyviolation', (e) => resolve(e.violatedDirective));
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true';
    document.head.append(s);
    setTimeout(() => resolve(null), 500);
  }));
  expect(violation).toMatch(/script-src/);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
});

test('T-PRIV-5: file names are rendered as text, never as markup', async ({ page }) => {
  await openApp(page);
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'q-'));
  const evil = join(dir, '<img src=x onerror=alert(1)>.xlsx');
  fs.copyFileSync(ext('pq_simple.xlsx'), evil);
  await loadFile(page, evil);
  await expect(page.locator('.file-name')).toHaveText('<img src=x onerror=alert(1)>.xlsx');
  expect(await page.locator('.topbar img[src="x"]').count()).toBe(0);
});

test('offline: after the first load the app starts without a network', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active.state;
  });
  await page.waitForFunction(async () => (await caches.keys()).length > 0);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.dropzone');
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
  const fontsOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Atkinson Hyperlegible Next"');
  });
  expect(fontsOk).toBe(true);
  await context.setOffline(false);
});
