import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const mark = readFileSync('public/mark.svg', 'utf8');
const inner = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect[^>]*\/>/, '');

async function render(browser, size, html) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${html}</body>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return buf;
}

const browser = await chromium.launch();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/${name}`, await render(browser, size, `<img src="data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}" width="${size}" height="${size}">`));
}
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64"><rect width="64" height="64" fill="#5F4D73"/><g transform="translate(6.4 6.4) scale(.8)">${inner}</g></svg>`;
writeFileSync('public/icon-maskable-512.png', await render(browser, 512, `<img src="data:image/svg+xml;base64,${Buffer.from(maskable).toString('base64')}" width="512" height="512">`));
await browser.close();
