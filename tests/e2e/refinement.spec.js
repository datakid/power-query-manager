import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile } from './helpers.js';

async function openQuery(page) {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  await page.locator('.runbar .btn-primary').click();
  await page.waitForSelector('.grid-row');
}

const px = (page, selector, prop) => page.evaluate(([s, p]) => parseFloat(getComputedStyle(document.querySelector(s))[p]), [selector, prop]);

test('T-V-08: comfortable density is the default and compact tightens rows for the session', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openQuery(page);
  expect(await px(page, '.tree-item', 'minHeight')).toBe(32);
  expect(await px(page, '.grid-row .grid-cell', 'height')).toBe(30);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-density').selectOption('compact');
  await page.getByRole('button', { name: 'Save' }).click();
  expect(await px(page, '.tree-item', 'minHeight')).toBe(28);
  expect(await px(page, '.grid-row .grid-cell', 'height')).toBe(26);
  expect(await page.evaluate(() => window.localStorage.getItem('quoin.density'))).toBeNull();
});

test('T-V-04: each layer carries at most one filled primary button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openQuery(page);
  expect(await page.locator('.topbar .btn-primary, .workspace .btn-primary').count()).toBeLessThanOrEqual(1);
  await page.keyboard.press('Control+p');
  await page.waitForSelector('.print-root');
  expect(await page.locator('.print-root .btn-primary').count()).toBe(1);
});

test('T-V-05: interactive targets are at least 24 px tall on a desktop pointer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openQuery(page);
  const small = await page.evaluate(() => [...document.querySelectorAll('button, [role=treeitem] > .tree-item, select, input:not([type=checkbox]):not([type=radio])')]
    .filter((e) => e.offsetParent !== null && !e.closest('.sr-only'))
    .map((e) => ({ label: (e.textContent || e.getAttribute('aria-label') || e.className).trim().slice(0, 30), h: e.getBoundingClientRect().height }))
    .filter((e) => e.h < 24));
  expect(small).toEqual([]);
});

test('T-V-06: panes float on the ground with a gutter and the page never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openQuery(page);
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { rail: r('.rail'), head: r('.item-head'), run: r('.runbar'), res: r('.result-panel'), wrap: r('.editor-wrap'), scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, title: (() => { const t = document.querySelector('.item-title'); return t.scrollWidth <= t.clientWidth; })() };
  });
  expect(Math.round(m.head.left - m.rail.right)).toBe(8);
  expect(Math.round(m.run.top - m.wrap.bottom)).toBe(8);
  expect(Math.round(m.rail.left)).toBe(8);
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
  expect(m.title).toBe(true);
});

test('T-V-05: on touch the rail rows and controls reach 44 px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('.rail-toggle').click();
  expect(await px(page, '.tree-item', 'minHeight')).toBe(44);
  expect(await px(page, '.topbar .btn', 'minHeight')).toBe(44);
  await ctx.close();
});
