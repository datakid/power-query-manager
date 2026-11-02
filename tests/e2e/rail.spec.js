import { test, expect } from '@playwright/test';
import { openApp, loadFile, fx } from './helpers.js';

const items = (page) => page.locator('[role=treeitem][data-name]');

test('T-B-10: the rail has one tab stop, arrows move selection and focus, and nothing is rebuilt', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 280 });
  await openApp(page);
  await loadFile(page, fx('mixed.xlsm'));
  const names = await items(page).evaluateAll((els) => els.map((e) => e.dataset.name));
  expect(names.length).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.rail [role=treeitem][tabindex="0"]')).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute('tabindex', '0');

  await items(page).first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(items(page).nth(2)).toBeFocused();
  await expect(items(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(items(page).nth(2)).toHaveAttribute('tabindex', '0');
  const marker = await items(page).nth(2).evaluate((el) => {
    el.dataset.probe = 'same-node';
    return el.dataset.probe;
  });
  expect(marker).toBe('same-node');

  await page.keyboard.press('ArrowDown');
  await expect(items(page).nth(3)).toBeFocused();
  await expect(items(page).nth(2)).toHaveAttribute('aria-selected', 'false');
  await expect(items(page).nth(3)).toHaveAttribute('aria-selected', 'true');
  expect(await items(page).nth(2).evaluate((el) => el.dataset.probe)).toBe('same-node');
  await expect(page.locator('.rail [role=treeitem][tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press('End');
  await expect(items(page).last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items(page).first()).toBeFocused();
  await expect(items(page).first()).toHaveAttribute('aria-selected', 'true');
});

test('T-B-10: type-ahead jumps to the next item starting with the letter', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('mixed.xlsm'));
  const names = await items(page).evaluateAll((els) => els.map((e) => e.dataset.name));
  await items(page).first().focus();
  const target = names.findIndex((n, i) => i > 0 && n[0].toLowerCase() !== names[0][0].toLowerCase());
  await page.keyboard.press(names[target][0].toLowerCase());
  const focusedName = await page.evaluate(() => document.activeElement.dataset.name);
  expect(focusedName[0].toLowerCase()).toBe(names[target][0].toLowerCase());
});

test('T-B-10: selecting an item by click keeps the rail scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 260 });
  await openApp(page);
  await loadFile(page, fx('mixed.xlsm'));
  const scrollable = await page.locator('.rail').evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrollable).toBe(true);
  await page.locator('.rail').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const before = await page.locator('.rail').evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await items(page).last().click();
  const after = await page.locator('.rail').evaluate((el) => el.scrollTop);
  expect(after).toBe(before);
  await expect(items(page).last()).toHaveAttribute('aria-selected', 'true');
});
