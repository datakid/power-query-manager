export const u16 = (b, o) => b[o] | (b[o + 1] << 8);
export const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
export const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 0x100000000;

export function writeU16(b, o, v) {
  b[o] = v & 0xFF;
  b[o + 1] = (v >>> 8) & 0xFF;
}

export function writeU32(b, o, v) {
  b[o] = v & 0xFF;
  b[o + 1] = (v >>> 8) & 0xFF;
  b[o + 2] = (v >>> 16) & 0xFF;
  b[o + 3] = (v >>> 24) & 0xFF;
}

export function le32(v) {
  const b = new Uint8Array(4);
  writeU32(b, 0, v);
  return b;
}

export function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function startsWith(bytes, prefix) {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64Decode(text) {
  const clean = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) continue;
    clean.push(c);
  }
  let pad = 0;
  while (clean.length && clean[clean.length - 1] === 61) {
    clean.pop();
    pad++;
  }
  if (pad > 2 || (clean.length + pad) % 4 !== 0) throw new RangeError('base64 length');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const c of clean) {
    const v = c < 256 ? B64_LOOKUP[c] : -1;
    if (v < 0) throw new RangeError('base64 character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xFF;
    }
  }
  return out;
}

export function base64Encode(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + '=';
  }
  return out;
}

export function utf8Encode(text) {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

export function decodeTextBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le', bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be', bom: true };
  }
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8', bom: true };
  }
  if (bytes.length >= 4 && bytes[0] === 0x3C && bytes[1] === 0x00 && bytes[2] === 0x3F && bytes[3] === 0x00) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', bom: false };
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x3C && bytes[2] === 0x00 && bytes[3] === 0x3F) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', bom: false };
  }
  return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', bom: false };
}

export function encodeTextBytes(text, encoding, bom) {
  if (encoding === 'utf-8') {
    const body = utf8Encode(text);
    return bom ? concat([new Uint8Array([0xEF, 0xBB, 0xBF]), body]) : body;
  }
  const big = encoding === 'utf-16be';
  const out = new Uint8Array(text.length * 2 + (bom ? 2 : 0));
  let o = 0;
  if (bom) {
    out[o++] = big ? 0xFE : 0xFF;
    out[o++] = big ? 0xFF : 0xFE;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (big) {
      out[o++] = c >> 8;
      out[o++] = c & 0xFF;
    } else {
      out[o++] = c & 0xFF;
      out[o++] = c >> 8;
    }
  }
  return out;
}
