import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('T-B-07: h() keeps false and true as the strings "false" and "true" on state attributes', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { h } = await import('/src/ui/dom.js');
    const el = h('button', { 'aria-expanded': false, 'aria-selected': true, 'aria-pressed': false, 'aria-hidden': true, spellcheck: false, contenteditable: true, draggable: false, disabled: false, hidden: false });
    return {
      expanded: el.getAttribute('aria-expanded'),
      selected: el.getAttribute('aria-selected'),
      pressed: el.getAttribute('aria-pressed'),
      hiddenAria: el.getAttribute('aria-hidden'),
      spellcheck: el.getAttribute('spellcheck'),
      editable: el.getAttribute('contenteditable'),
      draggable: el.getAttribute('draggable'),
      disabled: el.hasAttribute('disabled'),
      hidden: el.hasAttribute('hidden')
    };
  });
  expect(out).toEqual({ expanded: 'false', selected: 'true', pressed: 'false', hiddenAria: 'true', spellcheck: 'false', editable: 'true', draggable: 'false', disabled: false, hidden: false });
});

test('T-B-07: other attributes still skip false, null and undefined', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { h } = await import('/src/ui/dom.js');
    const el = h('input', { checked: false, 'data-x': undefined, 'data-y': null, required: true });
    return { required: el.getAttribute('required'), x: el.hasAttribute('data-x'), y: el.hasAttribute('data-y') };
  });
  expect(out).toEqual({ required: '', x: false, y: false });
});
