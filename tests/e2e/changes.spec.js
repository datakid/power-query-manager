import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, downloadButton } from './helpers.js';

async function editTwo(page) {
  await item(page, 'RawInput').click();
  const q = await editor(page).inputValue();
  await editor(page).fill(`${q}\n// note`);
  await item(page, 'Sheet1').click();
  const m = await editor(page).inputValue();
  await editor(page).fill(m.replace('Option Explicit', "Option Explicit\n' changed"));
  return { q, m };
}

test('T-E-03b: the Changes dialog lists exactly the changed items with their diffs', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await editTwo(page);
  await downloadButton(page).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  const dlg = page.locator('dialog[open]');
  await expect(dlg.locator('.change-item')).toHaveCount(2);
  await expect(dlg.locator('.change-name')).toHaveText(['RawInput', 'Sheet1']);
  await dlg.locator('.change-item').first().locator('summary').click();
  await expect(dlg.locator('.change-item').first().locator('.diff-add')).toHaveCount(1);
  await expect(dlg.locator('.change-item').first().locator('.diff-add .diff-text')).toHaveText('// note');
  await expect(dlg.locator('.change-item').first().locator('.diff-add .diff-mark')).toHaveAccessibleName('Added line');
  await page.keyboard.press('Escape');
  await expect(downloadButton(page)).toBeFocused();
});

test('T-E-02: revert at all three scopes restores the original text', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  const { q, m } = await editTwo(page);
  await item(page, 'FinalTable').click();
  const f = await editor(page).inputValue();
  await editor(page).fill(`${f}\n// third`);
  await expect(downloadButton(page)).toHaveAccessibleName('Download — 3 changes');

  await page.keyboard.press('Control+z');
  await expect(downloadButton(page)).toHaveAccessibleName('Download — 2 changes');

  await item(page, 'Sheet1').click();
  await page.getByRole('button', { name: 'Revert' }).click();
  await expect(editor(page)).toHaveValue(m);
  await expect(downloadButton(page)).toHaveAccessibleName('Download — 1 change');

  await item(page, 'FinalTable').click();
  await editor(page).fill(`${f}\n// third again`);
  await downloadButton(page).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Revert all' }).click();
  await expect(page.locator('dialog[open] h2')).toHaveText('Revert all changes');
  await expect(page.locator('dialog[open]')).toContainText('2 changes');
  await page.locator('dialog[open]').getByRole('button', { name: 'Revert all' }).click();
  await expect(downloadButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.dot-edited')).toHaveCount(0);
  await expect(editor(page)).toHaveValue(f);
  await item(page, 'RawInput').click();
  await expect(editor(page)).toHaveValue(q);
  await item(page, 'Sheet1').click();
  await expect(editor(page)).toHaveValue(m);
});

test('T-E-02: cancelling the confirmation keeps the edits', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await editTwo(page);
  await downloadButton(page).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Revert all' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('dialog[open] h2')).toHaveText('Changes');
  await expect(downloadButton(page)).toHaveAccessibleName('Download — 2 changes');
});

test('T-E-11: opening another file with unsaved changes asks in the page, not in a browser box', async ({ page }) => {
  const native = [];
  page.on('dialog', (d) => {
    native.push(d.type());
    d.dismiss();
  });
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await editTwo(page);
  await page.setInputFiles('input[type=file]', ext('pq_simple.xlsx'));
  await expect(page.locator('dialog[open] h2')).toHaveText('Open another file');
  await expect(page.locator('dialog[open]')).toContainText('discards 2 unsaved changes');
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  await expect(downloadButton(page)).toHaveAccessibleName('Download — 2 changes');
  await page.setInputFiles('input[type=file]', ext('pq_simple.xlsx'));
  await page.locator('dialog[open]').getByRole('button', { name: 'Discard and open' }).click();
  await expect(page.locator('.file-name')).toHaveText('pq_simple.xlsx');
  await expect(downloadButton(page)).toHaveAttribute('aria-disabled', 'true');
  expect(native.filter((t) => t !== 'beforeunload')).toEqual([]);
});
