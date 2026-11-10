(function () {
  var root = document.documentElement;
  var code = [
    ['<span class="kw">let</span>'],
    ['  <span class="co">// from the staging layer</span>'],
    ['  Source = <span class="qi">Sales_Raw</span>,'],
    ['  #"Changed Type" = <span class="fn">Table.TransformColumnTypes</span>(Source, {{<span class="st">"Amount"</span>, <span class="ty">type number</span>}}),'],
    ['  #"Filtered Rows" = <span class="fn">Table.SelectRows</span>(#"Changed Type", <span class="kw">each</span> [Amount] &gt; <span class="nu">50</span>),', 'step'],
    ['  #"Added Margin" = <span class="fn">Table.AddColumn</span>(#"Filtered Rows", <span class="st">"Margin"</span>, <span class="kw">each</span> [Profit] / [Amount]),'],
    ['  <span class="co">// bypassed: #"Removed Dupes" = Table.Distinct(#"Added Margin"),</span>'],
    ['  Grouped = <span class="fn">Table.Group</span>(#"Added Margin", {<span class="st">"Region"</span>}, {{<span class="st">"Total"</span>, <span class="kw">each</span> <span class="fn">List.Sum</span>([Amount])}})', 'err'],
    ['<span class="kw">in</span>'],
    ['  Grouped']
  ];
  var inv = [
    ['Run, Cancel', '<span class="tier t1">T1</span>top bar Run (the one filled button)', 'Ctrl Enter · Esc'],
    ['Run to here, selected, downstream, stale, all', '<span class="tier t2">T2</span>step row, selection bar <span class="tier t3">T3</span>Run menu', 'Ctrl F10 · Ctrl Shift Enter · Ctrl Alt Enter'],
    ['Review changes, Save a copy, Download', '<span class="tier t1">T1</span>Changes N <span class="tier t3">T3</span>Changes menu', 'Ctrl S'],
    ['Revert edit, item, procedure, all', '<span class="tier t2">T2</span>tab and outline rows <span class="tier t3">T3</span>item ⋯, Changes menu', '—'],
    ['Step move, rename, insert, duplicate, delete, bypass', '<span class="tier t2">T2</span>grip, step ⋯ <span class="tier t3">T3</span>context menu', 'Alt Shift ↑↓ · F2 · Insert · Ctrl D · Delete · B'],
    ['Pin, peek, step cursor', '<span class="tier t2">T2</span>step row <span class="tier t1">T1</span>result Pin', 'Ctrl Alt P · Space · F10'],
    ['Column sort, filter, profile, Add as a step', '<span class="tier t2">T2</span>header menu button <span class="tier t3">T3</span>cell context', 'Alt ↓'],
    ['Group by, sort, more filter chips', '<span class="tier t1">T1</span>4 chips <span class="tier t3">T3</span>navigator ⋯, More', '—'],
    ['Queries / VBA', '<span class="tier t1">T1</span>navigator segmented control', 'Ctrl Shift 1 · Ctrl Shift 2'],
    ['Find and replace in workbook', '<span class="tier t3">T3</span>top bar ⋯', 'Ctrl Shift F · Ctrl Alt F'],
    ['Print preview with every setting', '<span class="tier t1">T1</span>top bar Print, all settings visible in the panel', 'Ctrl P'],
    ['Theme, density, layout presets, Sources, Settings', '<span class="tier t3">T3</span>top bar ⋯', '—'],
    ['Every command', '<span class="tier">T4</span>palette and shortcut sheet', 'Ctrl K · ?']
  ];
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  var host = document.getElementById('code');
  code.forEach(function (l, i) {
    var row = el('div', 'ln' + (l[1] ? ' ' + l[1] : ''));
    row.appendChild(el('span', 'n', String(i + 1)));
    var c = el('span', 'c'); c.innerHTML = l[0]; row.appendChild(c);
    host.appendChild(row);
  });
  var tb = document.getElementById('inv');
  inv.forEach(function (r) {
    var tr = el('tr');
    var a = el('td', null, r[0]); var b = el('td'); b.innerHTML = r[1]; var c = el('td'); c.appendChild(el('span', 'kbd', r[2]));
    tr.appendChild(a); tr.appendChild(b); tr.appendChild(c); tb.appendChild(tr);
  });
  var t = document.getElementById('theme');
  function syncTheme() { t.textContent = root.getAttribute('data-theme') === 'dark' ? 'Switch to light' : 'Switch to dark'; }
  t.addEventListener('click', function () {
    if (root.getAttribute('data-theme') === 'dark') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
    syncTheme();
  });
  var d = document.getElementById('density');
  d.addEventListener('click', function () {
    var on = d.getAttribute('aria-pressed') !== 'true';
    d.setAttribute('aria-pressed', String(on));
    var s = root.style;
    if (on) { s.setProperty('--h-row', '28px'); s.setProperty('--h-ctl', '28px'); s.setProperty('--h-grid-row', '26px'); d.textContent = 'Comfortable'; }
    else { s.removeProperty('--h-row'); s.removeProperty('--h-ctl'); s.removeProperty('--h-grid-row'); d.textContent = 'Compact'; }
  });
  var rb = document.getElementById('runmenu-btn'), rm = document.getElementById('runmenu');
  rb.setAttribute('aria-expanded', 'false');
  rb.addEventListener('click', function (e) { e.stopPropagation(); rm.hidden = !rm.hidden; rb.setAttribute('aria-expanded', String(!rm.hidden)); });
  document.addEventListener('click', function () { if (!rm.hidden) { rm.hidden = true; rb.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !rm.hidden) { rm.hidden = true; rb.setAttribute('aria-expanded', 'false'); rb.focus(); } });
  if (location.hash === '#dark') root.setAttribute('data-theme', 'dark');
  syncTheme();
})();
