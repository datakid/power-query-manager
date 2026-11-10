import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const toHex = (rgb) => `#${rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

for (const scheme of ['light', 'dark']) {
  test(`T-B-17: the ${scheme} page background equals the declared theme colour`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const meta = await page.evaluate((scheme) => document.querySelector(`meta[name="theme-color"][media*="${scheme}"]`).content, scheme);
    expect(toHex(bg)).toBe(meta.toUpperCase());
  });
}

test('T-B-17: an explicit theme choice still wins over the system scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openApp(page);
  await page.evaluate(() => window.localStorage.setItem('quoin.theme', 'dark'));
  await page.reload();
  await page.waitForSelector('.dropzone');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
});
