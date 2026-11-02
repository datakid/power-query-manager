import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, runButton } from './helpers.js';

async function runExpression(page, expression) {
  await item(page, 'StudentResults').click();
  await editor(page).fill(expression);
  await runButton(page).click();
  await page.waitForFunction(() => document.querySelector('.grid:not([hidden]) .grid-hcell') || document.querySelector('.message.error, .message.warn'));
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
});

test('nested values drill in and out through the breadcrumb', async ({ page }) => {
  await runExpression(page, '#table({"Id","Inner","Items"}, {{1, #table({"X","Y"}, {{5,"a"},{6,"b"}}), {10,20}}, {2, [k=1], {}}})');
  await expect(page.locator('.grid-cell.nested').first()).toHaveText('Table');
  await page.locator('.grid-cell.nested').first().dispatchEvent('pointerdown');
  await expect(page.locator('.crumbs').first()).toContainText('Inner [1]');
  await expect(page.locator('.grid-hcell .hname')).toHaveText(['X', 'Y']);
  await page.locator('.crumbs button', { hasText: 'Result' }).click();
  await expect(page.locator('.grid-hcell .hname')).toHaveText(['Id', 'Inner', 'Items']);
  await page.locator('.grid-row').nth(0).locator('.grid-cell.nested').nth(1).dispatchEvent('pointerdown');
  await expect(page.locator('.grid-cell:not(.grid-index)')).toHaveText(['10', '20']);
});

test('error cells show their reason and message in a popover', async ({ page }) => {
  await runExpression(page, 'Table.TransformColumnTypes(#table({"A"}, {{"1"},{"x"}}), {{"A", type number}})');
  await expect(page.locator('.grid-cell.err')).toHaveText('Error');
  await page.locator('.grid-cell.err').dispatchEvent('pointerdown');
  await expect(page.locator('.popover')).toContainText('DataFormat.Error');
  await expect(page.locator('.popover')).toContainText("We couldn't convert to Number.");
});

test('the column menu sorts the view and copies the column name', async ({ page }) => {
  await runExpression(page, '#table({"N","T"}, {{3,"c"},{1,"a"},{2,"b"}})');
  await page.locator('.grid-hcell:not(.grid-index)').first().click();
  await page.getByRole('menuitem', { name: 'Sort descending' }).click();
  await expect(page.locator('.grid-row .grid-cell[role=gridcell]:nth-child(2)')).toHaveText(['3', '2', '1']);
  await page.locator('.grid-hcell:not(.grid-index)').nth(1).click();
  await page.getByRole('menuitem', { name: 'Sort ascending' }).click();
  await expect(page.locator('.grid-row .grid-cell[role=gridcell]:nth-child(2)')).toHaveText(['1', '2', '3']);
});

test('selection and the copy event produce tab-separated text', async ({ page }) => {
  await runExpression(page, '#table({"N","T"}, {{1,"a"},{2,"b"},{3,"c"}})');
  const cells = page.locator('.grid-cell[role=gridcell]');
  await cells.nth(0).dispatchEvent('pointerdown');
  await cells.nth(3).dispatchEvent('pointerdown', { shiftKey: true });
  const text = await page.evaluate(() => {
    const dt = new DataTransfer();
    document.querySelector('.grid').dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, cancelable: true, bubbles: true }));
    return dt.getData('text/plain');
  });
  expect(text).toBe('1\ta\n2\tb');
});

test('arrow keys move the active cell and the grid exposes it', async ({ page }) => {
  await runExpression(page, '#table({"N","T"}, {{1,"a"},{2,"b"}})');
  await page.locator('.grid').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.grid')).toHaveAttribute('aria-activedescendant', 'gc-1-1');
  await expect(page.locator('#gc-1-1')).toHaveText('b');
});

test('lists and records appear as tables, scalars as plain text', async ({ page }) => {
  await runExpression(page, '{1, "two", null}');
  await expect(page.locator('.grid-hcell .hname')).toHaveText('Item');
  await expect(page.locator('.grid-cell.null')).toHaveText('null');
  await runButton(page).click();
  await editor(page).fill('[a=1, b="x"]');
  await runButton(page).click();
  await expect(page.locator('.grid-hcell .hname')).toHaveText(['Name', 'Value']);
  await editor(page).fill('1 + 2');
  await runButton(page).click();
  await expect(page.locator('.message')).toHaveText('3');
});

test('a syntax error blocks the run, marks the editor and gives line and column', async ({ page }) => {
  await item(page, 'StudentResults').click();
  await editor(page).fill('let\n  a = 1,\n  b = \nin b');
  await expect(page.locator('.code-area .tok-err')).toBeVisible();
  await runButton(page).click();
  await expect(page.locator('.message.error')).toHaveText('Expected an expression. Line 4, column 1.');
});

test('the timeout stops a run and says so', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('M timeout (seconds)').fill('1');
  await page.getByRole('button', { name: 'Save' }).click();
  await runExpression(page, 'List.Accumulate({1..100000}, 0, (s, c) => s + List.Sum({1..c}))');
  await expect(page.locator('.message.warn')).toContainText('Stopped after 1 s.', { timeout: 15000 });
});

test('the row cap stops a run at the configured size', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Row cap').fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  await runExpression(page, 'List.Numbers(0, 5000)');
  await expect(page.locator('.message.warn')).toContainText('Stopped at');
});

test('a result with many columns renders only the visible ones', async ({ page }) => {
  await runExpression(page, 'Table.FromRows({List.Numbers(0, 300)}, List.Transform(List.Numbers(0, 300), each "C" & Text.From(_)))');
  const rendered = await page.locator('.grid-hcell:not(.grid-index)').count();
  expect(rendered).toBeGreaterThan(3);
  expect(rendered).toBeLessThan(60);
  await page.locator('.grid').evaluate((el) => {
    el.scrollLeft = 20000;
  });
  await expect(page.locator('.grid-hcell .hname').last()).not.toHaveText('C0');
});
