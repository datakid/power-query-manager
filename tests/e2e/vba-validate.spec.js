import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, downloadButton } from './helpers.js';

test('T-E-04b: a character outside the code page blocks the save with a specific message', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'Sheet1').click();
  const original = await editor(page).inputValue();
  await editor(page).fill(original.replace('Option Explicit', "Option Explicit\n' arrow \u2192 here"));
  await expect(page.locator('.info-strip.problem')).toContainText('Line 2, column 9: \u2192 cannot be saved in code page 1252.');
  await expect(page.locator('.gutter .gutter-err')).toHaveText('● 2');
  await downloadButton(page).click();
  await expect(page.locator('.popover .warn:not([hidden])')).toContainText('Sheet1 cannot be saved.');
  await expect(page.locator('.popover .warn:not([hidden])')).toContainText('code page 1252');
  await expect(page.locator('.popover .btn-primary')).toBeDisabled();
  await page.keyboard.press('Escape');
  await editor(page).fill(original.replace('Option Explicit', "Option Explicit\n' euro \u20AC here"));
  await expect(page.locator('.info-strip.problem')).toHaveCount(0);
  await downloadButton(page).click();
  await expect(page.locator('.popover .warn:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.popover .btn-primary')).toBeEnabled();
});

test('T-E-04b: a typed Attribute line and an over-long line are named', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'Sheet1').click();
  const original = await editor(page).inputValue();
  await editor(page).fill(`${original}\nAttribute VB_Name = "x"`);
  await expect(page.locator('.info-strip.problem')).toContainText('starts with Attribute');
  await editor(page).fill(`${original}\n' ${'a'.repeat(1100)}`);
  await expect(page.locator('.info-strip.problem')).toContainText('1,102 characters'.replace(',', ''));
  await editor(page).fill(original);
  await expect(page.locator('.info-strip.problem')).toHaveCount(0);
});
