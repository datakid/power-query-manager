import { QuoinError } from '../errors.js';

const SINGLE_BYTE = new Map([
  [874, 'windows-874'],
  [1250, 'windows-1250'],
  [1251, 'windows-1251'],
  [1252, 'windows-1252'],
  [1253, 'windows-1253'],
  [1254, 'windows-1254'],
  [1255, 'windows-1255'],
  [1256, 'windows-1256'],
  [1257, 'windows-1257'],
  [1258, 'windows-1258'],
  [10000, 'macintosh']
]);

const DOUBLE_BYTE = new Map([
  [932, 'shift_jis'],
  [936, 'gbk'],
  [949, 'euc-kr'],
  [950, 'big5']
]);

export function codePageInfo(cp) {
  if (cp === 65001) return { label: 'utf-8', kind: 'utf8' };
  if (SINGLE_BYTE.has(cp)) return { label: SINGLE_BYTE.get(cp), kind: 'single' };
  if (DOUBLE_BYTE.has(cp)) return { label: DOUBLE_BYTE.get(cp), kind: 'double' };
  return null;
}

export function isSupportedCodePage(cp) {
  return codePageInfo(cp) !== null;
}

export function decodeBytes(cp, bytes) {
  const info = codePageInfo(cp);
  if (!info) return new TextDecoder('latin1').decode(bytes);
  return new TextDecoder(info.label).decode(bytes);
}

const reverseCache = new Map();

function reverseMap(cp, label) {
  if (reverseCache.has(cp)) return reverseCache.get(cp);
  const map = new Map();
  const dec = new TextDecoder(label);
  for (let b = 0; b < 256; b++) {
    const ch = dec.decode(new Uint8Array([b]));
    if (ch.length >= 1 && ch !== '\uFFFD' && !map.has(ch)) map.set(ch, b);
  }
  reverseCache.set(cp, map);
  return map;
}

function isLeadByte(cp, b) {
  if (cp === 932) return (b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC);
  return b >= 0x81 && b <= 0xFE;
}

export function buildDoubleByteMap(cp, originalBytes) {
  const info = codePageInfo(cp);
  const dec = new TextDecoder(info.label);
  const map = new Map();
  for (let i = 0; i < originalBytes.length; ) {
    const b = originalBytes[i];
    if (b < 0x80) {
      i++;
      continue;
    }
    const len = isLeadByte(cp, b) && i + 1 < originalBytes.length ? 2 : 1;
    const seq = originalBytes.subarray(i, i + len);
    const ch = dec.decode(seq);
    if (ch && ch !== '\uFFFD' && !map.has(ch)) map.set(ch, seq.slice());
    i += len;
  }
  return map;
}

export function encodeText(cp, text, originalBytes) {
  const info = codePageInfo(cp);
  if (!info) throw new QuoinError('vba.codepage', `code page ${cp} is not supported`);
  if (info.kind === 'utf8') return new TextEncoder().encode(text);
  const out = [];
  if (info.kind === 'single') {
    const map = reverseMap(cp, info.label);
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (code < 0x80) {
        out.push(code);
        continue;
      }
      const b = map.get(ch);
      if (b === undefined) throw new QuoinError('vba.codepage', `character ${ch} cannot be saved in code page ${cp}`, String(cp));
      out.push(b);
    }
    return Uint8Array.from(out);
  }
  const known = originalBytes ? buildDoubleByteMap(cp, originalBytes) : new Map();
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const seq = known.get(ch);
    if (!seq) throw new QuoinError('vba.codepage', `character ${ch} cannot be saved in code page ${cp}`, String(cp));
    for (const b of seq) out.push(b);
  }
  return Uint8Array.from(out);
}
