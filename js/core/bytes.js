(function () {
  const Q = window.Q || (window.Q = {});

  class QuoinError extends Error {
    constructor(code, message, part) {
      super(message || code);
      this.code = code;
      this.part = part || null;
      this.isQuoin = true;
    }
  }

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;

  function w16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
  function w32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

  function concat(parts) {
    let n = 0;
    parts.forEach(p => { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }

  function le32(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }

  function b64decode(s) {
    const bin = atob(s.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function b64encode(bytes) {
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(s);
  }

  function decodeXmlBytes(bytes) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), enc: 'utf-16le', bom: true };
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), enc: 'utf-16be', bom: true };
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), enc: 'utf-8', bom: true };
    if (bytes[0] === 0x3C && bytes[1] === 0x00) return { text: new TextDecoder('utf-16le').decode(bytes), enc: 'utf-16le', bom: false };
    return { text: new TextDecoder('utf-8').decode(bytes), enc: 'utf-8', bom: false };
  }

  function encodeXmlText(text, enc, bom) {
    if (enc === 'utf-8') {
      const b = new TextEncoder().encode(text);
      return bom ? concat([new Uint8Array([0xEF, 0xBB, 0xBF]), b]) : b;
    }
    const out = new Uint8Array(text.length * 2 + (bom ? 2 : 0));
    let o = 0;
    const be = enc === 'utf-16be';
    if (bom) { out[0] = be ? 0xFE : 0xFF; out[1] = be ? 0xFF : 0xFE; o = 2; }
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (be) { out[o++] = c >> 8; out[o++] = c & 0xFF; } else { out[o++] = c & 0xFF; out[o++] = c >> 8; }
    }
    return out;
  }

  function parseXml(text, part) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new QuoinError('xml.doctype', 'This workbook contains an XML part Quoin will not read.', part);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new QuoinError('xml.parse', 'A part of this workbook could not be read.', part);
    return doc;
  }

  function byLocal(node, name) {
    const out = [];
    const all = node.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) if (all[i].localName === name) out.push(all[i]);
    return out;
  }

  function firstLocal(node, name) { return byLocal(node, name)[0] || null; }

  function sanitizeName(name, ext) {
    let base = String(name || 'quoin').replace(/[^\p{L}\p{N} ._()-]/gu, '_').trim();
    if (!base) base = 'quoin';
    const maxBase = 120 - ext.length - 1;
    if (base.length > maxBase) base = base.slice(0, maxBase);
    return base + '.' + ext;
  }

  function resolvePath(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/');
    parts.pop();
    target.split('/').forEach(seg => {
      if (seg === '..') parts.pop();
      else if (seg !== '.' && seg !== '') parts.push(seg);
    });
    return parts.join('/');
  }

  function relsPath(part) {
    const i = part.lastIndexOf('/');
    return (i < 0 ? '' : part.slice(0, i + 1)) + '_rels/' + part.slice(i + 1) + '.rels';
  }

  function fmtInt(n) { return Number(n).toLocaleString('en-US'); }

  Object.assign(Q, { QuoinError, u16, u32, w16, w32, concat, le32, b64decode, b64encode, decodeXmlBytes, encodeXmlText, parseXml, byLocal, firstLocal, sanitizeName, resolvePath, relsPath, fmtInt });
})();
