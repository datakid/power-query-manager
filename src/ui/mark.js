import { h } from './dom.js';

const marks = new Set();

function effectiveTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const sourceFor = () => (effectiveTheme() === 'dark' ? 'public/mark-dark.svg' : 'public/mark.svg');

export function markImg(cls, size) {
  const img = h('img', { class: cls, src: sourceFor(), alt: '', width: String(size), height: String(size) });
  marks.add(img);
  return img;
}

export function syncMarks() {
  const src = sourceFor();
  for (const img of marks) {
    if (!img.isConnected) marks.delete(img);
    else if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }
}

export function watchMarks() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncMarks);
}
