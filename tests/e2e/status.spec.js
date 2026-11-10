import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor, runButton } from './helpers.js';

async function watch(page, selector) {
  await page.evaluate((selector) => {
    window.__seen = [];
    const el = document.querySelector(selector);
    window.__seen.push({ t: performance.now(), text: el.textContent });
    new MutationObserver(() => window.__seen.push({ t: performance.now(), text: el.textContent })).observe(el, { childList: true, characterData: true, subtree: true });
  }, selector);
}

test('T-B-15: state goes to a polite status region and errors to a separate alert region', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await expect(page.locator('#status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#alert')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#alert')).toHaveText('');
  await item(page, 'StudentResults').click();
  await editor(page).fill('let a = in');
  await runButton(page).click();
  await expect(page.locator('#alert')).not.toHaveText('');
  await expect(page.locator('#status')).not.toContainText('Error');
});

test('T-B-15: a run produces no duplicate consecutive announcements and at most one update per 500 ms', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await item(page, 'StudentResults').click();
  await watch(page, '#status');
  await editor(page).click();
  await editor(page).pressSequentially(' // typing a comment quickly', { delay: 5 });
  await runButton(page).click();
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => window.__seen);
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i].text).not.toBe(seen[i - 1].text);
    if (i >= 2) expect(seen[i].t - seen[i - 1].t).toBeGreaterThanOrEqual(450);
  }
});

test('T-B-15: an identical message sent twice is announced twice', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await watch(page, '#status');
  await page.evaluate(() => {
    window.__quoin.status.set({ note: 'Same message' });
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__quoin.status.set({ note: 'Same message' });
  });
  await page.waitForTimeout(700);
  const texts = await page.evaluate(() => window.__seen.map((s) => s.text.replace(/\u200b/g, '')));
  expect(texts.filter((t) => t.includes('Same message')).length).toBe(2);
});
