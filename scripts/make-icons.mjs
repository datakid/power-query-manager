import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const GROUND = '#DCE0DA';
const uri = (file) => `data:image/svg+xml;base64,${Buffer.from(readFileSync(file)).toString('base64')}`;
const mark = uri('public/mark.svg');
const maskable = uri('public/icon-maskable.svg');

async function render(browser, size, html) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${html}</body>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return buf;
}

const tile = (size, radius) => {
  const inner = Math.round(size * 0.72);
  const pad = Math.round((size - inner) / 2);
  return `<div style="width:${size}px;height:${size}px;background:${GROUND};border-radius:${radius}px;position:relative"><img src="${mark}" width="${inner}" height="${inner}" style="position:absolute;left:${pad}px;top:${pad}px"></div>`;
};

const browser = await chromium.launch();
for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, await render(browser, size, tile(size, Math.round(size * 0.22))));
  writeFileSync(`public/icon-maskable-${size}.png`, await render(browser, size, `<img src="${maskable}" width="${size}" height="${size}">`));
}
writeFileSync('public/apple-touch-icon.png', await render(browser, 180, tile(180, 0)));
await browser.close();
