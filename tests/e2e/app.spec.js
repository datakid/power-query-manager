import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fx, ext, openApp, loadFile, dropFile, item, editor, runButton, status, downloadButton, runCurrent, saveDownload } from './helpers.js';
import { readZip } from '../../src/core/zip-read.js';

const tmp = mkdtempSync(join(tmpdir(), 'quoin-e2e-'));

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

test('T-E2E-1: the empty state shows the mark, tagline, drop zone and privacy line without console errors', async ({ page }) => {
  const problems = await openApp(page);
  await expect(page.locator('.empty img.mark')).toBeVisible();
  await expect(page.locator('.empty h2')).toHaveText('The working parts of a workbook.');
  await expect(page.locator('.dropzone')).toBeVisible();
  await expect(page.locator('.footnote')).toHaveText('Files stay in this tab. Nothing is uploaded or stored.');
  expect(problems).toEqual([]);
});

test('T-E2E-2: dropping a workbook fills the rail and the status line', async ({ page }) => {
  await openApp(page);
  await dropFile(page, fx('mixed.xlsm'), 'mixed.xlsm');
  await expect(page.locator('[role=treeitem][data-type=query]')).toHaveCount(3);
  await expect(page.locator('[role=treeitem][data-type=module]')).toHaveCount(3);
  await expect(status(page)).toContainText('3 queries · 3 modules');
  await expect(page.locator('.file-name')).toHaveText('mixed.xlsm');
});

test('T-E2E-3: select, run and compare a query', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await expect(editor(page)).toHaveValue(/Source = fGetNamedRange\("InputText"\)/);
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
  await expect(status(page)).toContainText(/1 row · \d\.\d\d s/);
  await expect(status(page)).toContainText('Matches the last Excel refresh');
});

test('T-E2E-4: clicking a step previews the intermediate result', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await page.getByRole('group', { name: 'Steps' }).getByRole('button', { name: 'Converted to Table' }).click();
  await expect(page.locator('.grid-hcell .hname').first()).toHaveText('Column1');
});

test('T-E2E-5 and T-E2E-12: edit, run, differ, download, reopen, revert', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  const original = await editor(page).inputValue();
  await editor(page).fill(original.replace('in\n    #"Renamed Columns"', 'in\n    Table.FirstN(#"Renamed Columns", 0)'));
  await expect(page.locator('[data-name=RawInput] .dot-edited')).toBeVisible();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.grid-cell:not(.grid-index)')).toHaveCount(0);
  await expect(status(page)).toContainText('Row count differs');
  await downloadButton(page).click();
  const target = join(tmp, 'edited.xlsm');
  const name = await saveDownload(page, page.locator('.popover .btn-primary'), target);
  expect(name).toBe('pq_vba_complex (edited).xlsm');
  const reopened = await page.context().newPage();
  reopened.on('dialog', (d) => d.accept());
  await openApp(reopened);
  await loadFile(reopened, target);
  await item(reopened, 'RawInput').click();
  await expect(editor(reopened)).toHaveValue(/Table\.FirstN\(#"Renamed Columns", 0\)/);
  await item(reopened, 'FinalTable').click();
  await expect(editor(reopened)).toHaveValue(/Raw = RawInput/);
  await reopened.close();
  await item(page, 'RawInput').click();
  await page.getByRole('button', { name: 'Revert' }).click();
  await expect(page.locator('[data-name=RawInput] .dot-edited')).toHaveCount(0);
  await downloadButton(page).click();
  await expect(page.locator('.popover')).toContainText('No changes yet.');
  await expect(page.locator('.popover .btn-primary')).toBeDisabled();
});

test('T-E2E-6: a VBA module edit survives download, and the export keeps the attribute lines', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('mixed.xlsm'));
  await item(page, 'Module1').click();
  const text = await editor(page).inputValue();
  expect(text).not.toMatch(/^Attribute /m);
  await editor(page).fill(`${text}\n' e2e marker\n`);
  await downloadButton(page).click();
  const target = join(tmp, 'vba.xlsm');
  await saveDownload(page, page.locator('.popover .btn-primary'), target);
  const reopened = await page.context().newPage();
  await openApp(reopened);
  await loadFile(reopened, target);
  await item(reopened, 'Module1').click();
  await expect(editor(reopened)).toHaveValue(/' e2e marker/);
  await expect(editor(reopened)).not.toHaveValue(/Attribute VB_Name/);
  await page.getByRole('button', { name: 'Export' }).click();
  const bas = join(tmp, 'Module1.bas');
  await saveDownload(page, page.getByRole('menuitem', { name: 'This module (.bas / .cls)' }), bas);
  const body = readFileSync(bas, 'latin1');
  expect(body).toMatch(/^Attribute VB_Name = "Module1"\r\n/);
  expect(body).toContain("' e2e marker");
  await reopened.close();
});

test('T-E2E-7: a signed VBA project gates the download behind an acknowledgement', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('signed.xlsm'));
  await item(page, 'Module1').click();
  await editor(page).fill(`${await editor(page).inputValue()}\n' x\n`);
  await downloadButton(page).click();
  await expect(page.locator('.popover')).toContainText('The VBA project was signed. Editing removes the signature.');
  const go = page.locator('.popover .btn-primary');
  await expect(go).toBeDisabled();
  await page.getByLabel('I understand').check();
  await expect(go).toBeEnabled();
  const target = join(tmp, 'unsigned.xlsm');
  await saveDownload(page, go, target);
  const names = readZip(new Uint8Array(readFileSync(target))).entries.map((e) => e.name);
  expect(names.some((n) => /vbaProjectSignature/.test(n))).toBe(false);
});

test('T-E2E-8: a CSV source asks for a file, lists the mapping, and asks again after clearing', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await item(page, 'Sales').click();
  await runButton(page).click();
  await expect(page.getByRole('dialog')).toContainText('File.Contents');
  await page.locator('#bind-file').setInputFiles(fx('sales.csv'));
  await expect(page.locator('.grid-hcell .hname').nth(0)).toHaveText('Region');
  await expect(page.locator('.grid-cell:not(.grid-index)').nth(0)).toHaveText('North');
  await expect(page.locator('.crumbs').filter({ hasText: 'Sources' })).toContainText('sales.csv');
  await page.getByRole('button', { name: 'Clear' }).click();
  await runButton(page).click();
  await expect(page.getByRole('dialog')).toContainText('File.Contents');
});

test('T-E2E-9: an unsupported function is named inline and marked in the editor', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('unsupported.xlsx'));
  await item(page, 'FromSql').click();
  await runButton(page).click();
  await expect(page.locator('.message.error')).toContainText('Sql.Database is not available in Quoin.');
  await expect(page.locator('.code-area .tok-err')).toHaveText('Sql.Database');
});

test('T-E2E-10: Esc cancels a long run', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('long-run.xlsx'));
  await item(page, 'Slow').click();
  await runButton(page).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Run/ })).toBeVisible();
  await expect(page.locator('.message')).toContainText('Cancelled.');
});

test('T-E2E-11: exports match their golden content', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').click();
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
  const exportAs = async (label, file) => {
    await page.getByRole('button', { name: 'Export' }).click();
    const target = join(tmp, file);
    const name = await saveDownload(page, page.getByRole('menuitem', { name: label }), target);
    return { name, body: readFileSync(target) };
  };
  const csv = await exportAs('CSV (UTF-8)', 'a.csv');
  expect(csv.name).toBe('RawInput.csv');
  expect(csv.body.toString('utf8')).toBe('RawInput\r\nHELLO WORLD!\r\n');
  const bom = await exportAs('CSV (UTF-8 with BOM, for Excel)', 'b.csv');
  expect([...bom.body.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
  const tsv = await exportAs('TSV', 'c.tsv');
  expect(tsv.body.toString('utf8')).toBe('RawInput\r\nHELLO WORLD!\r\n');
  const json = await exportAs('JSON (records)', 'd.json');
  expect(json.body.toString('utf8')).toBe('[{"RawInput":"HELLO WORLD!"}]');
  const xlsx = await exportAs('New .xlsx', 'e.xlsx');
  expect(xlsx.name).toBe('RawInput.xlsx');
  expect(readZip(new Uint8Array(xlsx.body)).has('xl/worksheets/sheet1.xml')).toBe(true);
  const m = await exportAs('This query (.m)', 'f.m');
  expect(m.body.toString('utf8')).toContain('Source = fGetNamedRange("InputText")');
  const zip = await exportAs('All queries (.zip of .m)', 'g.zip');
  expect(readZip(new Uint8Array(zip.body)).entries.map((e) => e.name).sort()).toEqual(['queries/FinalTable.m', 'queries/RawInput.m', 'queries/fGetNamedRange.m']);
  const all = await exportAs('Everything (.zip)', 'h.zip');
  expect(readZip(new Uint8Array(all.body)).entries.map((e) => e.name)).toEqual(expect.arrayContaining(['modules/Sheet1.cls', 'queries/RawInput.m']));
});

test('CSV formula-injection guard prefixes risky text', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('csv-query.xlsx'));
  await item(page, 'Sales').click();
  await editor(page).fill('#table({"A"}, {{"=1+1"}, {"@x"}, {"safe"}})');
  await runButton(page).click();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('=1+1');
  await page.getByRole('button', { name: 'Export' }).click();
  const target = join(tmp, 'guard.csv');
  await saveDownload(page, page.getByRole('menuitem', { name: 'CSV (UTF-8)' }), target);
  expect(readFileSync(target, 'utf8')).toBe("A\r\n'=1+1\r\n'@x\r\nsafe\r\n");
});

test('T-E2E-13: the unload prompt appears only with unsaved edits', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_simple.xlsx'));
  const prevented = () => page.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(await prevented()).toBe(false);
  await page.locator('[role=treeitem][data-type=query]').first().click();
  await editor(page).fill(`${await editor(page).inputValue()}\n// x`);
  expect(await prevented()).toBe(true);
  await page.getByRole('button', { name: 'Revert' }).click();
  expect(await prevented()).toBe(false);
});

test('T-E2E-14: the run and edit flows work from the keyboard alone', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await page.locator('[role=treeitem][data-type=query]').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(item(page, 'RawInput')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
  await editor(page).focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n// typed');
  await expect(page.locator('[data-name=RawInput] .dot-edited')).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect(page.locator('.popover')).toBeVisible();
  const target = join(tmp, 'kbd.xlsm');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  await dl.saveAs(target);
  expect(readFileSync(target).length).toBeGreaterThan(1000);
});

test('T-E2E-16: the theme persists across a reload and the system theme follows the emulated preference', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('quoin.theme'))).toBe('dark');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Theme').selectOption('system');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
});

test('T-E2E-17: the mobile layout offers a code and result switch and still downloads', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'RawInput').tap();
  await expect(page.locator('.segmented')).toBeVisible();
  await page.getByRole('button', { name: 'Result', exact: true }).tap();
  await page.getByRole('button', { name: /^Run/ }).tap();
  await expect(page.locator('.grid-cell:not(.grid-index)').first()).toHaveText('HELLO WORLD!');
  await page.getByRole('button', { name: 'Code', exact: true }).tap();
  await editor(page).fill(`${await editor(page).inputValue()}\n// m`);
  await downloadButton(page).tap();
  const target = join(tmp, 'mobile.xlsm');
  await saveDownload(page, page.locator('.popover .btn-primary'), target);
  expect(readFileSync(target).length).toBeGreaterThan(1000);
  await ctx.close();
});

test('T-E2E-18: a refused file shows its message in the drop zone and the drop zone stays usable', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('encrypted.xlsx'));
  await expect(page.locator('.empty .message')).toContainText('This workbook is encrypted. Remove the password in Excel first.');
  await expect(page.locator('.dropzone')).toBeVisible();
  await loadFile(page, ext('pq_simple.xlsx'));
  await expect(page.locator('[role=treeitem][data-type=query]')).toHaveCount(1);
});

test('T-E2E-19: a post-write self-check failure refuses the download', async ({ page }) => {
  await openApp(page, '/index.html?selfcheck=fail');
  await loadFile(page, ext('pq_simple.xlsx'));
  await page.locator('[role=treeitem][data-type=query]').first().click();
  await editor(page).fill(`${await editor(page).inputValue()}\n// x`);
  await downloadButton(page).click();
  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await page.locator('.popover .btn-primary').click();
  await expect(page.locator('.popover .warn[role=alert]')).toContainText('The file could not be written safely. Nothing was downloaded.');
  expect(downloaded).toBe(false);
  await page.waitForTimeout(300);
  expect(downloaded).toBe(false);
});

test('the self-check flag is ignored on non-local hosts', async ({ page }) => {
  await page.route('http://quoin.test/**', async (route) => {
    const response = await route.fetch({ url: route.request().url().replace('http://quoin.test', 'http://localhost:5173') });
    await route.fulfill({ response });
  });
  await openApp(page, 'http://quoin.test/index.html?selfcheck=fail');
  expect(await page.evaluate(() => window.__quoin.faultInject)).toBe(false);
});

test('editor: find, undo, tab and bracket behaviours', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ext('pq_vba_complex.xlsm'));
  await item(page, 'FinalTable').click();
  await editor(page).focus();
  await page.keyboard.press('Control+f');
  await page.locator('.findbar input[type=text]').fill('Raw');
  await expect(page.locator('.findbar')).toContainText('1/');
  await page.keyboard.press('Escape');
  await expect(page.locator('.findbar')).toBeHidden();
  await editor(page).focus();
  await page.keyboard.press('Control+End');
  const before = await editor(page).inputValue();
  await page.keyboard.type('x');
  await page.keyboard.press('Control+z');
  await expect(editor(page)).toHaveValue(before);
  await page.keyboard.press('Tab');
  expect(await editor(page).inputValue()).toBe(`${before}    `);
});
