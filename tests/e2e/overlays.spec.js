import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, runButton } from './helpers.js';

const inside = async (page, locator) => {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
};

test('T-B-13: at 390 by 844 the export menu sits inside the viewport and Escape returns focus to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  const trigger = page.getByRole('button', { name: 'Export' });
  await trigger.focus();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = page.locator('.menu');
  await expect(menu).toBeVisible();
  expect(await inside(page, menu)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('T-B-13: clicking outside a menu closes it and returns focus to the trigger', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  const trigger = page.getByRole('button', { name: 'Export' });
  await trigger.click();
  await expect(page.locator('.menu')).toBeVisible();
  await page.locator('.statusbar').click();
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('T-B-13: a menu opened near the bottom edge flips above the trigger and stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 380 });
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await item(page, 'StudentResults').click();
  await editor(page).fill('#table({"N","T"}, {{3,"c"},{1,"a"},{2,"b"}})');
  await runButton(page).click();
  await expect(page.locator('.grid-hcell:not(.grid-index)').first()).toBeVisible();
  await page.locator('.grid-hcell:not(.grid-index)').first().click();
  const menu = page.locator('.menu');
  await expect(menu).toBeVisible();
  expect(await inside(page, menu)).toBe(true);
});

test('T-B-13: Escape closes the download popover and returns focus to the Download button', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'FinalTable').click();
  await page.locator('.topbar button[aria-haspopup="dialog"]').click();
  await expect(page.locator('.popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.popover')).toHaveCount(0);
  await expect(page.locator('.topbar button[aria-haspopup="dialog"]')).toBeFocused();
});
