import { expect } from '@playwright/test';
import { ext, fx, loadFile, item, editor, runButton } from './helpers.js';

export async function pick(page, name) {
  const toggle = page.locator('.rail-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await item(page, name).click();
}

export async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

export const STATES = [
  { id: '01-empty', mask: false, run: async () => {} },
  {
    id: '02-empty-drag',
    mask: false,
    run: async (page) => {
      await page.evaluate(() => window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true })));
      await expect(page.locator('.dropzone.is-over')).toHaveCount(1);
    }
  },
  {
    id: '03-query-selected',
    mask: false,
    run: async (page) => {
      await loadFile(page, ext('pq_vba_complex.xlsm'));
      await pick(page, 'FinalTable');
    }
  },
  {
    id: '04-query-running',
    mask: true,
    run: async (page) => {
      await loadFile(page, fx('long-run.xlsx'));
      await pick(page, 'Slow');
      await runButton(page).click();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    }
  },
  {
    id: '05-result-10000-rows',
    mask: true,
    run: async (page) => {
      await loadFile(page, fx('csv-query.xlsx'));
      await pick(page, 'StudentResults');
      await editor(page).fill('Table.FromColumns({List.Numbers(1, 10000), List.Transform(List.Numbers(1, 10000), each _ * 2.5)}, {"N", "Double"})');
      await runButton(page).click();
      await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('1');
    }
  },
  {
    id: '06-result-differs',
    mask: true,
    run: async (page) => {
      await loadFile(page, ext('pq_vba_complex.xlsm'));
      await pick(page, 'RawInput');
      const original = await editor(page).inputValue();
      await editor(page).fill(original.replace('in\n    #"Renamed Columns"', 'in\n    Table.FirstN(#"Renamed Columns", 0)'));
      await runButton(page).click();
      await expect(page.locator('#status')).toContainText('Row count differs');
    }
  },
  {
    id: '07-parse-error',
    mask: true,
    run: async (page) => {
      await loadFile(page, ext('pq_simple.xlsx'));
      await pick(page, 'StudentResults');
      await editor(page).fill('let\n    a = 1 +\nin\n    a');
      await runButton(page).click();
      await expect(page.locator('#alert')).not.toHaveText('');
    }
  },
  {
    id: '08-vba-module',
    mask: false,
    run: async (page) => {
      await loadFile(page, ext('pq_vba_complex.xlsm'));
      await pick(page, 'Sheet1');
    }
  },
  {
    id: '09-settings-dialog',
    mask: false,
    run: async (page) => {
      await loadFile(page, ext('pq_vba_complex.xlsm'));
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.locator('dialog[open]')).toBeVisible();
    }
  }
];

