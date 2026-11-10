import { test, expect } from '@playwright/test';
import { fx, openApp, loadFile, item, editor, runButton, status } from './helpers.js';

async function setCulture(page, culture) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-culture').selectOption(culture);
  await page.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
}

test('T-B-18: one culture formats the row count and the cells, and a change re-renders without a re-run', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await item(page, 'StudentResults').click();
  await editor(page).fill('Table.FromColumns({List.Numbers(1, 12345), List.Transform(List.Numbers(1, 12345), each _ + 0.5)}, {"N", "D"})');
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('1');
  await expect(status(page)).toContainText('12,345 rows');
  await expect(page.locator('.grid-row').first().locator('.grid-cell[role=gridcell]').nth(1)).toHaveText('1.5');

  await setCulture(page, 'de-DE');
  await expect(status(page)).toContainText('12.345 rows');
  await expect(status(page)).not.toContainText('12,345');
  await expect(page.locator('.grid-row').first().locator('.grid-cell[role=gridcell]').nth(1)).toHaveText('1,5');

  await page.locator('.grid-hcell:not(.grid-index)').first().click();
  await expect(page.getByRole('menuitem', { name: 'Sort ascending' })).toBeVisible();
});
