import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, downloadButton } from './helpers.js';

test('T-E-01: the Download button follows one dirty model, including a hand revert with a trailing newline', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  const dl = downloadButton(page);
  await expect(dl).toHaveAttribute('aria-disabled', 'true');
  await expect(dl).toHaveAttribute('title', 'No changes yet.');
  await expect(dl).toHaveAccessibleName('Download');

  await item(page, 'RawInput').click();
  const original = await editor(page).inputValue();
  await editor(page).fill(`${original}\n// one`);
  await expect(dl).not.toHaveAttribute('aria-disabled', 'true');
  await expect(dl).toHaveAccessibleName('Download — 1 change');

  await item(page, 'Sheet1').click();
  const module = await editor(page).inputValue();
  await editor(page).fill(`${module}\n' two`);
  await expect(dl).toHaveAccessibleName('Download — 2 changes');

  await editor(page).fill(module);
  await item(page, 'RawInput').click();
  await editor(page).fill(`${original}\n\n`);
  await expect(dl).toHaveAttribute('aria-disabled', 'true');
  await expect(dl).toHaveAccessibleName('Download');
  await expect(page.locator('[data-name=RawInput] .dot-edited')).toHaveCount(0);
});

test('T-E-01: a disabled Download button opens nothing and Ctrl+S does not either', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await downloadButton(page).click({ force: true });
  await expect(page.locator('.popover')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.popover')).toHaveCount(0);
});
