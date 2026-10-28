(function () {
  const UI = window.UI;
  const { plain } = UI.grid;

  function guard(s, on) {
    if (!on || typeof s !== 'string') return s;
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }

  function delimited(table, sep, injectionGuard) {
    const q = v => {
      const s = String(v);
      return (s.includes(sep) || /["\r\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [table.cols.map(q).join(sep)];
    table.rows.forEach(r => lines.push(r.map(v => q(typeof v === 'number' ? plain(v) : guard(plain(v), injectionGuard))).join(sep)));
    return lines.join('\r\n') + '\r\n';
  }

  function toJson(v) {
    if (v === null || typeof v !== 'object') return v;
    switch (v.t) {
      case 'dt': case 'du': return plain(v);
      case 'err': return { error: { reason: v.r, message: v.m } };
      case 'tbl': return v.rows.map(r => { const o = {}; v.cols.forEach((c, i) => Object.defineProperty(o, c, { value: toJson(r[i]), enumerable: true })); return o; });
      case 'list': return v.items.map(toJson);
      case 'rec': { const o = {}; v.names.forEach((n, i) => Object.defineProperty(o, n, { value: toJson(v.values[i]), enumerable: true })); return o; }
      default: return null;
    }
  }

  function toXlsx(table, sheetName) {
    const aoa = [table.cols.slice()];
    table.rows.forEach(r => aoa.push(r.map(v => {
      if (v === null || v === undefined) return null;
      if (typeof v !== 'object') return v;
      if (v.t === 'dt') return new Date(v.ms + new Date(v.ms).getTimezoneOffset() * 60000);
      return plain(v);
    })));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Result').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Result');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  }

  async function zipFiles(files) {
    const z = new JSZip();
    files.forEach(f => z.file(f.name, f.data));
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  UI.exporter = { delimited, toJson, toXlsx, zipFiles };
})();
