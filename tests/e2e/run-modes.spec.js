import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile } from './helpers.js';

const dot = (page, name) => page.locator(`[role=treeitem][data-name="${name}"] .dot-loaded, [role=treeitem][data-name="${name}"] .dot-conn`);

async function open(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  const problems = await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  return problems;
}

test('T-WB-09: run all fills every status, a function is left alone, and the result of any query opens without a run', async ({ page }) => {
  const problems = await open(page);
  await expect(dot(page, 'FinalTable')).toHaveAttribute('data-status', 'never');
  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.locator('.statusbar')).toContainText('2 ran');
  await expect(dot(page, 'RawInput')).toHaveAttribute('data-status', 'ok');
  await expect(dot(page, 'FinalTable')).toHaveAttribute('data-status', 'ok');
  await expect(dot(page, 'fGetNamedRange')).toHaveAttribute('data-status', 'skipped');
  await page.locator('[role=treeitem][data-name="FinalTable"]').click();
  await expect(page.locator('.grid-hcell').first()).toBeVisible();
  expect(await page.locator('.grid-hcell .hname').allTextContents()).toContain('Now');
  expect(problems).toEqual([]);
});

test('T-WB-09: editing a staging query turns it and its downstream out of date, and run stale runs exactly those', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Alt+Enter');
  await expect(dot(page, 'FinalTable')).toHaveAttribute('data-status', 'ok');
  await page.locator('[role=treeitem][data-name="RawInput"]').click();
  await page.locator('.editor-wrap textarea').focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n// touched');
  await expect(dot(page, 'RawInput')).toHaveAttribute('data-status', 'stale');
  await expect(dot(page, 'FinalTable')).toHaveAttribute('data-status', 'stale');
  await page.keyboard.press('Control+Shift+Enter');
  await expect(page.locator('.statusbar')).toContainText('2 ran');
  await expect(dot(page, 'RawInput')).toHaveAttribute('data-status', 'ok');
  await expect(dot(page, 'FinalTable')).toHaveAttribute('data-status', 'ok');
  await page.keyboard.press('Control+Shift+Enter');
  await expect(page.locator('.statusbar')).toContainText('Nothing to run');
});

test('T-WB-09: the palette lists the run modes and runs one', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('>run all');
  await expect(page.locator('.palette-row').first()).toContainText('Run all queries');
  await page.keyboard.press('Enter');
  await expect(page.locator('.statusbar')).toContainText('2 ran');
});

test('T-WB-09: cancelling a batch returns to idle and marks the rest cancelled', async ({ page }) => {
  await open(page);
  await page.locator('[role=treeitem][data-name="RawInput"]').click();
  await page.locator('.editor-wrap textarea').fill('List.Count(List.Generate(() => 0, each true, each _ + 1))');
  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
  await expect(dot(page, 'FinalTable')).not.toHaveAttribute('data-status', 'running');
  await page.locator('.editor-wrap textarea').fill('Table.FromRows({{1}}, {"a"})');
  await page.keyboard.press('Control+Alt+Enter');
  await expect(page.locator('.statusbar')).toContainText('ran');
});
