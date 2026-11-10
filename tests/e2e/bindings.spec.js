import { test, expect } from '@playwright/test';
import { fx, openApp, loadFile, item, runButton } from './helpers.js';

async function runSales(page) {
  await item(page, 'Sales').click();
  await runButton(page).click();
}

test('T-E-06: a binding is asked for once, remembered for the session, and never persisted', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await runSales(page);
  const dlg = page.locator('dialog[open]');
  await expect(dlg).toBeVisible({ timeout: 15000 });
  await expect(dlg.locator('h2')).toHaveText('Choose a file');
  await expect(dlg).toContainText('The query Sales calls File.Contents on');
  await expect(dlg).toContainText('sales.csv');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dlg.getByRole('button', { name: 'Choose a local file' }).click()]);
  await chooser.setFiles(fx('sales.csv'));
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('dialog')).toHaveCount(0);

  await runButton(page).click();
  await expect(page.locator('#status')).toContainText('rows');
  await expect(page.locator('dialog')).toHaveCount(0);

  await page.reload();
  await loadFile(page, fx('csv-query.xlsx'));
  await runSales(page);
  await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 15000 });
});

test('T-E-06: Skip ends the run with the source error named, and the next run can ask again', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await runSales(page);
  await page.locator('dialog[open]').getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.message.error')).toContainText('No file was provided');
  await expect(runButton(page)).toBeVisible();
  await runButton(page).click();
  await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 15000 });
  await page.locator('dialog[open]').getByRole('button', { name: 'Skip' }).click();
});

test('T-E-06: cancelling a run that waits for a binding leaves nothing pending', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await runSales(page);
  await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 15000 });
  await page.locator('dialog[open]').getByRole('button', { name: 'Skip' }).click();
  await expect(runButton(page)).toBeVisible();
  await item(page, 'StudentResults').click();
  await runButton(page).click();
  await expect(page.locator('#status')).toContainText('rows');
});
