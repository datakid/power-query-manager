import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const fx = (name) => join(here, '..', 'fixtures', 'workbooks', name);
export const ext = (name) => join(here, '..', 'fixtures', 'external', name);

export async function openApp(page, path = '/index.html') {
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await page.goto(path);
  await page.waitForSelector('.dropzone');
  return problems;
}

export async function loadFile(page, file) {
  await page.setInputFiles('input[type=file]', file);
  await page.waitForSelector('.workspace, .empty .message');
}

export async function dropFile(page, file, name) {
  const data = readFileSync(file).toString('base64');
  await page.evaluate(({ data, name }) => {
    const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], name));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, { data, name });
  await page.waitForSelector('.workspace, .empty .message');
}

export const item = (page, name) => page.locator(`[role=treeitem][data-name="${name}"]`);
export const editor = (page) => page.locator('.editor-wrap textarea');
export const runButton = (page) => page.getByRole('button', { name: /^Run/ });
export const status = (page) => page.locator('.statusbar');
export const downloadButton = (page) => page.locator('.topbar button[aria-haspopup="dialog"]');

export async function runCurrent(page) {
  await runButton(page).click();
  await page.waitForSelector('.grid-cell, .message', { state: 'attached' });
}

export async function saveDownload(page, clickTarget, path) {
  const [dl] = await Promise.all([page.waitForEvent('download'), clickTarget.click()]);
  await dl.saveAs(path);
  return dl.suggestedFilename();
}
