import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ext, fx, openApp, loadFile } from './helpers.js';

const b64 = (file) => readFileSync(file).toString('base64');

async function drop(page, files, { entries = null, target = 'window' } = {}) {
  await page.evaluate(({ files, entries, target }) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], f.name));
    }
    let carrier = dt;
    if (entries) carrier = { files: dt.files, items: entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })), types: ['Files'] };
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: carrier });
    const el = target === 'window' ? window : document.querySelector(target);
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(ev);
    window.__dropPrevented = ev.defaultPrevented;
  }, { files, entries, target });
}

const message = (page) => page.locator('.empty .message, #alert').first();

test('T-B-16: two files dropped open nothing and say so', async ({ page }) => {
  await openApp(page);
  await drop(page, [{ name: 'a.xlsx', data: b64(ext('pq_simple.xlsx')) }, { name: 'b.xlsx', data: b64(ext('pq_simple.xlsx')) }]);
  await expect(page.locator('.empty .message')).toHaveText('Drop one workbook.');
  await expect(page.locator('.workspace')).toHaveCount(0);
});

test('T-B-16: a dropped folder is named as a folder', async ({ page }) => {
  await openApp(page);
  await drop(page, [{ name: 'folder', data: '' }], { entries: [{ isDirectory: true }] });
  await expect(page.locator('.empty .message')).toHaveText('That is a folder.');
});

test('T-B-16: an unsupported extension names the supported ones', async ({ page }) => {
  await openApp(page);
  await drop(page, [{ name: 'data.csv', data: b64(fx('sales.csv')) }]);
  await expect(page.locator('.empty .message')).toHaveText('quoin opens .xlsx, .xlsm, .xltx and .xltm files.');
});

test('T-B-16: a zero-byte workbook and a non-zip file show the normal open error', async ({ page }) => {
  await openApp(page);
  await drop(page, [{ name: 'empty.xlsx', data: '' }]);
  await expect(page.locator('.empty .message')).toHaveText('This is not an Excel workbook.');
  await drop(page, [{ name: 'text.xlsx', data: Buffer.from('hello there').toString('base64') }]);
  await expect(page.locator('.empty .message')).toHaveText('This is not an Excel workbook.');
});

test('T-B-16: a bad drop while a workbook is open keeps the session and reports in the alert region', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await drop(page, [{ name: 'a.xlsx', data: b64(ext('pq_simple.xlsx')) }, { name: 'b.xlsx', data: b64(ext('pq_simple.xlsx')) }]);
  await expect(page.locator('#alert')).toHaveText('Drop one workbook.');
  await expect(page.locator('.workspace')).toHaveCount(1);
});

test('T-B-16: a drop outside the drop zone is prevented and the page does not navigate', async ({ page }) => {
  await openApp(page);
  const url = page.url();
  await drop(page, [{ name: 'a.xlsx', data: b64(ext('pq_simple.xlsx')) }], { target: 'body' });
  expect(await page.evaluate(() => window.__dropPrevented)).toBe(true);
  expect(page.url()).toBe(url);
});

test('T-B-16: the highlight does not flicker when the pointer crosses child elements', async ({ page }) => {
  await openApp(page);
  const states = await page.evaluate(() => {
    const zone = document.querySelector('.dropzone');
    const child = zone.firstElementChild;
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true }));
    const on = () => zone.classList.contains('is-over');
    const out = [];
    fire(zone, 'dragenter');
    out.push(on());
    fire(child, 'dragenter');
    fire(zone, 'dragleave');
    out.push(on());
    fire(child, 'dragleave');
    out.push(on());
    return out;
  });
  expect(states).toEqual([true, true, false]);
});

test('T-B-16: a normal single-file drop still opens the workbook', async ({ page }) => {
  await openApp(page);
  await drop(page, [{ name: 'pq_simple.xlsx', data: b64(ext('pq_simple.xlsx')) }]);
  await expect(page.locator('.workspace')).toHaveCount(1);
});
