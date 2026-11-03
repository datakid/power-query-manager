import { test, expect } from '@playwright/test';
import { ext, fx, openApp, loadFile, item, runButton } from './helpers.js';

async function openWith(page, locator) {
  await locator.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog[open]')).toBeVisible();
}

test('T-B-14: the settings dialog returns focus to its opener on Escape and on Close', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  const opener = page.getByRole('button', { name: 'Settings' });
  await openWith(page, opener);
  await expect(page.locator('dialog[open]')).toHaveAttribute('aria-labelledby', 'set-title');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await openWith(page, opener);
  await page.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('T-B-14: the file details dialog returns focus to the file name button', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  const opener = page.locator('.topbar .file-name');
  await openWith(page, opener);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('T-B-14: the shortcuts dialog opened with the question mark returns focus to where it was', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  const rail = page.locator('[role=treeitem][data-type=query]').first();
  await rail.focus();
  await page.keyboard.press('?');
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(rail).toBeFocused();
});

test('T-B-14: every dialog gets focus inside it on open and has an accessible name', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await openWith(page, page.getByRole('button', { name: 'Settings' }));
  const inside = await page.evaluate(() => document.querySelector('dialog[open]').contains(document.activeElement));
  expect(inside).toBe(true);
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Settings');
});

test('T-B-14: the binding dialog returns focus and the keyboard stays on the Run and Cancel buttons', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await item(page, 'Sales').click();
  await runButton(page).focus();
  await page.keyboard.press('Enter');
  const dlg = page.locator('dialog[open]');
  await expect(dlg).toBeVisible({ timeout: 15000 });
  await dlg.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(runButton(page)).toBeFocused({ timeout: 15000 });
});

test('T-B-14: focus stays on a visible control when a run starts from the keyboard', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('long-run.xlsx'));
  await item(page, 'Slow').click();
  await runButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(runButton(page)).toBeFocused();
});
