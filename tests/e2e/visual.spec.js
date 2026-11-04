import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';
import { STATES, settle } from './states.js';

const SIZES = [{ name: '1280x800', width: 1280, height: 800 }, { name: '390x844', width: 390, height: 844 }];
const THEMES = ['light', 'dark'];

for (const state of STATES) {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      test(`T-I-04: ${state.id} at ${size.name} in the ${theme} theme`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme, reducedMotion: 'reduce', acceptDownloads: true });
        const page = await ctx.newPage();
        await openApp(page);
        await state.run(page);
        await settle(page);
        const mask = state.mask ? [page.locator('#status')] : [];
        await expect(page).toHaveScreenshot(`${state.id}-${size.name}-${theme}.png`, { maxDiffPixelRatio: 0.002, mask, animations: 'disabled', caret: 'hide' });
        await ctx.close();
      });
    }
  }
}
