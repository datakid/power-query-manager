import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, runButton } from './helpers.js';

test('T-I-05: every control that takes focus from the keyboard shows an outline wider than zero', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toBeVisible();
  const seen = new Set();
  await page.locator('.topbar button').first().focus();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { key: el.className || el.tagName, width: parseFloat(cs.outlineWidth), style: cs.outlineStyle, color: cs.outlineColor };
    });
    if (!info) continue;
    seen.add(info.key);
    expect(info.width, JSON.stringify(info)).toBeGreaterThan(0);
    expect(info.style, JSON.stringify(info)).not.toBe('none');
    expect(info.color, JSON.stringify(info)).not.toBe('rgba(0, 0, 0, 0)');
  }
  expect(seen.size).toBeGreaterThan(4);
});

test('T-I-06: with reduced motion requested no element has a transition or animation duration', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toBeVisible();
  const offenders = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const t = cs.transitionDuration.split(',').map((v) => parseFloat(v));
      const a = cs.animationDuration.split(',').map((v) => parseFloat(v));
      if (t.some((v) => v > 0) || a.some((v) => v > 0)) bad.push(`${el.tagName}.${el.className}`);
    }
    return bad;
  });
  expect(offenders).toEqual([]);
  await ctx.close();
});

test('T-I-06: without the preference the interface animates only colour, opacity and transform', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  const props = await page.evaluate(() => {
    const out = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.transitionProperty === 'all' && parseFloat(cs.transitionDuration) > 0) out.add('all');
      for (const p of cs.transitionProperty.split(',').map((v) => v.trim())) if (p !== 'all' && parseFloat(cs.transitionDuration) > 0) out.add(p);
    }
    return [...out];
  });
  const allowed = new Set(['background-color', 'border-color', 'color', 'opacity', 'transform']);
  expect(props.filter((p) => !allowed.has(p))).toEqual([]);
  await ctx.close();
});
