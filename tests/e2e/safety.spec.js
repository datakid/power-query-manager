import { test, expect } from '@playwright/test';
import { openApp, loadFile, ext, editor } from './helpers.js';

async function dirtyQuery(page) {
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  const original = await editor(page).inputValue();
  await editor(page).click();
  await editor(page).fill(`${original}\n// edit`);
  return original;
}

test('T-B-05: a dirty session asks before the page is reloaded', async ({ page }) => {
  await openApp(page);
  await dirtyQuery(page);
  const seen = [];
  page.on('dialog', async (d) => {
    seen.push(d.type());
    await d.accept();
  });
  await page.reload();
  expect(seen).toContain('beforeunload');
});

test('T-B-05: a clean session reloads without a prompt, also after reverting by hand', async ({ page }) => {
  await openApp(page);
  const original = await dirtyQuery(page);
  await editor(page).fill(`${original}\n`);
  const seen = [];
  page.on('dialog', async (d) => {
    seen.push(d.type());
    await d.accept();
  });
  await page.reload();
  expect(seen).toEqual([]);
});
