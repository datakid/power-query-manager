(function () {
  const UI = window.UI;
  const { h, clear } = UI;

  function createEditor(opts) {
    const gutter = h('div', { class: 'ed-gutter', 'aria-hidden': 'true' });
    const hlInner = h('div', { class: 'ed-hl-inner' });
    const hl = h('pre', { class: 'ed-hl', 'aria-hidden': 'true' }, hlInner);
    const errId = 'ed-err-' + Math.random().toString(36).slice(2);
    const ta = h('textarea', { class: 'ed-ta', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-describedby': errId });
    const stage = h('div', { class: 'ed-stage' }, hl, ta);
    const wrap = h('div', { class: 'ed-wrap' }, gutter, stage);
    const errEl = h('span', { id: errId, class: 'sr-only' });
    const root = h('div', { class: 'ed-root' }, wrap, errEl);
    root.style.display = 'contents';

    let lang = 'm';
    let errLine = -1;
    let pending = 0;
    let findBar = null;

    function render() {
      pending = 0;
      const text = ta.value;
      const lines = UI.highlight.highlightLines(text, lang);
      clear(hlInner);
      const frag = document.createDocumentFragment();
      lines.forEach((nodes, i) => {
        const ln = h('div', { class: 'ln' + (i === errLine ? ' tk-err' : '') });
        if (!nodes.length) ln.appendChild(document.createTextNode('\u200B'));
        nodes.forEach(n => ln.appendChild(n));
        frag.appendChild(ln);
      });
      hlInner.appendChild(frag);
      renderGutter(lines.length);
      sync();
    }

    function renderGutter(n) {
      clear(gutter);
      const cur = caretLine();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) frag.appendChild(h('div', { class: (i === errLine ? 'err' : '') + (i === cur ? ' cur' : ''), text: String(i + 1) }));
      gutter.appendChild(frag);
    }

    function caretLine() { return ta.value.slice(0, ta.selectionStart).split('\n').length - 1; }

    function sync() {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
      gutter.scrollTop = ta.scrollTop;
    }

    function schedule() { if (!pending) pending = requestAnimationFrame(render); }

    function insert(text) {
      ta.focus();
      const ok = document.queryCommandSupported && document.queryCommandSupported('insertText') && document.execCommand('insertText', false, text);
      if (!ok) {
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    }

    function indentSelection(out) {
      const v = ta.value;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', e - (e > s && v[e - 1] === '\n' ? 1 : 0));
      if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      const next = block.split('\n').map(l => (out ? l.replace(/^( {1,4}|\t)/, '') : '    ' + l)).join('\n');
      ta.setSelectionRange(ls, le);
      insert(next);
      ta.setSelectionRange(ls, ls + next.length);
    }

    ta.addEventListener('input', () => { schedule(); if (opts.onChange) opts.onChange(ta.value); });
    ta.addEventListener('scroll', sync);
    ta.addEventListener('keyup', () => renderGutter(gutter.childElementCount));
    ta.addEventListener('click', () => renderGutter(gutter.childElementCount));
    ta.addEventListener('keydown', e => {
      if (ta.readOnly) return;
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey || ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n')) indentSelection(e.shiftKey);
        else insert('    ');
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const v = ta.value;
        const ls = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        const indent = /^[ \t]*/.exec(v.slice(ls))[0];
        insert('\n' + indent);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openFind();
      }
    });

    function openFind() {
      if (findBar) { findBar.querySelector('input').focus(); return; }
      const input = h('input', { type: 'text', 'aria-label': 'Find', placeholder: 'Find' });
      const mc = h('input', { type: 'checkbox', 'aria-label': 'Match case' });
      const count = h('span', { class: 'count' });
      const go = dir => {
        const q = input.value;
        if (!q) { count.textContent = ''; return; }
        const hay = mc.checked ? ta.value : ta.value.toLowerCase();
        const needle = mc.checked ? q : q.toLowerCase();
        let idx;
        if (dir > 0) { idx = hay.indexOf(needle, ta.selectionEnd); if (idx < 0) idx = hay.indexOf(needle); }
        else { idx = hay.lastIndexOf(needle, Math.max(0, ta.selectionStart - 1)); if (idx < 0) idx = hay.lastIndexOf(needle); }
        let total = 0, p = hay.indexOf(needle);
        while (p >= 0) { total++; p = hay.indexOf(needle, p + needle.length); }
        if (idx < 0) { count.textContent = 'No results'; return; }
        const nth = hay.slice(0, idx).split(needle).length;
        count.textContent = nth + ' of ' + total;
        ta.focus();
        ta.setSelectionRange(idx, idx + q.length);
        const line = ta.value.slice(0, idx).split('\n').length - 1;
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
        if (line * lh < ta.scrollTop || line * lh > ta.scrollTop + ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2);
        input.focus();
      };
      const close = () => { findBar.remove(); findBar = null; ta.focus(); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
      findBar = h('div', { class: 'find-bar', role: 'search' }, input, count,
        h('button', { class: 'btn ghost', 'aria-label': 'Previous match', onclick: () => go(-1), text: '↑' }),
        h('button', { class: 'btn ghost', 'aria-label': 'Next match', onclick: () => go(1), text: '↓' }),
        h('label', { class: 'check' }, mc, h('span', { text: 'Aa', title: 'Match case' })),
        h('button', { class: 'btn ghost icon-only', 'aria-label': 'Close find', onclick: close }, UI.svgIcon('close')));
      stage.appendChild(findBar);
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel && !sel.includes('\n')) input.value = sel;
      input.focus();
    }

    return {
      el: root,
      textarea: ta,
      set(text, language, label, readonly) {
        lang = language;
        errLine = -1;
        ta.value = text;
        ta.readOnly = !!readonly;
        ta.setAttribute('aria-label', label);
        ta.scrollTop = 0; ta.scrollLeft = 0;
        ta.setSelectionRange(0, 0);
        render();
      },
      get value() { return ta.value; },
      setError(line, msg) {
        const next = line == null ? -1 : line;
        errEl.textContent = msg || '';
        if (next !== errLine) { errLine = next; schedule(); }
      },
      focus() { ta.focus(); },
      openFind
    };
  }

  UI.createEditor = createEditor;
})();
