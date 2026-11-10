import { test, expect } from '@playwright/test';
import { ext, openApp, loadFile, item, editor } from './helpers.js';

const longText = (n) => Array.from({ length: n }, (_, i) => `// line ${i + 1} ->  => <= >= <> ${'x'.repeat(i % 40)}`).join('\n');

async function openLong(page, n) {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  await page.evaluate((text) => {
    const ta = document.querySelector('.editor-wrap textarea');
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, longText(n));
}

async function gotoLine(page, line) {
  await page.evaluate((line) => {
    const ta = document.querySelector('.editor-wrap textarea');
    const lines = ta.value.split('\n');
    let off = 0;
    for (let i = 0; i < line - 1; i++) off += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(off, off);
    ta.scrollTop = Math.max(0, (line - 1) * parseFloat(getComputedStyle(ta).lineHeight) - ta.clientHeight / 2);
  }, line);
}

async function alignment(page) {
  return page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight);
    const padTop = parseFloat(cs.paddingTop);
    const rect = ta.getBoundingClientRect();
    const lines = ta.value.split('\n');
    const rows = [...document.querySelectorAll('.editor-wrap pre code .ln')];
    const out = [];
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (r.bottom < rect.top + 4 || r.top > rect.bottom - 4) continue;
      const lineIndex = Math.round((r.top - rect.top - padTop + ta.scrollTop) / lh);
      out.push({ delta: Math.abs(r.top - (rect.top + padTop + lineIndex * lh - ta.scrollTop)), same: row.textContent === lines[lineIndex] });
    }
    return out;
  });
}

test('T-B-12: the highlight layer stays aligned with the caret line at line 1,500 of 2,000', async ({ page }) => {
  await openLong(page, 2000);
  await gotoLine(page, 1500);
  await page.keyboard.type('Q');
  const rows = await alignment(page);
  expect(rows.length).toBeGreaterThan(10);
  for (const r of rows) {
    expect(r.delta).toBeLessThan(1);
    expect(r.same).toBe(true);
  }
  await expect(page.locator('.gutter div').filter({ hasText: /^1500$/ })).toHaveCount(1);
});

test('T-B-12: the shared text layers disable ligatures and kerning', async ({ page }) => {
  await openLong(page, 20);
  const styles = await page.evaluate(() => {
    const pick = (el) => {
      const cs = getComputedStyle(el);
      return { ligatures: cs.fontVariantLigatures, kerning: cs.fontKerning };
    };
    return { pre: pick(document.querySelector('.editor-wrap pre')), ta: pick(document.querySelector('.editor-wrap textarea')) };
  });
  expect(styles.pre).toEqual({ ligatures: 'none', kerning: 'none' });
  expect(styles.ta).toEqual({ ligatures: 'none', kerning: 'none' });
});

test('T-B-12: Escape leaves the find bar, returns focus to the editor and keeps the selection', async ({ page }) => {
  await openLong(page, 60);
  await page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    ta.focus();
    ta.setSelectionRange(10, 14);
  });
  await page.keyboard.press('Control+f');
  await expect(page.locator('.findbar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.findbar')).toBeHidden();
  const state = await page.evaluate(() => {
    const ta = document.querySelector('.editor-wrap textarea');
    return { focused: document.activeElement === ta, start: ta.selectionStart, end: ta.selectionEnd };
  });
  expect(state).toEqual({ focused: true, start: 10, end: 14 });
});

test('T-B-12: the match count is announced once per search term, not per keystroke', async ({ page }) => {
  await openLong(page, 200);
  await page.evaluate(() => {
    window.__announced = [];
    const observe = () => {
      const live = document.querySelector('.findbar [aria-live]');
      new MutationObserver(() => window.__announced.push(live.textContent)).observe(live, { childList: true, characterData: true, subtree: true });
    };
    observe();
  });
  await editor(page).focus();
  await page.keyboard.press('Control+f');
  await page.locator('.findbar input[type=text]').pressSequentially('line 15', { delay: 40 });
  await page.waitForTimeout(700);
  const announced = await page.evaluate(() => window.__announced.filter(Boolean));
  expect(announced.length).toBe(1);
  expect(announced[0]).toMatch(/^1\/\d+/);
});
