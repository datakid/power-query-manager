(function () {
  var root = document.documentElement;
  var accents = [
    ['porcelain', '--ground', 'grounds'],
    ['celadon', '--celadon', 'primary, ok'],
    ['slate', '--slate', 'focus, selection'],
    ['ochre', '--ochre', 'edited, stale'],
    ['madder', '--madder', 'errors'],
    ['thistle', '--thistle', 'VBA, types']
  ];
  var pairs = [
    ['--ink', '--ground', 4.5], ['--ink', '--sunk', 4.5], ['--ink-2', '--surface', 4.5], ['--ink-3', '--ground', 4.5],
    ['--ink-3', '--surface', 4.5], ['--ink-3', '--sunk', 4.5], ['--ink-3', '--raised', 4.5],
    ['--on-celadon', '--celadon', 4.5], ['--on-celadon', '--celadon-hover', 4.5],
    ['--celadon-edge', '--surface', 3], ['--celadon-mark', '--ground', 3],
    ['--celadon-ink', '--surface', 4.5], ['--celadon-ink', '--celadon-soft', 4.5],
    ['--slate', '--surface', 3], ['--slate-ink', '--surface', 4.5], ['--slate-ink', '--slate-soft', 4.5], ['--on-slate', '--slate', 4.5],
    ['--ochre-ink', '--surface', 4.5], ['--ochre-ink', '--ochre-soft', 4.5], ['--ochre', '--surface', 3],
    ['--madder-ink', '--surface', 4.5], ['--madder-ink', '--madder-soft', 4.5], ['--madder', '--surface', 3],
    ['--thistle-ink', '--surface', 4.5], ['--thistle-ink', '--thistle-soft', 4.5],
    ['--on-readout', '--readout', 4.5], ['--on-readout-2', '--readout', 4.5],
    ['--syn-kw', '--surface', 4.5], ['--syn-fn', '--surface', 4.5], ['--syn-str', '--surface', 4.5], ['--syn-num', '--surface', 4.5],
    ['--syn-com', '--surface', 4.5], ['--syn-type', '--surface', 4.5], ['--line-strong', '--surface', 3], ['--line-strong', '--ground', 3]
  ];
  var code = [
    ['<span class="kw">let</span>'],
    ['  <span class="co">// from the staging layer</span>'],
    ['  Source = <span class="qi">Sales_Raw</span>,'],
    ['  #"Changed Type" = <span class="fn">Table.TransformColumnTypes</span>(Source, {{<span class="st">"Amount"</span>, <span class="ty">type number</span>}}),'],
    ['  #"Filtered Rows" = <span class="fn">Table.SelectRows</span>(#"Changed Type", <span class="kw">each</span> [Amount] &gt; <span class="nu">50</span>),', 'cur'],
    ['  #"Added Margin" = <span class="fn">Table.AddColumn</span>(#"Filtered Rows", <span class="st">"Margin"</span>, <span class="kw">each</span> [Profit] / [Amount]),'],
    ['  Grouped = <span class="fn">Table.Group</span>(#"Added Margin", {<span class="st">"Region"</span>}, {{<span class="st">"Total"</span>, <span class="kw">each</span> <span class="fn">List.Sum</span>([Amount])}})'],
    ['<span class="kw">in</span>'],
    ['  Grouped']
  ];

  function hex(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function lum(h) {
    var n = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (c) {
      c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (a, c, i) { return a + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function renderCode() {
    var host = document.getElementById('code');
    code.forEach(function (l, i) {
      var row = el('div', 'ln' + (l[1] ? ' ' + l[1] : ''));
      row.appendChild(el('span', 'n', String(i + 1)));
      var c = el('span', 'c'); c.innerHTML = l[0]; row.appendChild(c);
      host.appendChild(row);
    });
  }
  function renderSwatches() {
    var host = document.getElementById('swatches'); host.textContent = '';
    accents.forEach(function (a) {
      var s = el('div', 'sw'); var chip = el('div', 'chip'); chip.style.background = 'var(' + a[1] + ')';
      var t = el('div', 't'); t.appendChild(el('b', null, a[0])); t.appendChild(el('small', null, hex(a[1]) + ' · ' + a[2]));
      s.appendChild(chip); s.appendChild(t); host.appendChild(s);
    });
  }
  function renderPairs() {
    var host = document.getElementById('pairs'); host.textContent = '';
    pairs.forEach(function (p) {
      var fg = hex(p[0]), bg = hex(p[1]), r = ratio(fg, bg);
      var d = el('div', 'pair'); d.style.background = bg; d.style.color = fg;
      d.appendChild(el('span', null, p[0] + ' on ' + p[1]));
      var rr = el('span', 'r' + (r < p[2] ? ' bad' : ''), r.toFixed(2) + ' / ' + p[2]);
      d.appendChild(rr); host.appendChild(d);
    });
  }
  function render() { renderSwatches(); renderPairs(); }

  document.getElementById('theme').addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') === 'dark';
    if (dark) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
    this.textContent = dark ? 'Switch to dark' : 'Switch to light';
    render();
  });
  if (location.hash === '#dark') root.setAttribute('data-theme', 'dark');
  if (root.getAttribute('data-theme') === 'dark') document.getElementById('theme').textContent = 'Switch to light';
  renderCode(); render();
})();
