import { test, expect } from '@playwright/test';
import { ext, openApp, editor, runButton } from './helpers.js';

const notBody = async (page, step) => {
  const tag = await page.evaluate(() => (document.activeElement ? document.activeElement.tagName : 'NONE'));
  expect(tag, `focus after: ${step}`).not.toBe('BODY');
};

test('T-E-12: open, select, edit, run and save without touching the mouse, focus never on the body', async ({ page }) => {
  await openApp(page);
  await page.locator('.dropzone button').focus();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')]);
  await chooser.setFiles(ext('pq_vba_complex.xlsm'));
  await expect(page.locator('.workspace')).toHaveCount(1);
  await notBody(page, 'open');
  await expect(page.locator('[role=treeitem][aria-selected=true]')).toBeFocused();

  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('[role=treeitem][aria-selected=true]')).toHaveAttribute('data-name', 'RawInput');
  await notBody(page, 'alt+down');

  await editor(page).focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n// typed');
  await expect(page.locator('[data-name=RawInput] .dot-edited')).toHaveCount(1);
  await notBody(page, 'typing');

  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toBeVisible();
  await notBody(page, 'run');

  await page.keyboard.press('Control+s');
  await expect(page.locator('.popover')).toBeVisible();
  await notBody(page, 'save popover');
  const ack = page.locator('.popover input[type=checkbox]');
  if (await ack.count()) await ack.check();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.popover .btn-primary').press('Enter')]);
  expect(download.suggestedFilename()).toBe('pq_vba_complex (edited).xlsm');
  await expect(page.locator('.popover')).toHaveCount(0);
  await notBody(page, 'download');
});

test('T-E-12: shortcuts are ignored while a dialog is open, except Escape', async ({ page }) => {
  await openApp(page);
  await page.setInputFiles('input[type=file]', ext('pq_vba_complex.xlsm'));
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Control+Enter');
  await expect(runButton(page)).toBeVisible();
  await expect(page.locator('#status')).not.toContainText('rows');
  await page.keyboard.press('?');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('T-E-12: the shortcut sheet lists every shortcut and F3 steps through matches', async ({ page }) => {
  await openApp(page);
  await page.setInputFiles('input[type=file]', ext('pq_vba_complex.xlsm'));
  await page.keyboard.press('?');
  const rows = await page.locator('dialog[open] dt').allTextContents();
  for (const k of ['Ctrl/Cmd+O', 'Ctrl/Cmd+S', 'Ctrl/Cmd+Enter', 'Esc', 'Ctrl/Cmd+F', 'F3 / Shift+F3', 'Alt+Up / Alt+Down']) expect(rows).toContain(k);
  await page.keyboard.press('Escape');
  await page.locator('[role=treeitem][data-type=query]').nth(1).click();
  await editor(page).focus();
  await page.keyboard.press('Control+f');
  await page.locator('.findbar input[type=text]').fill('Converted');
  await expect(page.locator('.findbar')).toContainText('1/');
  await page.keyboard.press('Escape');
  await editor(page).focus();
  await page.keyboard.press('F3');
  await expect(page.locator('.findbar')).toBeVisible();
});
