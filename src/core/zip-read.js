import { QuoinError } from './errors.js';
import { u16, u32, u64, utf8Decode } from './bytes.js';
import { crc32 } from './crc32.js';
import { inflateRaw } from './inflate.js';
import { decodeCp437 } from './cp437.js';
import { DEFAULT_LIMITS } from './limits.js';

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const MAX_EOCD_SEARCH = 65557;

function findEocd(bytes) {
  const min = Math.max(0, bytes.length - MAX_EOCD_SEARCH);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (u32(bytes, i) === SIG_EOCD) {
      const commentLen = u16(bytes, i + 20);
      if (i + 22 + commentLen <= bytes.length) return i;
    }
  }
  return -1;
}

function normalizeName(raw, utf8) {
  const text = utf8 ? utf8Decode(raw) : decodeCp437(raw);
  if (text.includes('\u0000')) throw new QuoinError('zip.name', 'NUL in entry name', text.replace(/\u0000/g, '?'));
  const name = text.replace(/\\/g, '/');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new QuoinError('zip.name', 'absolute entry name', name);
  if (name.split('/').some((seg) => seg === '..')) throw new QuoinError('zip.name', 'path traversal', name);
  return name;
}

function parseZip64Extra(extra, entry) {
  let o = 0;
  while (o + 4 <= extra.length) {
    const id = u16(extra, o);
    const size = u16(extra, o + 2);
    if (id === 0x0001) {
      let p = o + 4;
      const end = o + 4 + size;
      if (entry.uncompressedSize === 0xFFFFFFFF && p + 8 <= end) {
        entry.uncompressedSize = u64(extra, p);
        p += 8;
      }
      if (entry.compressedSize === 0xFFFFFFFF && p + 8 <= end) {
        entry.compressedSize = u64(extra, p);
        p += 8;
      }
      if (entry.localHeaderOffset === 0xFFFFFFFF && p + 8 <= end) {
        entry.localHeaderOffset = u64(extra, p);
      }
      return;
    }
    o += 4 + size;
  }
}

class ZipEntry {
  constructor(archive, fields) {
    Object.assign(this, fields);
    this.archive = archive;
  }

  get isDirectory() {
    return this.name.endsWith('/');
  }

  dataStart() {
    const bytes = this.archive.bytes;
    const o = this.localHeaderOffset;
    if (o + 30 > bytes.length || u32(bytes, o) !== SIG_LOCAL) throw new QuoinError('zip.local', 'bad local header', this.name);
    const start = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28);
    if (start + this.compressedSize > bytes.length) throw new QuoinError('zip.range', 'entry data out of range', this.name);
    return start;
  }

  rawCompressed() {
    const start = this.dataStart();
    return this.archive.bytes.subarray(start, start + this.compressedSize);
  }

  async read() {
    const compressed = this.rawCompressed();
    let data;
    if (this.method === 0) {
      data = compressed;
    } else {
      data = await inflateRaw(compressed, { maxBytes: this.uncompressedSize, part: this.name });
    }
    if (data.length !== this.uncompressedSize) throw new QuoinError('zip.size', 'size mismatch', this.name);
    if (crc32(data) !== this.crc32) throw new QuoinError('zip.crc', 'checksum mismatch', this.name);
    this.archive.noteInflated(data.length);
    return data;
  }
}

export class ZipArchive {
  constructor(bytes, limits) {
    this.bytes = bytes;
    this.limits = limits;
    this.entries = [];
    this.byLowerName = new Map();
    this.inflatedTotal = 0;
  }

  get(name) {
    return this.byLowerName.get(name.toLowerCase());
  }

  has(name) {
    return this.byLowerName.has(name.toLowerCase());
  }

  noteInflated(n) {
    this.inflatedTotal += n;
    if (this.inflatedTotal > this.limits.maxTotalBytes) throw new QuoinError('limit.total', 'total inflated size exceeds the limit');
  }
}

export function readZip(bytes, limits = DEFAULT_LIMITS) {
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new QuoinError('zip.eocd', 'end of central directory not found');
  let total = u16(bytes, eocd + 10);
  let cdSize = u32(bytes, eocd + 12);
  let cdOffset = u32(bytes, eocd + 16);
  if (total === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
    const loc = eocd - 20;
    if (loc < 0 || u32(bytes, loc) !== SIG_EOCD64_LOCATOR) throw new QuoinError('zip.zip64', 'zip64 locator missing');
    const rec = u64(bytes, loc + 8);
    if (rec + 56 > bytes.length || u32(bytes, rec) !== SIG_EOCD64) throw new QuoinError('zip.zip64', 'zip64 record missing');
    total = u64(bytes, rec + 32);
    cdSize = u64(bytes, rec + 40);
    cdOffset = u64(bytes, rec + 48);
  }
  if (total > limits.maxEntries) throw new QuoinError('limit.entries', `${total} entries`);
  if (cdOffset + cdSize > bytes.length) throw new QuoinError('zip.range', 'central directory out of range');

  const archive = new ZipArchive(bytes, limits);
  let o = cdOffset;
  let declaredTotal = 0;
  for (let i = 0; i < total; i++) {
    if (o + 46 > bytes.length || u32(bytes, o) !== SIG_CENTRAL) throw new QuoinError('zip.central', 'bad central directory entry');
    const flags = u16(bytes, o + 8);
    const nameLen = u16(bytes, o + 28);
    const extraLen = u16(bytes, o + 30);
    const commentLen = u16(bytes, o + 32);
    if (o + 46 + nameLen + extraLen + commentLen > bytes.length) throw new QuoinError('zip.central', 'entry overruns central directory');
    const name = normalizeName(bytes.subarray(o + 46, o + 46 + nameLen), (flags & 0x800) !== 0);
    const extra = bytes.subarray(o + 46 + nameLen, o + 46 + nameLen + extraLen);
    const fields = {
      name,
      flags,
      method: u16(bytes, o + 10),
      modTime: u16(bytes, o + 12),
      modDate: u16(bytes, o + 14),
      crc32: u32(bytes, o + 16),
      compressedSize: u32(bytes, o + 20),
      uncompressedSize: u32(bytes, o + 24),
      localHeaderOffset: u32(bytes, o + 42),
      extra,
      comment: bytes.subarray(o + 46 + nameLen + extraLen, o + 46 + nameLen + extraLen + commentLen)
    };
    parseZip64Extra(extra, fields);
    if (flags & 1) throw new QuoinError('zip.encrypted', 'encrypted entry', name);
    if (fields.method !== 0 && fields.method !== 8) throw new QuoinError('zip.method', `method ${fields.method}`, name);
    if (fields.uncompressedSize > limits.maxEntryBytes) throw new QuoinError('limit.entry', 'entry exceeds the size limit', name);
    if (fields.uncompressedSize > limits.ratioFloorBytes && fields.uncompressedSize > fields.compressedSize * limits.maxRatio) {
      throw new QuoinError('limit.ratio', 'compression ratio exceeds the limit', name);
    }
    declaredTotal += fields.uncompressedSize;
    if (declaredTotal > limits.maxTotalBytes) throw new QuoinError('limit.total', 'declared size exceeds the limit');
    const lower = name.toLowerCase();
    if (archive.byLowerName.has(lower)) throw new QuoinError('zip.duplicate', 'duplicate entry name', name);
    const entry = new ZipEntry(archive, fields);
    archive.entries.push(entry);
    archive.byLowerName.set(lower, entry);
    o += 46 + nameLen + extraLen + commentLen;
  }
  return archive;
}
