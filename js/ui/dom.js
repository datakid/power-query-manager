(function () {
  const UI = window.UI || (window.UI = {});

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false) continue;
      el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function svgIcon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const paths = {
      chevron: 'M6 9l6 6 6-6',
      play: 'M8 5v14l11-7z',
      stop: 'M7 7h10v10H7z',
      download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
      more: 'M5 12h.01M12 12h.01M19 12h.01',
      close: 'M6 6l12 12M18 6L6 18',
      folder: 'M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
      back: 'M15 6l-6 6 6 6'
    };
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', paths[name] || '');
    if (name === 'play' || name === 'stop') p.setAttribute('fill', 'currentColor');
    else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', name === 'more' ? '3' : '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
    svg.appendChild(p);
    return svg;
  }

  function mark(size) {
    const img = h('img', { src: 'public/mark.svg', alt: '', width: size, height: size, class: 'mark' });
    return img;
  }

  function download(bytes, name, mime) {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function popover(anchor, content, opts) {
    closePopovers();
    const pop = h('div', { class: 'popover' + (opts && opts.cls ? ' ' + opts.cls : ''), role: 'dialog' }, content);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    let left = (opts && opts.alignLeft) ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    const off = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopovers(); };
    setTimeout(() => document.addEventListener('mousedown', off), 0);
    pop._off = off;
    const f = pop.querySelector('button, input, [tabindex]');
    if (f) f.focus();
    return pop;
  }

  function closePopovers() {
    document.querySelectorAll('.popover').forEach(p => { document.removeEventListener('mousedown', p._off); p.remove(); });
  }

  function dialog(title, body, actions) {
    const dlg = h('dialog', { class: 'dialog', 'aria-label': title },
      h('header', { class: 'dialog-head' }, h('h2', { text: title }), h('button', { class: 'btn ghost icon-only', 'aria-label': 'Close', onclick: () => dlg.close() }, svgIcon('close'))),
      h('div', { class: 'dialog-body' }, body),
      actions ? h('footer', { class: 'dialog-foot' }, actions) : null);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
    return dlg;
  }

  Object.assign(UI, { h, append, clear, svgIcon, mark, download, popover, closePopovers, dialog });
})();
