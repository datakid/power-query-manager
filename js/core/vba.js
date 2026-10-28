(function () {
  const Q = window.Q;
  const { QuoinError, u16, u32, w16, w32 } = Q;

  function decompress(buf, start) {
    let p = start || 0;
    if (buf[p] !== 1) throw new QuoinError('ovba.sig', 'A VBA stream is not in the expected format.');
    p++;
    const out = [];
    while (p < buf.length) {
      const hdr = u16(buf, p);
      const size = (hdr & 0x0FFF) + 3;
      const compressed = (hdr & 0x8000) !== 0;
      const chunkEnd = Math.min(buf.length, p + size);
      p += 2;
      const chunkStart = out.length;
      if (!compressed) {
        for (let i = 0; i < 4096 && p < buf.length; i++) out.push(buf[p++]);
        continue;
      }
      while (p < chunkEnd) {
        const flags = buf[p++];
        for (let bit = 0; bit < 8 && p < chunkEnd; bit++) {
          if ((flags & (1 << bit)) === 0) { out.push(buf[p++]); continue; }
          const tok = u16(buf, p);
          p += 2;
          const d = out.length - chunkStart;
          let bc = 4;
          while ((1 << bc) < d) bc++;
          if (bc < 4) bc = 4;
          const lenMask = 0xFFFF >> bc;
          const off = (tok >> (16 - bc)) + 1;
          const len = (tok & lenMask) + 3;
          const src = out.length - off;
          if (src < chunkStart) throw new QuoinError('ovba.copy', 'A VBA stream is damaged.');
          for (let i = 0; i < len; i++) out.push(out[src + i]);
        }
      }
    }
    return new Uint8Array(out);
  }

  function compress(data) {
    const out = [1];
    let pos = 0;
    while (pos < data.length) {
      const chunkStart = pos;
      const chunkEnd = Math.min(data.length, pos + 4096);
      const body = [];
      while (pos < chunkEnd) {
        const flagIdx = body.length;
        body.push(0);
        let flags = 0;
        for (let bit = 0; bit < 8 && pos < chunkEnd; bit++) {
          const d = pos - chunkStart;
          let bc = 4;
          while ((1 << bc) < d) bc++;
          const lenMask = 0xFFFF >> bc;
          const maxLen = lenMask + 3;
          let bestLen = 0, bestOff = 0;
          const winStart = Math.max(chunkStart, pos - (1 << bc));
          for (let c = pos - 1; c >= winStart; c--) {
            let l = 0;
            while (pos + l < chunkEnd && l < maxLen && data[c + l] === data[pos + l]) l++;
            if (l > bestLen) { bestLen = l; bestOff = pos - c; if (l === maxLen) break; }
          }
          if (bestLen >= 3) {
            const tok = ((bestOff - 1) << (16 - bc)) | (bestLen - 3);
            body.push(tok & 0xFF, tok >> 8);
            flags |= 1 << bit;
            pos += bestLen;
          } else body.push(data[pos++]);
        }
        body[flagIdx] = flags;
      }
      if (body.length < 4096) {
        const hdr = 0xB000 | (body.length + 2 - 3);
        out.push(hdr & 0xFF, hdr >> 8);
        for (const b of body) out.push(b);
      } else {
        out.push(0xFF, 0x3F);
        for (let i = chunkStart; i < chunkStart + 4096; i++) out.push(i < data.length ? data[i] : 0);
      }
    }
    return new Uint8Array(out);
  }

  const CP = { 874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 10000: 'macintosh', 65001: 'utf-8' };
  const encoders = new Map();
  function sbcsEncoder(cp) {
    if (encoders.has(cp)) return encoders.get(cp);
    const dec = new TextDecoder(CP[cp]);
    const map = new Map();
    for (let b = 0; b < 256; b++) { const ch = dec.decode(new Uint8Array([b])); if (ch !== '\uFFFD' && !map.has(ch)) map.set(ch, b); }
    encoders.set(cp, map);
    return map;
  }
  function encodeText(text, cp, original) {
    if (cp === 65001) return { bytes: new TextEncoder().encode(text) };
    if (!CP[cp]) return { error: 'This code page cannot be written.' };
    if ([932, 936, 949, 950].includes(cp)) {
      const dec = new TextDecoder(CP[cp]);
      const known = new Map();
      if (original) {
        let i = 0;
        while (i < original.length) {
          const b = original[i];
          const two = b >= 0x80 && i + 1 < original.length;
          const seq = original.subarray(i, i + (two ? 2 : 1));
          const ch = dec.decode(seq);
          if (ch.length === 1 && ch !== '\uFFFD') known.set(ch, seq);
          i += two ? 2 : 1;
        }
      }
      const out = [];
      for (const ch of text) {
        const c = ch.codePointAt(0);
        if (c < 0x80) out.push(c);
        else if (known.has(ch)) out.push(...known.get(ch));
        else return { error: 'This character cannot be saved in code page ' + cp + ': ' + ch };
      }
      return { bytes: new Uint8Array(out) };
    }
    const map = sbcsEncoder(cp);
    const out = new Uint8Array(text.length);
    let k = 0;
    for (const ch of text) {
      const b = map.get(ch);
      if (b === undefined) return { error: 'This character cannot be saved in code page ' + cp + ': ' + ch };
      out[k++] = b;
    }
    return { bytes: out.subarray(0, k) };
  }
  function decodeText(bytes, cp) { return new TextDecoder(CP[cp] || 'windows-1252').decode(bytes); }

  function parseDir(bytes) {
    const recs = [];
    let p = 0;
    while (p + 6 <= bytes.length) {
      const id = u16(bytes, p);
      let size = u32(bytes, p + 2);
      if (id === 0x0009) size = 6;
      const data = bytes.subarray(p + 6, p + 6 + size);
      recs.push({ id, size: id === 0x0009 ? 4 : u32(bytes, p + 2), data: data.slice(), raw: bytes.slice(p, p + 6 + size) });
      p += 6 + size;
      if (id === 0x0010) break;
    }
    const proj = { codepage: 1252, name: '', modules: [], references: [], anomalies: p !== bytes.length && p < bytes.length - 1 };
    let cur = null;
    recs.forEach((r, i) => {
      switch (r.id) {
        case 0x0003: proj.codepage = u16(r.data, 0); break;
        case 0x0004: proj.name = decodeText(r.data, proj.codepage); break;
        case 0x0016: proj.references.push(decodeText(r.data, proj.codepage)); break;
        case 0x0019: cur = { name: decodeText(r.data, proj.codepage), stream: null, offset: 0, type: 'standard', offsetRec: -1 }; proj.modules.push(cur); break;
        case 0x0047: if (cur) cur.name = new TextDecoder('utf-16le').decode(r.data); break;
        case 0x001A: if (cur) cur.stream = decodeText(r.data, proj.codepage); break;
        case 0x0032: if (cur) cur.stream = new TextDecoder('utf-16le').decode(r.data); break;
        case 0x0031: if (cur) { cur.offset = u32(r.data, 0); cur.offsetRec = i; } break;
        case 0x0021: if (cur) cur.type = 'standard'; break;
        case 0x0022: if (cur) cur.type = 'class'; break;
        case 0x0025: if (cur) cur.readonly = true; break;
        case 0x002B: cur = null; break;
      }
    });
    return { recs, proj };
  }

  function serializeDir(recs) {
    const out = [];
    recs.forEach(r => {
      w16(out, r.id);
      w32(out, r.size);
      for (const b of r.data) out.push(b);
    });
    return new Uint8Array(out);
  }

  function parseProjectStream(text) {
    const info = { docs: new Set(), forms: new Set(), classes: new Set(), stds: new Set(), dpb: null };
    text.split(/\r?\n/).forEach(line => {
      const m = /^(\w+)=(.*)$/.exec(line);
      if (!m) return;
      const v = m[2].replace(/^"|"$/g, '');
      if (m[1] === 'Document') info.docs.add(v.split('/')[0]);
      else if (m[1] === 'BaseClass') info.forms.add(v);
      else if (m[1] === 'Class') info.classes.add(v);
      else if (m[1] === 'Module') info.stds.add(v);
      else if (m[1] === 'DPB') info.dpb = v;
    });
    return info;
  }

  const ATTR_RX = /^Attribute\s+(VB_\w+|\w+\.VB_\w+)\s*=/i;

  function splitAttributes(src) {
    const lines = src.split(/\r\n|\n|\r/);
    const kept = [];
    const hidden = [];
    lines.forEach((l, i) => { if (ATTR_RX.test(l)) hidden.push({ at: kept.length, line: l }); else kept.push(l); });
    if (kept.length && kept[kept.length - 1] === '') kept.pop();
    return { view: kept.join('\n'), hidden };
  }

  function joinAttributes(view, hidden) {
    const lines = view.split('\n');
    const out = [];
    let h = 0;
    for (let i = 0; i <= lines.length; i++) {
      while (h < hidden.length && hidden[h].at <= i) out.push(hidden[h++].line);
      if (i < lines.length) out.push(lines[i]);
    }
    while (h < hidden.length) out.push(hidden[h++].line);
    return out.join('\r\n') + '\r\n';
  }

  function readVbaProject(bin) {
    const cfb = Q.cfb.readCfb(bin);
    const find = p => cfb.entries.find(e => e.path.toLowerCase() === p.toLowerCase());
    const dirE = find('VBA/dir');
    if (!dirE) throw new QuoinError('vba.dir', 'The VBA project has no module list.', 'vbaProject.bin');
    const { recs, proj } = parseDir(decompress(dirE.data));
    const projE = find('PROJECT');
    const pinfo = projE ? parseProjectStream(decodeText(projE.data, proj.codepage)) : { docs: new Set(), forms: new Set(), classes: new Set(), stds: new Set(), dpb: null };
    const locked = !!pinfo.dpb && pinfo.dpb.length > 16;
    const modules = proj.modules.map(m => {
      const se = find('VBA/' + m.stream);
      let source = '', raw = new Uint8Array(0), error = null;
      try { raw = decompress(se.data, m.offset); source = decodeText(raw, proj.codepage); } catch (e) { error = e.message; }
      let kind = m.type === 'standard' ? 'standard' : 'class';
      if (pinfo.docs.has(m.name)) kind = 'document';
      else if (pinfo.forms.has(m.name)) kind = 'form';
      const split = splitAttributes(source);
      return { name: m.name, stream: m.stream, kind, source, raw, view: split.view, hidden: split.hidden, error };
    });
    return { cfb, recs, codepage: proj.codepage, name: proj.name, modules, locked, anomalies: proj.anomalies, writable: !locked && !!CP[proj.codepage] && !proj.anomalies };
  }

  function writeVbaProject(project, edits) {
    const recs = project.recs.map(r => ({ id: r.id, size: r.size, data: r.data.slice() }));
    const streams = new Map();
    project.modules.forEach((m, i) => {
      let bytes;
      if (edits.has(m.name)) {
        const enc = encodeText(joinAttributes(edits.get(m.name), m.hidden), project.codepage, m.raw);
        if (enc.error) throw new QuoinError('vba.encode', enc.error, m.name);
        bytes = enc.bytes;
      } else bytes = m.raw;
      streams.set(m.stream.toLowerCase(), compress(bytes));
    });
    let modIdx = -1;
    recs.forEach(r => {
      if (r.id === 0x0019) modIdx++;
      if (r.id === 0x0031) { r.data = new Uint8Array(4); }
    });
    const dirBytes = compress(serializeDir(recs));
    const entries = [];
    project.cfb.entries.forEach(e => {
      const lp = e.path.toLowerCase();
      if (/^vba\/__srp_/.test(lp)) return;
      if (e.type === 1) { entries.push(e); return; }
      let data = e.data;
      if (lp === 'vba/dir') data = dirBytes;
      else if (lp === 'vba/_vba_project') data = new Uint8Array([0xCC, 0x61, 0xFF, 0xFF, 0x00, 0x00, 0x00]);
      else if (lp.startsWith('vba/') && streams.has(lp.slice(4))) data = streams.get(lp.slice(4));
      entries.push(Object.assign({}, e, { data }));
    });
    return Q.cfb.writeCfb({ root: project.cfb.root, entries });
  }

  function exportModule(m, view, codepage) {
    const text = joinAttributes(view, m.hidden);
    const ext = m.kind === 'standard' ? 'bas' : m.kind === 'form' ? 'frm' : 'cls';
    let body = text;
    if (ext === 'cls' && !/^VERSION/m.test(body)) body = 'VERSION 1.0 CLASS\r\nBEGIN\r\n  MultiUse = -1  \'True\r\nEND\r\n' + body;
    if (ext === 'frm') body = '\' Form layout not included.\r\n' + body;
    const enc = encodeText(body, codepage, m.raw);
    return { ext, bytes: enc.bytes || new TextEncoder().encode(body) };
  }

  Q.vba = { decompress, compress, readVbaProject, writeVbaProject, exportModule, encodeText, joinAttributes, splitAttributes };
})();
