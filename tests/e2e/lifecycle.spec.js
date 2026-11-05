import { test, expect } from '@playwright/test';
import { ext, fx, openApp, loadFile, item, editor, runButton } from './helpers.js';

const cancelButton = (page) => page.getByRole('button', { name: 'Cancel' });

async function expectIdle(page) {
  await expect(runButton(page)).toBeVisible();
  await expect(cancelButton(page)).toBeHidden();
}

async function rerunWorks(page) {
  await editor(page).fill('1 + 1');
  await runButton(page).click();
  await expect(page.locator('.message.value')).toHaveText('2');
  await expectIdle(page);
}

test('T-E-05: done, error, parse error, cancelled and timeout each end idle with the right status, and a new run works', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('long-run.xlsx'));
  await item(page, 'StudentResults').click();

  await editor(page).fill('#table({"A"}, {{1}})');
  await runButton(page).click();
  await expect(page.locator('#status')).toContainText('1 row');
  await expectIdle(page);

  await editor(page).fill('error "boom"');
  await runButton(page).click();
  await expect(page.locator('.message.error')).toContainText('boom');
  await expect(page.locator('#alert')).toHaveText('Error: Expression.Error');
  await expectIdle(page);
  await rerunWorks(page);

  await editor(page).fill('let a = in');
  await runButton(page).click();
  await expect(page.locator('#alert')).toHaveText('Syntax error');
  await expectIdle(page);
  await rerunWorks(page);

  await item(page, 'Slow').click();
  await runButton(page).click();
  await expect(cancelButton(page)).toBeVisible();
  await expect(runButton(page)).toBeHidden();
  const started = Date.now();
  await cancelButton(page).click();
  await expectIdle(page);
  expect(Date.now() - started).toBeLessThan(1500);
  await expect(page.locator('#status')).toContainText('Cancelled.');
  await item(page, 'StudentResults').click();
  await rerunWorks(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-timeout').fill('1');
  await page.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
  await item(page, 'Slow').click();
  await runButton(page).click();
  await expect(page.locator('.message.warn')).toHaveText('Stopped after 1 s.', { timeout: 20000 });
  await expect(page.locator('#alert')).toHaveText('Stopped at the time limit');
  await expectIdle(page);
  await item(page, 'StudentResults').click();
  await rerunWorks(page);
});

test('T-E-05: the primary button is never both Run and Cancel', async ({ page }) => {
  await openApp(page);
  await loadFile(page, fx('long-run.xlsx'));
  await item(page, 'Slow').click();
  await runButton(page).click();
  const visible = await page.evaluate(() => [...document.querySelectorAll('.runbar button')].filter((b) => !b.hidden && /^(Run|Cancel)/.test(b.textContent)).map((b) => b.textContent.trim().split(' ')[0]));
  expect(visible).toEqual(['Cancel']);
  await page.keyboard.press('Escape');
  await expectIdle(page);
});
