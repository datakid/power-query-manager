import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, downloadButton } from './helpers.js';

async function editAndOpenPopover(page) {
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await editor(page).fill(`${await editor(page).inputValue()}\n// saved`);
  await downloadButton(page).click();
  const ack = page.locator('.popover input[type=checkbox]');
  if (await ack.count()) await ack.check();
}

const stubPicker = (page, mode) =>
  page.evaluate((mode) => {
    window.__picks = [];
    window.__same = mode === 'same-first';
    window.showSaveFilePicker = async (opts) => {
      window.__picks.push(opts);
      if (mode === 'abort') throw new DOMException('cancelled', 'AbortError');
      const chunks = [];
      const name = opts.suggestedName;
      const same = window.__same;
      window.__same = false;
      return {
        name,
        isSameEntry: async () => same,
        createWritable: async () => ({ write: async (b) => chunks.push(new Uint8Array(b)), close: async () => {} }),
        getFile: async () => new File(mode === 'corrupt' ? [new Uint8Array(10)] : chunks, name)
      };
    };
  }, mode);

test('T-E-09: with a file picker the file is written, read back, and only then reported as saved', async ({ page }) => {
  await openApp(page);
  await stubPicker(page, 'ok');
  await editAndOpenPopover(page);
  await page.locator('.popover .btn-primary').click();
  await expect(page.locator('#status')).toContainText('Saved pq_vba_complex (edited).xlsm and read it back to check it.');
  await expect(page.locator('.popover')).toHaveCount(0);
  const opts = await page.evaluate(() => window.__picks[0]);
  expect(opts.suggestedName).toBe('pq_vba_complex (edited).xlsm');
  expect(opts.types[0].accept).toEqual({ 'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'] });
});

test('T-E-09: a file that reads back differently is reported as a failure, never as saved', async ({ page }) => {
  await openApp(page);
  await stubPicker(page, 'corrupt');
  await editAndOpenPopover(page);
  await page.locator('.popover .btn-primary').click();
  await expect(page.locator('.popover .warn:not([hidden])')).toContainText('did not read back the same');
  await expect(page.locator('#status')).not.toContainText('Saved');
  await expect(page.locator('.popover .btn-primary')).toBeEnabled();
});

test('T-E-09: cancelling the picker keeps the popover open and says nothing', async ({ page }) => {
  await openApp(page);
  await stubPicker(page, 'abort');
  await editAndOpenPopover(page);
  await page.locator('.popover .btn-primary').click();
  await expect(page.locator('.popover')).toBeVisible();
  await expect(page.locator('.popover .warn:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.popover .btn-primary')).toBeEnabled();
  await expect(page.locator('#status')).not.toContainText('Saved');
});

test('T-E-09: choosing the file that was opened asks before replacing it', async ({ page }) => {
  await openApp(page);
  await stubPicker(page, 'same-first');
  await editAndOpenPopover(page);
  await page.evaluate(() => {
    window.__quoin.session.sourceHandle = { fake: true };
  });
  await page.locator('.popover .btn-primary').click();
  const dlg = page.locator('dialog[open]');
  await expect(dlg.locator('h2')).toHaveText('Replace the original file');
  await dlg.getByRole('button', { name: 'Choose another name' }).click();
  await expect.poll(() => page.evaluate(() => window.__picks.length)).toBe(2);
  await expect(page.locator('#status')).toContainText('Saved');
});

test('T-E-09: without a file picker the download path writes the right name and says only that it was downloaded', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    delete window.showSaveFilePicker;
  });
  await editAndOpenPopover(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.popover .btn-primary').click()]);
  expect(download.suggestedFilename()).toBe('pq_vba_complex (edited).xlsm');
  await expect(page.locator('#status')).toContainText('Downloaded pq_vba_complex (edited).xlsm');
  await expect(page.locator('#status')).not.toContainText('read it back');
});
