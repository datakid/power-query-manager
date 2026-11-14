import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile } from './helpers.js';

const editorText = (page) => page.locator('.editor-wrap textarea').inputValue();

async function open(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  const problems = await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  return problems;
}

test('T-WB-14: the panel lists the steps with kinds, follows the caret and jumps on click', async ({ page }) => {
  const problems = await open(page);
  const rows = page.locator('.step-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Source');
  await expect(rows.nth(0)).toContainText('Source');
  await expect(rows.nth(1)).toContainText('Changed Type');
  await expect(rows.nth(1)).toContainText('Types');
  await expect(rows.nth(2)).toContainText('Added Custom');
  await expect(page.locator('.panel-head .count-pill')).toHaveText('3');
  await rows.nth(2).click();
  const line = await page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    return ta.value.slice(0, ta.selectionStart).split(/\r\n|\r|\n/).length;
  });
  expect(line).toBe(4);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.step-row.is-current')).toContainText('Changed Type');
  expect(problems).toEqual([]);
});

test('T-WB-14: rename from the keyboard rewrites the definition and its reader, and undo restores it', async ({ page }) => {
  await open(page);
  const before = await editorText(page);
  await page.locator('.step-row').nth(1).focus();
  await page.keyboard.press('F2');
  await page.locator('.step-rename').fill('Typed');
  await page.keyboard.press('Enter');
  const after = await editorText(page);
  expect(after).toContain('Typed = Table.TransformColumnTypes(Source');
  expect(after).toContain('Table.AddColumn(Typed,');
  expect(after).not.toContain('Changed Type');
  await expect(page.locator('.step-row').nth(1)).toContainText('Typed');
  await page.locator('.editor-wrap textarea').focus();
  await page.keyboard.press('Control+z');
  expect(await editorText(page)).toBe(before);
  await expect(page.locator('.step-row').nth(1)).toContainText('Changed Type');
});

test('T-WB-14: delete, bypass and restore, duplicate change the query text and the dirty state', async ({ page }) => {
  await open(page);
  const before = await editorText(page);
  await expect(page.locator('.topbar button', { hasText: 'Download' })).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.step-row').nth(1).focus();
  await page.keyboard.press('b');
  await expect(page.locator('.step-row').nth(1)).toHaveClass(/is-bypassed/);
  expect(await editorText(page)).toContain('Table.AddColumn(Source,');
  await expect(page.locator('.topbar button', { hasText: 'Download' })).toHaveAttribute('aria-disabled', 'false');
  await page.locator('.step-row').nth(1).focus();
  await page.keyboard.press('b');
  expect(await editorText(page)).toBe(before);
  await expect(page.locator('.topbar button', { hasText: 'Download' })).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.step-row').nth(2).focus();
  await page.keyboard.press('Control+d');
  await expect(page.locator('.step-row')).toHaveCount(4);
  expect(await editorText(page)).toContain('#"Added Custom (2)" = Table.AddColumn(#"Added Custom"');
  await page.locator('.step-row').nth(3).focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.step-row')).toHaveCount(3);
  expect(await editorText(page)).toBe(before);
});

test('T-WB-14: moving a linear step asks to rewire, and cancelling changes nothing', async ({ page }) => {
  await open(page);
  const before = await editorText(page);
  await page.locator('.step-row').nth(2).focus();
  await page.keyboard.press('Alt+Shift+ArrowUp');
  const dlg = page.locator('dialog[open]');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Added Custom');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  expect(await editorText(page)).toBe(before);
  await page.locator('.step-row').nth(2).focus();
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await page.locator('dialog[open]').getByRole('button', { name: 'Move and rewire' }).click();
  const after = await editorText(page);
  expect(after.indexOf('#"Added Custom" =')).toBeLessThan(after.indexOf('#"Changed Type" ='));
  expect(after).toContain('#"Changed Type" = Table.TransformColumnTypes(#"Added Custom"');
  await expect(page.locator('.step-row').nth(1)).toContainText('Added Custom');
});

test('T-WB-14: a refused edit says why and changes nothing', async ({ page }) => {
  await open(page);
  const before = await editorText(page);
  await page.locator('.step-row').nth(0).focus();
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(page.locator('.steps-live')).toContainText('source');
  await page.keyboard.press('Delete');
  expect(await editorText(page)).toBe(before);
});

test('T-WB-14: Evaluate steps shows a status and row count for every step and a step click shows its own result', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Evaluate steps' }).click();
  await expect(page.locator('.bead-ok')).toHaveCount(3);
  await expect(page.locator('.step-delta').first()).toContainText('3 rows');
  await page.locator('.step-row').nth(0).click();
  await expect(page.locator('.grid-row').first()).toBeVisible();
  const heads = await page.locator('.grid-hcell .hname').allTextContents();
  expect(heads).toEqual(['Name', 'Age']);
  await page.locator('.step-row').nth(2).click();
  expect(await page.locator('.grid-hcell .hname').allTextContents()).toEqual(['Name', 'Age', 'DateTimeGenerated']);
});

test('T-WB-14: the panel hides for a macro and the toggle shortcut collapses and restores it', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await page.locator('[role=treeitem][data-type=query]').nth(1).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await page.keyboard.press('Control+Alt+b');
  await expect(page.locator('.inspector')).toBeHidden();
  await page.keyboard.press('Control+Alt+b');
  await expect(page.locator('.inspector')).toBeVisible();
  await page.locator('[role=treeitem][data-type=module]').first().click();
  await expect(page.locator('.inspector')).toBeHidden();
});
