const STATE_ATTR = /^(aria-|contenteditable$|draggable$|spellcheck$)/;

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'boolean' && STATE_ATTR.test(k)) {
        el.setAttribute(k, String(v));
        continue;
      }
      if (v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'style') continue;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function svgImg(src, alt, size) {
  const img = h('img', { src, alt: alt || '', width: size, height: size });
  return img;
}

export function onOutside(el, handler) {
  const fn = (ev) => {
    if (!el.contains(ev.target)) handler(ev);
  };
  setTimeout(() => document.addEventListener('pointerdown', fn, true), 0);
  return () => document.removeEventListener('pointerdown', fn, true);
}

export function placeBelow(floating, anchor, align = 'left') {
  const r = anchor.getBoundingClientRect();
  floating.style.top = `${Math.round(r.bottom + 4)}px`;
  document.body.append(floating);
  const w = floating.offsetWidth;
  const left = align === 'right' ? r.right - w : r.left;
  floating.style.left = `${Math.max(8, Math.min(Math.round(left), window.innerWidth - w - 8))}px`;
}
