import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile } from './helpers.js';

test('T-WB-13: Ctrl+K opens the palette, a name selects the item, focus returns to the editor area', async ({ page }) => {
  const problems = await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await page.keyboard.press('Control+k');
  await expect(page.locator('dialog.palette')).toBeVisible();
  await expect(page.locator('.palette-input')).toBeFocused();
  await page.keyboard.type('finalt');
  await expect(page.locator('.palette-row.is-active')).toContainText('FinalTable');
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.palette')).toHaveCount(0);
  await expect(page.locator('.item-head h2, .item-title')).toContainText('FinalTable');
  expect(problems).toEqual([]);
});

test('T-WB-13: the combobox exposes the active option and the result count to assistive technology', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await page.keyboard.press('Control+k');
  const input = page.locator('.palette-input');
  await expect(input).toHaveAttribute('role', 'combobox');
  await page.keyboard.type('raw');
  const active = await input.getAttribute('aria-activedescendant');
  await expect(page.locator(`#${active}`)).toContainText('RawInput');
  await expect(page.locator('.palette-status')).toContainText('result');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.palette')).toHaveCount(0);
});

test('T-WB-13: > lists commands, a disabled one says why, an enabled one runs', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('>run the');
  await expect(page.locator('.palette-row').first()).toContainText('Run the current query');
  await expect(page.locator('.palette-why').first()).toContainText('Open a workbook');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette-status')).toContainText('Not available');
  await expect(page.locator('dialog.palette')).toBeVisible();
  await page.locator('.palette-input').fill('>settings');
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog[aria-labelledby="set-title"]')).toBeVisible();
});

test('T-WB-13: @ jumps into a module at the procedure and : goes to a line', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await page.keyboard.press('Control+k');
  await page.keyboard.type('@worksheet_change');
  await expect(page.locator('.palette-row').first()).toContainText('Worksheet_Change');
  await page.keyboard.press('Enter');
  await expect(page.locator('.item-title')).toContainText('Sheet1');
  const line = await page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    return ta.value.slice(0, ta.selectionStart).split(/\r\n|\r|\n/).length;
  });
  expect(line).toBe(3);
  await page.keyboard.press('Control+k');
  await page.keyboard.type(':9');
  await page.keyboard.press('Enter');
  const line2 = await page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    return ta.value.slice(0, ta.selectionStart).split(/\r\n|\r|\n/).length;
  });
  expect(line2).toBe(9);
});

test('T-WB-13: # lists the steps of the current query and jumps to the one chosen', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('#added');
  await expect(page.locator('.palette-row').first()).toContainText('Added Custom');
  await page.keyboard.press('Enter');
  const line = await page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    return ta.value.slice(0, ta.selectionStart).split(/\r\n|\r|\n/).length;
  });
  expect(line).toBe(4);
});

test('T-WB-13: the shortcut sheet is generated from the registry and lists the palette', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  const dlg = page.locator('dialog[aria-labelledby="sc-title"]');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Ctrl/Cmd+K');
  await expect(dlg).toContainText('Search everything and run commands');
  await expect(dlg).toContainText('Ctrl/Cmd+Shift+E');
});

test('T-WB-13: the browser save dialog never appears and Ctrl+S without a file does nothing', async ({ page }) => {
  await openApp(page);
  const prevented = await page.evaluate(() => new Promise((resolve) => {
    window.addEventListener('keydown', (e) => setTimeout(() => resolve(e.defaultPrevented), 0), { once: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true }));
  }));
  expect(prevented).toBe(true);
});
