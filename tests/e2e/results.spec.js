import { test, expect } from '@playwright/test';
import { ext, fx, openApp, loadFile, item, editor, runButton } from './helpers.js';

async function runExpr(page, expr) {
  await item(page, 'StudentResults').click();
  await editor(page).fill(expr);
  await runButton(page).click();
}

test('T-E-07: an empty table keeps its header and says it has no rows', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runExpr(page, '#table({"A", "B"}, {})');
  await expect(page.locator('.grid-hcell:not(.grid-index)')).toHaveText([/A/, /B/]);
  await expect(page.locator('.grid')).toContainText('The table has no rows.');
});

test('T-E-07: a scalar value shows in a card', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runExpr(page, '40 + 2');
  await expect(page.locator('.message.value')).toHaveText('42');
  await expect(page.locator('.grid')).toBeHidden();
});

test('T-E-07: a function is described and not run', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runExpr(page, '(x) => x + 1');
  await expect(page.locator('.message')).toContainText('This query is a function.');
  await expect(page.locator('#status')).toContainText('Function');
});

test('T-E-07: an error shows its message and a link that puts the caret at the error', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runExpr(page, 'let\n    a = 1 +\nin\n    a');
  await expect(page.locator('.message.error')).toContainText('Line 3, column 1');
  await page.getByRole('button', { name: 'Go to the error' }).click();
  await expect(editor(page)).toBeFocused();
  const caret = await editor(page).evaluate((ta) => ta.value.slice(0, ta.selectionStart).split('\n').length);
  expect(caret).toBe(3);
  await runExpr(page, 'error "boom"');
  await expect(page.locator('.message.error')).toContainText('boom');
});

test('T-E-07: a run that reaches the row cap stops, names the cap and shows no half grid', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-rows').fill('1000');
  await page.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
  await runExpr(page, 'Table.FromColumns({List.Numbers(1, 5000)}, {"N"})');
  await expect(page.locator('.message.warn')).toHaveText(/^Stopped at [\d,]+ rows\.$/);
  await expect(page.locator('.grid')).toBeHidden();
  await runExpr(page, '#table({"A"}, {{1}})');
  await expect(page.locator('.message.warn')).toHaveCount(0);
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('1');
});

test('T-E-07: a list longer than the display limit says how many rows are shown', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runExpr(page, '{1..1500}');
  await expect(page.locator('.result-notice')).toBeVisible();
  await expect(page.locator('.result-notice')).toContainText('Showing the first');
});

test('T-E-08: the Differences view lists the differing cell with both values', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  const original = await editor(page).inputValue();
  await editor(page).fill(original.replace('in\n    #"Renamed Columns"', 'in\n    Table.TransformColumns(#"Renamed Columns", {{"RawInput", each Text.Lower(_)}})'));
  await runButton(page).click();
  await expect(page.locator('#status')).toContainText('Differs from the last Excel refresh in 1 cells');
  await page.getByRole('button', { name: 'View differences' }).click();
  const dlg = page.locator('dialog[open]');
  await expect(dlg.locator('h2')).toHaveText('Differences from Excel');
  await expect(dlg).toContainText('not Excel');
  await expect(dlg.locator('tbody tr')).toHaveCount(1);
  await expect(dlg.locator('tbody tr td')).toHaveText(['1', 'RawInput', 'HELLO WORLD!', 'hello world!']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'View differences' })).toBeFocused();
});

test('T-E-08: a matching result offers no differences view', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.locator('#status')).toContainText('Matches the last Excel refresh');
  await expect(page.getByRole('button', { name: 'View differences' })).toBeHidden();
});
