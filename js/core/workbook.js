(function () {
  const Q = window.Q;
  const { QuoinError, u32, le32, concat, b64decode, b64encode, decodeXmlBytes, encodeXmlText, parseXml, byLocal, firstLocal, resolvePath, relsPath } = Q;
  const DM_NS = 'http://schemas.microsoft.com/DataMashup';
  const MAX_FILE = 200 * 1024 * 1024;

  async function zipEntryBytes(zip, name) {
    const f = zip.file(name);
    return f ? f.async('uint8array') : null;
  }
  async function zipText(zip, name) {
    const b = await zipEntryBytes(zip, name);
    return b ? decodeXmlBytes(b).text : null;
  }
  function findName(zip, name) {
    const low = name.toLowerCase();
    let hit = null;
    zip.forEach(p => { if (p.toLowerCase() === low) hit = p; });
    return hit;
  }

  async function readRels(zip, part) {
    const p = findName(zip, relsPath(part));
    if (!p) return [];
    const doc = parseXml(await zipText(zip, p), p);
    return byLocal(doc, 'Relationship').map(r => ({ id: r.getAttribute('Id'), type: r.getAttribute('Type') || '', target: r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target') : resolvePath(part, r.getAttribute('Target') || ''), external: r.getAttribute('TargetMode') === 'External' }));
  }

  function parseDataMashup(bytes) {
    const warn = [];
    const need = (o, n) => { if (o + n > bytes.length) throw new QuoinError('pq.length', 'The query data in this workbook is damaged.', 'DataMashup'); };
    need(0, 8);
    const version = u32(bytes, 0);
    if (version !== 0) warn.push('version');
    let o = 4;
    const n1 = u32(bytes, o); o += 4; need(o, n1);
    const pkg = bytes.subarray(o, o + n1); o += n1;
    need(o, 4); const n2 = u32(bytes, o); o += 4; need(o, n2);
    const perm = bytes.subarray(o, o + n2); o += n2;
    need(o, 4); const n3 = u32(bytes, o); o += 4; need(o, n3);
    const meta = bytes.subarray(o, o + n3); o += n3;
    need(o, 4); const n4 = u32(bytes, o); o += 4; need(o, n4);
    const bind = bytes.subarray(o, o + n4); o += n4;
    if (o !== bytes.length) warn.push('trailing');
    let metaXml = '';
    if (meta.length >= 8) {
      const m1 = u32(meta, 4);
      metaXml = decodeXmlBytes(meta.subarray(8, 8 + m1)).text;
    }
    return { version, pkg, perm, meta, bind, metaXml, warn };
  }

  function buildDataMashup(dm, pkg) {
    return concat([le32(0), le32(pkg.length), pkg, le32(dm.perm.length), dm.perm, le32(dm.meta.length), dm.meta, le32(dm.bind.length), dm.bind]);
  }

  function decodeEntry(v) {
    if (v == null) return null;
    if (/^l\d+$/.test(v)) return +v.slice(1);
    if (v[0] === 's') return v.slice(1);
    if (v[0] === 'd') return v.slice(1);
    return v;
  }

  function parseMetadata(xml) {
    const out = new Map();
    if (!xml) return out;
    let doc;
    try { doc = parseXml(xml, 'Metadata'); } catch (e) { return out; }
    byLocal(doc, 'Item').forEach(item => {
      const type = firstLocal(item, 'ItemType');
      const path = firstLocal(item, 'ItemPath');
      if (!type || type.textContent !== 'Formula' || !path) return;
      const parts = path.textContent.split('/');
      if (parts.length !== 2) return;
      const name = decodeURIComponent(parts[1]);
      const e = {};
      byLocal(item, 'Entry').forEach(en => { e[en.getAttribute('Type')] = decodeEntry(en.getAttribute('Value')); });
      out.set(name, e);
    });
    return out;
  }

  function colLetters(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function parseRef(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(ref || '');
    if (!m) return null;
    const col = s => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    return { c1: col(m[1]), r1: +m[2] - 1, c2: col(m[3] || m[1]), r2: +(m[4] || m[2]) - 1 };
  }

  function isDateFormat(fmt) {
    if (!fmt) return false;
    const f = fmt.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
    return /[ymdhs]/i.test(f) && !/^[#0.,%E+\-\s]*$/.test(f);
  }
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

  async function readSheetModel(zip, wbPart, wbDoc, wbRels) {
    const sst = [];
    const sstRel = wbRels.find(r => /\/sharedStrings$/.test(r.type));
    if (sstRel && findName(zip, sstRel.target)) {
      const d = parseXml(await zipText(zip, findName(zip, sstRel.target)), sstRel.target);
      byLocal(d, 'si').forEach(si => { sst.push(byLocal(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('')); });
    }
    const dateStyles = new Set();
    const stRel = wbRels.find(r => /\/styles$/.test(r.type));
    if (stRel && findName(zip, stRel.target)) {
      const d = parseXml(await zipText(zip, findName(zip, stRel.target)), stRel.target);
      const custom = new Map();
      byLocal(d, 'numFmt').forEach(n => custom.set(+n.getAttribute('numFmtId'), n.getAttribute('formatCode')));
      const xfs = firstLocal(d, 'cellXfs');
      if (xfs) byLocal(xfs, 'xf').forEach((xf, i) => { const id = +(xf.getAttribute('numFmtId') || 0); if (BUILTIN_DATE.has(id) || isDateFormat(custom.get(id))) dateStyles.add(i); });
    }
    const pr = firstLocal(wbDoc, 'workbookPr');
    const date1904 = !!pr && /^(1|true)$/.test(pr.getAttribute('date1904') || '');
    const sheets = [];
    for (const s of byLocal(wbDoc, 'sheet')) {
      const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
      const rel = wbRels.find(r => r.id === rid);
      if (!rel) continue;
      sheets.push({ name: s.getAttribute('name'), part: rel.target });
    }
    const cache = new Map();
    async function sheetCells(part) {
      if (cache.has(part)) return cache.get(part);
      const real = findName(zip, part);
      const cells = new Map();
      if (real) {
        const d = parseXml(await zipText(zip, real), part);
        byLocal(d, 'c').forEach(c => {
          const ref = parseRef(c.getAttribute('r'));
          if (!ref) return;
          const t = c.getAttribute('t') || 'n';
          const vEl = firstLocal(c, 'v');
          const s = +(c.getAttribute('s') || 0);
          let v = null;
          if (t === 'inlineStr') v = byLocal(c, 't').map(x => x.textContent).join('');
          else if (!vEl) v = null;
          else if (t === 's') v = sst[+vEl.textContent] ?? null;
          else if (t === 'str') v = vEl.textContent;
          else if (t === 'b') v = vEl.textContent === '1';
          else if (t === 'e') v = { err: vEl.textContent };
          else { v = +vEl.textContent; if (dateStyles.has(s)) v = { serial: v + (date1904 ? 1462 : 0) }; }
          cells.set(ref.r1 + ':' + ref.c1, v);
        });
      }
      cache.set(part, cells);
      return cells;
    }
    return { sheets, sheetCells, date1904 };
  }

  async function readTables(zip, model) {
    const tables = [];
    for (const sh of model.sheets) {
      const rels = await readRels(zip, sh.part);
      for (const r of rels.filter(x => /\/table$/.test(x.type))) {
        const real = findName(zip, r.target);
        if (!real) continue;
        const d = parseXml(await zipText(zip, real), r.target);
        const t = d.documentElement;
        const ref = parseRef(t.getAttribute('ref'));
        const cols = byLocal(d, 'tableColumn').map(c => c.getAttribute('name'));
        const hdr = +(t.getAttribute('headerRowCount') ?? 1);
        const tot = +(t.getAttribute('totalsRowCount') || 0);
        const qtRels = await readRels(zip, real);
        tables.push({ name: t.getAttribute('displayName') || t.getAttribute('name'), part: real, sheet: sh.name, sheetPart: sh.part, ref, refText: t.getAttribute('ref'), cols, hdr, tot, tableType: t.getAttribute('tableType'), queryTable: qtRels.find(x => /\/queryTable$/.test(x.type)) || null });
      }
    }
    for (const t of tables) {
      if (!t.queryTable) continue;
      const real = findName(zip, t.queryTable.target);
      if (!real) continue;
      const d = parseXml(await zipText(zip, real), real);
      t.connectionId = d.documentElement.getAttribute('connectionId');
    }
    return tables;
  }

  async function readConnections(zip) {
    const real = findName(zip, 'xl/connections.xml');
    if (!real) return [];
    const d = parseXml(await zipText(zip, real), real);
    return byLocal(d, 'connection').map(c => {
      const db = firstLocal(c, 'dbPr');
      const cs = db ? db.getAttribute('connection') || '' : '';
      const m = /Location=(?:"((?:[^"]|"")*)"|([^;]*))/i.exec(cs);
      return { id: c.getAttribute('id'), name: c.getAttribute('name'), mashup: /Microsoft\.Mashup\.OleDb/i.test(cs), location: m ? (m[1] != null ? m[1].replace(/""/g, '"') : m[2]) : null, refreshOnLoad: c.getAttribute('refreshOnLoad') === '1' };
    });
  }

  async function openWorkbook(file) {
    if (file.size > MAX_FILE) throw new QuoinError('limit.size', 'This file is larger than 200 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Q.cfb.isCfb(bytes)) {
      let names = [];
      try { names = Q.cfb.readCfb(bytes).entries.map(e => e.name); } catch (e) {}
      if (names.includes('EncryptedPackage')) throw new QuoinError('fmt.encrypted', 'This workbook is encrypted. Remove the password in Excel first.');
      throw new QuoinError('fmt.xls', 'Legacy .xls files are not supported. Save as .xlsx or .xlsm in Excel.');
    }
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4B)) throw new QuoinError('fmt.unknown', 'This is not an Excel workbook.');
    let zip;
    try { zip = await JSZip.loadAsync(bytes, { checkCRC32: true }); } catch (e) { throw new QuoinError('zip.read', 'This file could not be opened as a workbook.'); }
    let count = 0;
    zip.forEach(() => { count++; });
    if (count > 20000) throw new QuoinError('limit.entries', 'This workbook has too many parts.');
    if (findName(zip, 'xl/workbook.bin')) throw new QuoinError('fmt.xlsb', 'Binary workbooks (.xlsb) are not supported.');
    if (findName(zip, 'content.xml') && findName(zip, 'mimetype')) throw new QuoinError('fmt.ods', 'OpenDocument spreadsheets are not supported.');
    const rootRels = await readRels(zip, '');
    const officeRel = rootRels.find(r => /\/officeDocument$/.test(r.type));
    if (!officeRel || !findName(zip, officeRel.target)) throw new QuoinError('fmt.unknown', 'This is not an Excel workbook.');
    if (/purl\.oclc\.org/.test(officeRel.type)) throw new QuoinError('fmt.strict', 'Strict Open XML workbooks are not supported.');
    const wbPart = findName(zip, officeRel.target);
    const wbText = await zipText(zip, wbPart);
    if (wbText.includes('http://purl.oclc.org/ooxml/spreadsheetml/main')) throw new QuoinError('fmt.strict', 'Strict Open XML workbooks are not supported.');
    const wbDoc = parseXml(wbText, wbPart);
    const wbRels = await readRels(zip, wbPart);

    const wb = { file, name: file.name, size: file.size, bytes, zip, wbPart, wbRels, warnings: [], queries: [], modules: [], groups: [] };
    wb.ext = (/\.(xlsx|xlsm|xltx|xltm)$/i.exec(file.name) || [, 'xlsx'])[1].toLowerCase();

    wb.sheetModel = await readSheetModel(zip, wbPart, wbDoc, wbRels);
    wb.tables = await readTables(zip, wb.sheetModel);
    wb.connections = await readConnections(zip);
    wb.definedNames = byLocal(wbDoc, 'definedName').filter(n => n.getAttribute('localSheetId') == null && !/^_xlnm\./.test(n.getAttribute('name') || '')).map(n => ({ name: n.getAttribute('name'), ref: n.textContent }));

    await readMashup(wb);
    await readVba(wb);
    if (wb.vba && !/m$/.test(wb.ext)) wb.warnings.push('This file contains macros but is named .' + wb.ext + '. It will be saved as .xlsm.');
    return wb;
  }

  async function readMashup(wb) {
    const zip = wb.zip;
    let item = null;
    const names = [];
    zip.forEach(p => { if (/^customXml\/item\d+\.xml$/i.test(p)) names.push(p); });
    for (const p of names) {
      const raw = await zipEntryBytes(zip, p);
      const dec = decodeXmlBytes(raw);
      if (!dec.text.includes(DM_NS)) continue;
      const doc = parseXml(dec.text, p);
      if (doc.documentElement.localName !== 'DataMashup') continue;
      item = { part: p, dec, doc };
      break;
    }
    if (!item) {
      if (wb.connections.some(c => /Mashup=/i.test(c.name || ''))) wb.warnings.push('Saved by the Power Query add-in for Excel 2010/2013. Editing is not supported.');
      return;
    }
    const b64 = item.doc.documentElement.textContent;
    const lineLen = (/\r?\n/.test(b64.trim()) ? b64.trim().split(/\r?\n/)[0].length : 0);
    const dm = parseDataMashup(b64decode(b64));
    const inner = await JSZip.loadAsync(dm.pkg);
    const secName = findName(inner, 'Formulas/Section1.m');
    if (!secName) throw new QuoinError('pq.section', 'The query data has no Section1.m.', 'DataMashup');
    const secBytes = await inner.file(secName).async('uint8array');
    const secText = new TextDecoder('utf-8').decode(secBytes);
    const crlf = (secText.match(/\r\n/g) || []).length >= (secText.match(/(?<!\r)\n/g) || []).length;
    const meta = parseMetadata(dm.metaXml);
    let split;
    try { split = M.splitSection(secText); } catch (e) { split = { members: [] }; wb.warnings.push('The query section could not be split cleanly.'); }
    wb.mashup = { item, dm, inner, secName, secText, crlf, lineLen, bom: secBytes[0] === 0xEF, writable: dm.warn.length === 0 };
    if (dm.warn.length) wb.warnings.push("This workbook's query data uses a format Quoin does not write.");
    wb.queries = split.members.map(m => {
      const e = meta.get(m.name) || {};
      const view = crlf ? m.text.replace(/\r\n/g, '\n') : m.text;
      const conn = wb.connections.find(c => c.mashup && c.location === m.name);
      const table = conn ? wb.tables.find(t => t.connectionId === conn.id) : null;
      let load = 'Connection only', loadKind = 'conn';
      if (e.FillToDataModelEnabled === 1 || e.LoadedToAnalysisServices === 1) { load = 'Data Model'; loadKind = 'model'; }
      if (table) { load = 'Table · ' + table.sheet + '!' + table.refText; loadKind = 'table'; }
      else if (e.FillEnabled === 1 && e.FillTarget) { load = 'Table · ' + e.FillTarget; loadKind = 'table'; }
      let isFn = false;
      try { const ast = M.parse(m.text); isFn = ast.k === 'fn' || (ast.k === 'let' && false); } catch (er) {}
      return { kind: 'query', id: 'q:' + m.name, name: m.name, member: m, original: view, text: view, load, loadKind, table, conn, isFn, group: e.QueryGroupID || null };
    });
    const formulaCount = meta.size;
    if (formulaCount && formulaCount !== wb.queries.length) wb.warnings.push('Query count differs from the metadata (' + wb.queries.length + ' vs ' + formulaCount + ').');
  }

  async function readVba(wb) {
    const rel = wb.wbRels.find(r => /\/vbaProject$/.test(r.type));
    const part = rel ? findName(wb.zip, rel.target) : findName(wb.zip, 'xl/vbaProject.bin');
    if (!part) return;
    const bin = await zipEntryBytes(wb.zip, part);
    try {
      const proj = Q.vba.readVbaProject(bin);
      wb.vba = { part, proj };
      wb.signed = !!(findName(wb.zip, 'xl/vbaProjectSignature.bin') || findName(wb.zip, 'xl/vbaProjectSignatureAgile.bin') || findName(wb.zip, 'xl/vbaProjectSignatureV3.bin'));
      if (proj.locked) wb.warnings.push('This VBA project is locked in Excel. Shown read-only.');
      wb.modules = proj.modules.map(m => ({ kind: 'module', id: 'm:' + m.name, name: m.name, modKind: m.kind, mod: m, original: m.view, text: m.view, readonly: !proj.writable || !!m.error, error: m.error }));
    } catch (e) {
      wb.warnings.push(e.message || 'The VBA project could not be read.');
    }
  }

  function cellToM(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'object') {
      if (v.err) return new M.MErrCell(new M.MError('DataFormat.Error', v.err));
      if (v.serial != null) return M.lib.fromSerial(v.serial, 'datetime');
    }
    return v;
  }

  async function tableContent(wb, t) {
    const cells = await wb.sheetModel.sheetCells(t.sheetPart);
    const { ref } = t;
    const r0 = ref.r1 + (t.hdr ? 1 : 0), r1 = ref.r2 - t.tot;
    const cols = t.cols.length ? t.cols : Array.from({ length: ref.c2 - ref.c1 + 1 }, (_, i) => 'Column' + (i + 1));
    const rows = [];
    for (let r = r0; r <= r1; r++) {
      const row = [];
      for (let c = ref.c1; c <= ref.c2; c++) row.push(cellToM(cells.get(r + ':' + c)));
      rows.push(row);
    }
    return new M.MTable(cols, rows);
  }

  async function namedContent(wb, dn) {
    const m = /^'?([^'!]+)'?!(.+)$/.exec(dn.ref);
    if (!m) return null;
    const sh = wb.sheetModel.sheets.find(s => s.name === m[1]);
    const ref = parseRef(m[2].replace(/\$/g, ''));
    if (!sh || !ref) return null;
    const cells = await wb.sheetModel.sheetCells(sh.part);
    const rows = [];
    for (let r = ref.r1; r <= ref.r2; r++) { const row = []; for (let c = ref.c1; c <= ref.c2; c++) row.push(cellToM(cells.get(r + ':' + c))); rows.push(row); }
    return new M.MTable(Array.from({ length: ref.c2 - ref.c1 + 1 }, (_, i) => 'Column' + (i + 1)), rows);
  }

  async function snapshot(wb) {
    const out = [];
    for (const t of wb.tables) { try { out.push({ name: t.name, table: Q.codec.encode(await tableContent(wb, t)) }); } catch (e) {} }
    for (const dn of wb.definedNames) { try { const c = await namedContent(wb, dn); if (c) out.push({ name: dn.name, table: Q.codec.encode(c) }); } catch (e) {} }
    return out;
  }

  function rebuildSection(wb, edits) {
    const src = wb.mashup.secText;
    const nl = wb.mashup.crlf ? '\r\n' : '\n';
    const ms = wb.queries.filter(q => edits.has(q.id)).map(q => ({ q, text: edits.get(q.id) })).sort((a, b) => b.q.member.exprStart - a.q.member.exprStart);
    let out = src;
    ms.forEach(({ q, text }) => {
      const t = nl === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
      out = out.slice(0, q.member.exprStart) + t + out.slice(q.member.exprEnd);
    });
    return out;
  }

  async function writeWorkbook(wb, edits, opts) {
    const zip = await JSZip.loadAsync(wb.bytes);
    const qEdits = new Map([...edits].filter(([k]) => k.startsWith('q:')));
    const mEdits = new Map([...edits].filter(([k]) => k.startsWith('m:')).map(([k, v]) => [k.slice(2), v]));
    if (qEdits.size) {
      if (!wb.mashup.writable) throw new QuoinError('pq.write', "This workbook's query data uses a format Quoin does not write.");
      const sec = rebuildSection(wb, qEdits);
      try { M.splitSection(sec); M.splitSection(sec).members.forEach(m => M.parse(m.text)); } catch (e) { throw new QuoinError('pq.syntax', 'An edited query has a syntax error.'); }
      const inner = await JSZip.loadAsync(wb.mashup.dm.pkg);
      const enc = new TextEncoder().encode(sec);
      inner.file(wb.mashup.secName, wb.mashup.bom ? concat([new Uint8Array([0xEF, 0xBB, 0xBF]), enc]) : enc);
      const pkg = await inner.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      const dmBytes = buildDataMashup(wb.mashup.dm, pkg);
      let b64 = b64encode(dmBytes);
      if (wb.mashup.lineLen) b64 = b64.match(new RegExp('.{1,' + wb.mashup.lineLen + '}', 'g')).join('\r\n');
      const doc = wb.mashup.item.doc.cloneNode(true);
      doc.documentElement.textContent = b64;
      let xml = new XMLSerializer().serializeToString(doc);
      const decl = /^<\?xml[^>]*\?>/.exec(wb.mashup.item.dec.text);
      if (decl && !xml.startsWith('<?xml')) xml = decl[0] + xml;
      zip.file(wb.mashup.item.part, encodeXmlText(xml, wb.mashup.item.dec.enc, wb.mashup.item.dec.bom));
      if (opts.refreshOnLoad) {
        const cp = findName(zip, 'xl/connections.xml');
        if (cp) {
          const raw = decodeXmlBytes(await zip.file(cp).async('uint8array'));
          const cd = parseXml(raw.text, cp);
          const names = new Set(wb.queries.filter(q => qEdits.has(q.id)).map(q => q.name));
          byLocal(cd, 'connection').forEach(c => { const db = firstLocal(c, 'dbPr'); const cs = db ? db.getAttribute('connection') || '' : ''; const m = /Location=(?:"((?:[^"]|"")*)"|([^;]*))/i.exec(cs); const loc = m ? (m[1] != null ? m[1].replace(/""/g, '"') : m[2]) : null; if (loc && names.has(loc)) c.setAttribute('refreshOnLoad', '1'); });
          let x = new XMLSerializer().serializeToString(cd);
          const d2 = /^<\?xml[^>]*\?>/.exec(raw.text);
          if (d2 && !x.startsWith('<?xml')) x = d2[0] + x;
          zip.file(cp, encodeXmlText(x, raw.enc, raw.bom));
        }
      }
    }
    if (mEdits.size) {
      if (!wb.vba.proj.writable) throw new QuoinError('vba.write', 'This VBA project cannot be written.');
      zip.file(wb.vba.part, Q.vba.writeVbaProject(wb.vba.proj, mEdits));
      if (wb.signed) await removeSignatures(zip);
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function removeSignatures(zip) {
    const sigs = ['xl/vbaProjectSignature.bin', 'xl/vbaProjectSignatureAgile.bin', 'xl/vbaProjectSignatureV3.bin'];
    sigs.forEach(s => { const r = findName(zip, s); if (r) zip.remove(r); });
    const relP = findName(zip, 'xl/_rels/vbaProject.bin.rels');
    if (relP) zip.remove(relP);
    const ctP = findName(zip, '[Content_Types].xml');
    const ct = decodeXmlBytes(await zip.file(ctP).async('uint8array'));
    const doc = parseXml(ct.text, ctP);
    byLocal(doc, 'Override').forEach(o => { if (/vbaProjectSignature/i.test(o.getAttribute('PartName') || '')) o.parentNode.removeChild(o); });
    let x = new XMLSerializer().serializeToString(doc);
    const d = /^<\?xml[^>]*\?>/.exec(ct.text);
    if (d && !x.startsWith('<?xml')) x = d[0] + x;
    zip.file(ctP, encodeXmlText(x, ct.enc, ct.bom));
  }

  async function selfCheck(bytes, wb, edits) {
    const f = new File([bytes], wb.name);
    const back = await openWorkbook(f);
    for (const [id, text] of edits) {
      const list = id.startsWith('q:') ? back.queries : back.modules;
      const item = list.find(i => i.id === id);
      if (!item) throw new QuoinError('check.missing', 'The file could not be written safely. Nothing was downloaded.', id);
      if (item.text.replace(/\s+$/, '') !== text.replace(/\s+$/, '')) throw new QuoinError('check.mismatch', 'The file could not be written safely. Nothing was downloaded.', id);
    }
    back.queries.forEach(q => { try { M.parse(q.member.text); } catch (e) { if (edits.has(q.id)) throw new QuoinError('check.parse', 'The file could not be written safely. Nothing was downloaded.', q.id); } });
    return true;
  }

  function editedName(wb) {
    const base = wb.name.replace(/\.[^.]+$/, '');
    const ext = wb.vba ? (wb.ext === 'xltm' || wb.ext === 'xltx' ? 'xltm' : 'xlsm') : wb.ext;
    return Q.sanitizeName(base + ' (edited)', ext);
  }

  Q.workbook = { openWorkbook, writeWorkbook, selfCheck, snapshot, tableContent, editedName, parseDataMashup, buildDataMashup, colLetters };
})();
