import { writeU16 } from '../bytes.js';
import { bitCountFor } from './ovba-decompress.js';

const MAX_CANDIDATES = 512;

function compressChunk(src, start, end) {
  const n = end - start;
  const tokens = [];
  const heads = new Map();
  const insert = (i) => {
    if (i + 2 >= end) return;
    const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    let list = heads.get(key);
    if (!list) {
      list = [];
      heads.set(key, list);
    }
    list.push(i);
  };
  let i = start;
  while (i < end) {
    const d = i - start;
    let bestLen = 0;
    let bestOff = 0;
    if (d > 0 && i + 2 < end) {
      const bits = bitCountFor(d);
      const maxLen = Math.min((0xFFFF >> bits) + 3, end - i);
      const list = heads.get((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]);
      if (list) {
        let tried = 0;
        for (let k = list.length - 1; k >= 0 && tried < MAX_CANDIDATES; k--, tried++) {
          const cand = list[k];
          const off = i - cand;
          let len = 0;
          while (len < maxLen && src[cand + len] === src[i + len]) len++;
          if (len > bestLen) {
            bestLen = len;
            bestOff = off;
            if (len === maxLen) break;
          }
        }
      }
    }
    if (bestLen >= 3) {
      const bits = bitCountFor(d);
      tokens.push({ copy: true, value: ((bestOff - 1) << (16 - bits)) | (bestLen - 3) });
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
    } else {
      tokens.push({ copy: false, value: src[i] });
      insert(i);
      i++;
    }
  }
  const body = [];
  for (let t = 0; t < tokens.length; t += 8) {
    const group = tokens.slice(t, t + 8);
    let flags = 0;
    group.forEach((tok, idx) => {
      if (tok.copy) flags |= 1 << idx;
    });
    body.push(flags);
    for (const tok of group) {
      if (tok.copy) body.push(tok.value & 0xFF, (tok.value >> 8) & 0xFF);
      else body.push(tok.value);
    }
  }
  if (body.length <= 4096) {
    const chunk = new Uint8Array(2 + body.length);
    writeU16(chunk, 0, ((body.length + 2 - 3) & 0x0FFF) | 0x3000 | 0x8000);
    chunk.set(body, 2);
    return chunk;
  }
  const raw = new Uint8Array(2 + 4096);
  writeU16(raw, 0, (4098 - 3) | 0x3000);
  raw.set(src.subarray(start, end), 2);
  return raw;
}

export function compress(bytes) {
  const chunks = [];
  for (let s = 0; s < bytes.length; s += 4096) chunks.push(compressChunk(bytes, s, Math.min(s + 4096, bytes.length)));
  let total = 1;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  out[0] = 0x01;
  let o = 1;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
