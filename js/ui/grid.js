(function () {
  const UI = window.UI;
  const { h, clear } = UI;
  const ROW = 28;
  const TYPE_LABEL = { text: 'abc', number: '1.2', 'Int64.Type': '123', 'Int32.Type': '123', 'Currency.Type': '$', 'Percentage.Type': '%', logical: 'true/false', any: 'any' };

  function typeLabel(t) { return TYPE_LABEL[t] || t || 'any'; }

  function cellInfo(v) {
    if (v === null || v === undefined) return { text: 'null', cls: 'null' };
    const t = typeof v;
    if (t === 'number') return { text: fmtNum(v), cls: 'num', raw: String(v) };
    if (t === 'boolean') return { text: v ? 'TRUE' : 'FALSE', cls: '' };
    if (t === 'string') return { text: v, cls: '' };
    switch (v.t) {
      case 'err': return { text: 'Error', cls: 'err' };
      case 'dt': return { text: fmtDt(v), cls: 'num' };
      case 'du': return { text: M.durText(v.ms), cls: 'num' };
      case 'tbl': return { text: 'Table', cls: 'nest' };
      case 'list': return { text: 'List', cls: 'nest' };
      case 'rec': return { text: 'Record', cls: 'nest' };
      case 'bin': return { text: 'Binary', cls: 'nest' };
      case 'fn': return { text: 'Function', cls: 'nest' };
      case 'type': return { text: 'Type', cls: 'nest' };
      default: return { text: '…', cls: 'null' };
    }
  }

  function fmtNum(n) {
    if (!Number.isFinite(n)) return Number.isNaN(n) ? 'NaN' : (n > 0 ? 'Infinity' : '-Infinity');
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
    return M.numText(n);
  }

  function fmtDt(v) {
    const d = new Date(v.ms);
    const p = n => String(n).padStart(2, '0');
    const date = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    const time = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    if (v.k === 'date') return date;
    if (v.k === 'time') return time;
    if (v.k === 'datetimezone') return date + ' ' + time + ' ' + M.tzText(v.tz || 0);
    return date + ' ' + time;
  }

  function plain(v) {
    const i = cellInfo(v);
    if (i.cls === 'null') return '';
    return i.raw || i.text;
  }

  function asTable(v) {
    if (v && v.t === 'tbl') return v;
    if (v && v.t === 'list') return { t: 'tbl', cols: ['List'], types: ['any'], rows: v.items.map(x => [x]) };
    if (v && v.t === 'rec') return { t: 'tbl', cols: ['Name', 'Value'], types: ['text', 'any'], rows: v.names.map((n, i) => [n, v.values[i]]) };
    return { t: 'tbl', cols: ['Value'], types: ['any'], rows: [[v]] };
  }

  function createGrid(host, opts) {
    const scroller = h('div', { class: 'grid', role: 'grid', tabindex: '0', 'aria-label': 'Query result' });
    const head = h('div', { class: 'g-head', role: 'row' });
    const body = h('div', { class: 'g-body', role: 'rowgroup' });
    scroller.append(head, body);
    host.appendChild(scroller);

    let table = null, order = null, widths = [], diff = null;
    let sel = null;
    let raf = 0;

    function measure() {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '13px ' + getComputedStyle(document.body).getPropertyValue('--f-code');
      widths = table.cols.map((c, ci) => {
        let w = Math.max(ctx.measureText(c).width + 64, 72);
        for (let r = 0; r < Math.min(table.rows.length, 200); r++) w = Math.max(w, ctx.measureText(cellInfo(table.rows[r][ci]).text).width + 28);
        return Math.min(Math.ceil(w), 360);
      });
    }

    function renderHead() {
      clear(head);
      head.appendChild(h('div', { class: 'g-hcell idx', role: 'columnheader', 'aria-label': 'Row' }, '#'));
      table.cols.forEach((c, i) => {
        const btn = h('button', { class: 'g-hcell', role: 'columnheader', title: c, onclick: e => headerMenu(e.currentTarget, i) }, h('span', { class: 'nm', text: c }), h('span', { class: 'ty', text: typeLabel(table.types && table.types[i]) }));
        btn.style.width = widths[i] + 'px';
        head.appendChild(btn);
      });
    }

    function headerMenu(anchor, ci) {
      const sortBy = dir => {
        const idx = table.rows.map((_, i) => i);
        idx.sort((a, b) => dir * cmp(table.rows[a][ci], table.rows[b][ci]) || a - b);
        order = idx;
        UI.closePopovers();
        paint(true);
      };
      UI.popover(anchor, [
        h('button', { class: 'menu-item', onclick: () => sortBy(1), text: 'Sort ascending' }),
        h('button', { class: 'menu-item', onclick: () => sortBy(-1), text: 'Sort descending' }),
        h('button', { class: 'menu-item', onclick: () => { order = null; UI.closePopovers(); paint(true); }, text: 'Original order' }),
        h('div', { class: 'menu-sep' }),
        h('button', { class: 'menu-item', onclick: () => { navigator.clipboard.writeText(table.cols[ci]); UI.closePopovers(); }, text: 'Copy column name' }),
        h('div', { class: 'menu-pad muted', text: 'Sorting here changes the view only.' })
      ], { alignLeft: true });
    }

    function cmp(a, b) {
      const ka = a === null || a === undefined ? -Infinity : (typeof a === 'object' ? (a.ms ?? 0) : a);
      const kb = b === null || b === undefined ? -Infinity : (typeof b === 'object' ? (b.ms ?? 0) : b);
      if (typeof ka === typeof kb) return ka < kb ? -1 : ka > kb ? 1 : 0;
      return typeof ka === 'number' ? -1 : 1;
    }

    function paint(force) {
      raf = 0;
      if (!table) return;
      const n = table.rows.length;
      body.style.height = (n * ROW) + 'px';
      const top = scroller.scrollTop;
      const first = Math.max(0, Math.floor(top / ROW) - 8);
      const last = Math.min(n, Math.ceil((top + scroller.clientHeight) / ROW) + 8);
      if (!force && body.dataset.range === first + ':' + last) return;
      body.dataset.range = first + ':' + last;
      clear(body);
      const frag = document.createDocumentFragment();
      for (let r = first; r < last; r++) {
        const ri = order ? order[r] : r;
        const row = h('div', { class: 'g-row', role: 'row', 'aria-rowindex': r + 2 });
        row.style.top = (r * ROW) + 'px';
        row.appendChild(h('div', { class: 'g-cell idx', role: 'rowheader', text: String(r + 1) }));
        table.rows[ri].forEach((v, ci) => {
          const info = cellInfo(v);
          let cls = 'g-cell ' + info.cls;
          if (sel && r >= Math.min(sel.r0, sel.r1) && r <= Math.max(sel.r0, sel.r1) && ci >= Math.min(sel.c0, sel.c1) && ci <= Math.max(sel.c0, sel.c1)) cls += ' sel';
          let title = info.raw || (info.text.length > 30 ? info.text : null);
          if (diff && diff.has(ri + ':' + ci)) { cls += ' diff'; title = 'Differs from the cached value: ' + diff.get(ri + ':' + ci); }
          const cell = h('div', { class: cls, role: 'gridcell', title, dataset: { r: String(r), c: String(ci) }, text: info.text });
          cell.style.width = widths[ci] + 'px';
          row.appendChild(cell);
        });
        frag.appendChild(row);
      }
      body.appendChild(frag);
    }

    scroller.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => paint(false)); });
    new ResizeObserver(() => paint(true)).observe(scroller);

    scroller.addEventListener('mousedown', e => {
      const c = e.target.closest('.g-cell');
      if (!c || c.classList.contains('idx')) return;
      const r = +c.dataset.r, ci = +c.dataset.c;
      if (e.shiftKey && sel) { sel.r1 = r; sel.c1 = ci; }
      else sel = { r0: r, c0: ci, r1: r, c1: ci };
      paint(true);
      const move = ev => {
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        const cc = t && t.closest && t.closest('.g-cell');
        if (cc && !cc.classList.contains('idx')) { sel.r1 = +cc.dataset.r; sel.c1 = +cc.dataset.c; paint(true); }
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    scroller.addEventListener('click', e => {
      const c = e.target.closest('.g-cell');
      if (!c || c.classList.contains('idx')) return;
      const ri = order ? order[+c.dataset.r] : +c.dataset.r;
      const v = table.rows[ri][+c.dataset.c];
      if (c.classList.contains('err')) {
        UI.popover(c, h('dl', { class: 'err-pop' }, h('dt', { text: 'Reason' }), h('dd', { text: v.r }), h('dt', { text: 'Message' }), h('dd', { text: v.m || '' })), { alignLeft: true });
      } else if (c.classList.contains('nest') && opts.onDrill && (v.t === 'tbl' || v.t === 'list' || v.t === 'rec')) {
        opts.onDrill(asTable(v), table.cols[+c.dataset.c] + ' · row ' + (ri + 1), v.t);
      }
    });

    scroller.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel && table) {
        e.preventDefault();
        const out = [];
        for (let r = Math.min(sel.r0, sel.r1); r <= Math.max(sel.r0, sel.r1); r++) {
          const ri = order ? order[r] : r;
          const line = [];
          for (let c = Math.min(sel.c0, sel.c1); c <= Math.max(sel.c0, sel.c1); c++) line.push(plain(table.rows[ri][c]).replace(/[\t\n]/g, ' '));
          out.push(line.join('\t'));
        }
        navigator.clipboard.writeText(out.join('\n'));
      }
    });

    return {
      el: scroller,
      set(t, d) {
        table = t; order = null; sel = null; diff = d || null;
        scroller.setAttribute('aria-rowcount', String(t.rows.length + 1));
        scroller.setAttribute('aria-colcount', String(t.cols.length + 1));
        measure();
        renderHead();
        scroller.scrollTop = 0; scroller.scrollLeft = 0;
        paint(true);
      },
      setDiff(d) { diff = d; paint(true); }
    };
  }

  UI.grid = { createGrid, cellInfo, plain, asTable, typeLabel };
})();
