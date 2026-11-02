import { QuoinError } from './errors.js';
import { writeU16, writeU32, utf8Encode, concat } from './bytes.js';
import { crc32 } from './crc32.js';
import { deflateRaw } from './inflate.js';

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const isAscii = (s) => /^[\x20-\x7E]*$/.test(s);

async function prepare(entry, now) {
  if (entry.raw) {
    const r = entry.raw;
    return {
      name: entry.name,
      method: r.method,
      crc: r.crc32,
      compressed: r.bytes,
      size: r.uncompressedSize,
      flags: (r.flags || 0) & 0x6,
      time: r.modTime,
      day: r.modDate
    };
  }
  const data = entry.data;
  if (!data) throw new QuoinError('zip.write', 'entry has no data', entry.name);
  const stamp = dosDateTime(entry.modified || now);
  const isDir = entry.name.endsWith('/');
  let method = 0;
  let compressed = data;
  if (!isDir && data.length > 0) {
    const deflated = await deflateRaw(data);
    if (deflated.length < data.length) {
      method = 8;
      compressed = deflated;
    }
  }
  return { name: entry.name, method, crc: crc32(data), compressed, size: data.length, flags: 0, time: stamp.time, day: stamp.day };
}

export async function writeZip(entries, { now = new Date() } = {}) {
  const prepared = [];
  for (const e of entries) prepared.push(await prepare(e, now));
  const parts = [];
  const central = [];
  let offset = 0;
  for (const p of prepared) {
    const nameBytes = utf8Encode(p.name);
    const flags = p.flags | (isAscii(p.name) ? 0 : 0x800);
    const local = new Uint8Array(30);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, p.method === 0 ? 10 : 20);
    writeU16(local, 6, flags);
    writeU16(local, 8, p.method);
    writeU16(local, 10, p.time);
    writeU16(local, 12, p.day);
    writeU32(local, 14, p.crc);
    writeU32(local, 18, p.compressed.length);
    writeU32(local, 22, p.size);
    writeU16(local, 26, nameBytes.length);
    writeU16(local, 28, 0);
    parts.push(local, nameBytes, p.compressed);
    const c = new Uint8Array(46);
    writeU32(c, 0, 0x02014b50);
    writeU16(c, 4, 20);
    writeU16(c, 6, p.method === 0 ? 10 : 20);
    writeU16(c, 8, flags);
    writeU16(c, 10, p.method);
    writeU16(c, 12, p.time);
    writeU16(c, 14, p.day);
    writeU32(c, 16, p.crc);
    writeU32(c, 20, p.compressed.length);
    writeU32(c, 24, p.size);
    writeU16(c, 28, nameBytes.length);
    writeU32(c, 42, offset);
    central.push(c, nameBytes);
    offset += 30 + nameBytes.length + p.compressed.length;
  }
  const cd = concat(central);
  if (prepared.length > 0xFFFE || offset + cd.length > 0xFFFFFFFE) throw new QuoinError('zip.write', 'archive too large for classic zip');
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, prepared.length);
  writeU16(eocd, 10, prepared.length);
  writeU32(eocd, 12, cd.length);
  writeU32(eocd, 16, offset);
  return concat([...parts, cd, eocd]);
}

export function rawFromEntry(entry) {
  return {
    method: entry.method,
    crc32: entry.crc32,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    flags: entry.flags,
    modTime: entry.modTime,
    modDate: entry.modDate,
    bytes: entry.rawCompressed()
  };
}
