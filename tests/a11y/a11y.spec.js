import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fx, ext, openApp, loadFile, item, editor, runButton } from '../e2e/helpers.js';
import { STATES, settle } from '../e2e/states.js';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function audit(page, label) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, rules: { region: { enabled: false } } }));
  const bad = result.violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad).toEqual([]);
}

for (const theme of ['light', 'dark']) {
  test(`T-A11Y-1: no axe violations across the main screens in the ${theme} theme`, async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.emulateMedia({ colorScheme: theme });
    await openApp(page);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await audit(page, `${theme} empty`);
    await loadFile(page, fx('mixed.xlsm'));
    await item(page, 'RawInput').click();
    await runButton(page).click();
    await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
    await audit(page, `${theme} query`);
    await item(page, 'Module1').click();
    await audit(page, `${theme} module`);
    await page.getByRole('button', { name: 'Settings' }).click();
    await audit(page, `${theme} settings`);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Export' }).click();
    await audit(page, `${theme} export menu`);
    await page.keyboard.press('Escape');
    await editor(page).fill(`${await editor(page).inputValue()}\n' x`);
    await page.locator('.topbar button[aria-haspopup="dialog"]').click();
    await audit(page, `${theme} download`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+?');
    await audit(page, `${theme} shortcuts`);
  });
}

test('T-A11Y-2: tab order reaches the main regions and every control shows a visible focus ring', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('mixed.xlsm'));
  await page.locator('.topbar button').first().focus();
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, cls: el.className, outline: cs.outlineStyle, width: cs.outlineWidth, label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20) };
    });
    if (!info) continue;
    seen.add(info.cls || info.tag);
    expect(info.outline, JSON.stringify(info)).not.toBe('none');
  }
  expect(seen.size).toBeGreaterThan(4);
});

test('T-A11Y-4: the rail, grid and editor expose roles and accessible names', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('mixed.xlsm'));
  await expect(page.getByRole('tree')).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'RawInput' })).toBeVisible();
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('columnheader').first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Query code: RawInput/ })).toBeVisible();
  await expect(page.getByRole('status')).toBeVisible();
});

test('the editor reports a syntax error through aria-describedby', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  await editor(page).fill('let a = in a');
  await expect.poll(async () => editor(page).getAttribute('aria-describedby')).not.toBeNull();
  const id = await editor(page).getAttribute('aria-describedby');
  await expect(page.locator(`#${id}`)).toContainText('Expected an expression.');
});

test('reduced motion removes the progress animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-fast').trim());
  expect(dur).toBe('0ms');
});

const AUDITED = ['01-empty', '03-query-selected', '05-result-10000-rows', '08-vba-module', '09-settings-dialog'];

for (const theme of ['light', 'dark']) {
  for (const id of AUDITED) {
    test(`T-I-03: axe is clean on ${id} in the ${theme} theme`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await openApp(page);
      await STATES.find((s) => s.id === id).run(page);
      await settle(page);
      await audit(page, `${theme} ${id}`);
      await ctx.close();
    });
  }
}

for (const theme of ['light', 'dark']) {
  test(`T-P-14d: axe is clean on the print preview in the ${theme} theme`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await openApp(page);
    await loadFile(page, ext('pq_simple.xlsx'));
    await item(page, 'StudentResults').click();
    await editor(page).fill('Table.FromColumns({List.Numbers(1, 200)}, {"N"})');
    await runButton(page).click();
    await page.waitForSelector('.grid-cell:not(.grid-index)');
    await page.getByRole('button', { name: 'Print' }).click();
    await page.waitForSelector('.print-page');
    await audit(page, `print preview ${theme}`);
    await ctx.close();
  });
}
