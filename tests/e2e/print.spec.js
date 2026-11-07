import { test, expect } from '@playwright/test';
import { ext, fx, openApp, loadFile, item, editor, runButton } from './helpers.js';

const THOUSAND = 'Table.FromColumns({List.Numbers(1, 1000), List.Transform(List.Numbers(1, 1000), each _ * 2)}, {"N", "Double"})';
const WIDE = '#table(List.Transform({1..30}, each "Column" & Text.From(_)), {{1..30}})';

async function runQuery(page, expr) {
  await item(page, 'StudentResults').click();
  await editor(page).fill(expr);
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toBeVisible({ timeout: 30000 });
}

async function openPreview(page) {
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.locator('.print-root')).toBeVisible();
  await expect(page.locator('.print-page').first()).toBeVisible();
}

const pages = (page) => page.locator('.print-page');

async function settled(page, count) {
  await expect.poll(() => pages(page).count(), { timeout: 20000 }).toBe(count);
}

test('T-P-14a: 1,000 rows at 25 per page give 40 pages and page 7 starts at row 151', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, THOUSAND);
  await openPreview(page);
  await page.locator('#pp-rows').fill('25');
  await settled(page, 40);
  await expect(page.locator('#print-summary')).toContainText('40 pages · A4 portrait · 25 rows per page');
  await expect(pages(page).nth(6).locator('tbody tr').first().locator('td').first()).toHaveText('151');
  await expect(pages(page).nth(6)).toHaveAttribute('aria-label', 'Page 7 of 40');
  await expect(pages(page).nth(39).locator('tbody tr')).toHaveCount(25);
  await expect(pages(page).nth(6).locator('footer')).toContainText('Page 7 of 40');
});

test('T-P-05b: repeated top and bottom rows appear on every page with true row numbers', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, THOUSAND);
  await openPreview(page);
  await page.locator('#pp-rows').fill('25');
  await page.locator('#pp-rep-top').fill('2');
  await page.locator('#pp-rep-bottom').fill('1');
  await expect(page.locator('#print-summary')).toContainText('rows per page');
  await expect.poll(async () => (await pages(page).count()) > 30, { timeout: 20000 }).toBe(true);
  const total = await pages(page).count();
  for (const i of [0, 1, total - 1]) {
    const pg = pages(page).nth(i);
    await expect(pg.locator('.print-table:not(.print-bottom) tr.print-rep td.pc-idx')).toHaveText(['1', '2']);
    await expect(pg.locator('.print-bottom tr.print-rep td.pc-idx')).toHaveText(['1000']);
  }
  const firstBody = await pages(page).nth(1).locator('.print-table:not(.print-bottom) tbody tr:not(.print-rep) td.pc-idx').first().textContent();
  expect(firstBody).toBe('28');
  const bottomY = await pages(page).nth(total - 1).evaluate((el) => {
    const b = el.querySelector('.print-bottom').getBoundingClientRect().bottom;
    const f = el.querySelector('.print-foot').getBoundingClientRect().top;
    return Math.abs(f - b);
  });
  expect(bottomY).toBeLessThan(2);
});

test('T-P-14c: a 30-column table is split into bands that each repeat the index column', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, WIDE);
  await openPreview(page);
  await expect.poll(() => pages(page).count()).toBeGreaterThan(1);
  const n = await pages(page).count();
  const seen = [];
  for (let i = 0; i < n; i++) {
    const heads = await pages(page).nth(i).locator('thead th').allTextContents();
    expect(heads[0]).toBe('Row');
    seen.push(...heads.slice(1));
  }
  expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => `Column${i + 1}`));
  await expect(pages(page).first().locator('header')).toContainText('Columns 1–');
  await page.locator('#pp-sticky').fill('1');
  await expect.poll(async () => (await pages(page).nth(1).locator('thead th').allTextContents())[1]).toBe('Column1');
  await expect(page.locator('#print-summary')).toContainText('A4');
});

test('T-P-14b: the generated PDF has the preview page count and A4 landscape paper', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, THOUSAND);
  await openPreview(page);
  await page.locator('#pp-orient').selectOption('landscape');
  await page.locator('#pp-rows').fill('25');
  await settled(page, 40);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const text = pdf.toString('latin1');
  const count = (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  expect(count).toBe(40);
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  expect(Math.abs(Number(box[1]) - 841.89)).toBeLessThan(1.5);
  expect(Math.abs(Number(box[2]) - 595.28)).toBeLessThan(1.5);
});

test('T-P-14b: letter portrait gives a letter-sized PDF', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, THOUSAND);
  await openPreview(page);
  await page.locator('#pp-paper').selectOption('letter');
  await page.locator('#pp-rows').fill('50');
  await settled(page, 20);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
  expect(Math.abs(Number(box[1]) - 612)).toBeLessThan(1.5);
  expect(Math.abs(Number(box[2]) - 792)).toBeLessThan(1.5);
});

test('T-P-14e: a row count that cannot fit at full size is shrunk and says so, with nothing clipped', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, THOUSAND);
  await openPreview(page);
  await page.locator('#pp-orient').selectOption('landscape');
  await page.locator('#pp-rows').fill('60');
  await expect(page.locator('.print-notes')).toContainText('of their height');
  await expect.poll(() => pages(page).count()).toBe(17);
  const overflow = await pages(page).first().evaluate((el) => {
    const rows = [...el.querySelectorAll('tbody tr')];
    const last = rows[rows.length - 1].getBoundingClientRect().bottom;
    const foot = el.querySelector('.print-foot').getBoundingClientRect().top;
    return last <= foot + 1;
  });
  expect(overflow).toBe(true);
  await page.locator('#pp-rows').fill('10');
  await expect(page.locator('.print-notes')).not.toContainText('of their height');
});

test('T-P-11b: printed code keeps true line numbers across wrapped lines and blanks the gutter on continuations', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await item(page, 'StudentResults').click();
  await editor(page).fill(`let\n    a = "${'x'.repeat(400)}",\n    b = 1\nin\n    b`);
  await openPreview(page);
  await expect(page.locator('#pp-what-code')).toBeChecked();
  const gutters = await pages(page).first().locator('.pl .pg').allTextContents();
  expect(gutters[0]).toBe('1');
  expect(gutters[1]).toBe('2');
  const blanks = gutters.slice(2).findIndex((g) => g !== '');
  expect(blanks).toBeGreaterThan(1);
  expect(gutters.slice(2 + blanks)).toEqual(['3', '4', '5']);
  await expect(pages(page).first().locator('.pl .tok-kw').first()).toHaveText('let');
  await expect(pages(page).first().locator('header')).toContainText('StudentResults');
});

test('T-P-12: changes print as a unified diff with glyphs and numbers from both sides', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await editor(page).fill((await editor(page).inputValue()).replace('Source}}', 'Source, 2}}'));
  await item(page, 'Sheet1').click();
  await editor(page).fill(`${await editor(page).inputValue()}\n' tail`);
  await openPreview(page);
  await page.locator('#pp-what-changes').check();
  await expect.poll(() => pages(page).count()).toBeGreaterThanOrEqual(2);
  const first = pages(page).first();
  await expect(first.locator('.pl.diff-del .pt').first()).toContainText('− ');
  await expect(first.locator('.pl.diff-add .pt').first()).toContainText('+ ');
  const nums = await first.locator('.pl.diff-del .pg').allTextContents();
  expect(nums[0]).toBe('3');
  expect(nums[1]).toBe('');
  await expect(first.locator('header')).toContainText('RawInput');
});

test('T-P-10: printing without the preview prints the code, or the loaded result when there is one', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await item(page, 'StudentResults').click();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.print-root.print-temp .pl').first()).toBeAttached();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.print-root')).toHaveCount(0);
  await runQuery(page, '#table({"A", "B"}, {{1, "x"}, {2, "y"}})');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.print-root.print-temp .print-table')).toBeAttached();
  await expect(page.locator('.print-root.print-temp tbody tr')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-page').first()).toBeVisible();
  await expect(page.locator('.topbar')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.print-root')).toHaveCount(0);
});

test('T-P-09: the preview is reachable from the keyboard, announces its pages and returns focus on Escape', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, THOUSAND);
  await editor(page).focus();
  await page.keyboard.press('Control+p');
  await expect(page.locator('.print-root')).toBeVisible();
  await expect(page.locator('.print-stack')).toHaveAttribute('role', 'document');
  await expect(pages(page).first()).toHaveAttribute('aria-label', /^Page 1 of \d+$/);
  await expect(page.locator('.print-panel')).toHaveAccessibleName('Print settings');
  await expect(page.locator('.print-panel legend').first()).toBeVisible();
  const focusInside = await page.evaluate(() => document.querySelector('.print-root').contains(document.activeElement));
  expect(focusInside).toBe(true);
  await page.keyboard.press('Tab');
  const stillInside = await page.evaluate(() => document.querySelector('.print-root').contains(document.activeElement));
  expect(stillInside).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.print-root')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toBeFocused();
});

test('T-P-04: a very large result asks first, names the row and page counts, and a huge one is refused', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  await runQuery(page, 'Table.FromColumns({List.Numbers(1, 30000)}, {"N"})');
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.locator('dialog[open] h2')).toHaveText('Print a large result');
  await expect(page.locator('dialog[open]')).toContainText('30,000 rows');
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.print-root')).toHaveCount(0);
  await page.getByRole('button', { name: 'Print' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Prepare pages' }).click();
  await expect(page.locator('.print-root')).toBeVisible();
  await expect.poll(() => pages(page).count(), { timeout: 60000 }).toBeGreaterThan(300);
});
