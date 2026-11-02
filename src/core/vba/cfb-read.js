import { QuoinError } from '../errors.js';
import { u16, u32, startsWith } from '../bytes.js';
import { DEFAULT_LIMITS } from '../limits.js';

export const CFB_SIGNATURE = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
export const FREESECT = 0xFFFFFFFF;
export const ENDOFCHAIN = 0xFFFFFFFE;
export const FATSECT = 0xFFFFFFFD;
export const DIFSECT = 0xFFFFFFFC;
export const NOSTREAM = 0xFFFFFFFF;

export const isCfb = (bytes) => startsWith(bytes, CFB_SIGNATURE);

function decodeName(bytes, o, nameLen) {
  const len = Math.max(0, Math.min(nameLen, 64));
  const end = len >= 2 ? len - 2 : 0;
  let s = '';
  for (let i = 0; i < end; i += 2) s += String.fromCharCode(bytes[o + i] | (bytes[o + i + 1] << 8));
  return s;
}

export function readCfb(bytes, limits = DEFAULT_LIMITS) {
  if (bytes.length < 512 || !isCfb(bytes)) throw new QuoinError('cfb.header', 'signature mismatch');
  const major = u16(bytes, 26);
  const minor = u16(bytes, 24);
  if (u16(bytes, 28) !== 0xFFFE) throw new QuoinError('cfb.header', 'byte order');
  const sectorShift = u16(bytes, 30);
  const miniShift = u16(bytes, 32);
  if (!((major === 3 && sectorShift === 9) || (major === 4 && sectorShift === 12))) throw new QuoinError('cfb.header', 'version or sector size');
  if (miniShift !== 6) throw new QuoinError('cfb.header', 'mini sector size');
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << miniShift;
  const cutoff = u32(bytes, 56);
  const totalSectors = Math.floor((bytes.length - sectorSize) / sectorSize);
  if (totalSectors > limits.maxCfbSectors) throw new QuoinError('limit.cfb', 'too many sectors');

  const sectorOffset = (n) => (n + 1) * sectorSize;
  const checkSector = (n) => {
    if (n >= totalSectors) throw new QuoinError('cfb.range', `sector ${n} is out of range`);
  };

  const numFat = u32(bytes, 44);
  const firstDir = u32(bytes, 48);
  const firstMiniFat = u32(bytes, 60);
  const numMiniFat = u32(bytes, 64);
  const firstDifat = u32(bytes, 68);
  const numDifat = u32(bytes, 72);
  if (numFat > limits.maxCfbSectors) throw new QuoinError('limit.cfb', 'too many FAT sectors');

  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i++) {
    const s = u32(bytes, 76 + i * 4);
    if (s === FREESECT) break;
    fatSectors.push(s);
  }
  let difat = firstDifat;
  const seenDifat = new Set();
  for (let k = 0; k < numDifat && difat !== ENDOFCHAIN && difat !== FREESECT; k++) {
    if (seenDifat.has(difat)) throw new QuoinError('cfb.loop', 'DIFAT chain loops');
    seenDifat.add(difat);
    checkSector(difat);
    const base = sectorOffset(difat);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per && fatSectors.length < numFat; i++) {
      const s = u32(bytes, base + i * 4);
      if (s === FREESECT) continue;
      fatSectors.push(s);
    }
    difat = u32(bytes, base + per * 4);
  }
  const fat = [];
  for (const s of fatSectors) {
    checkSector(s);
    const base = sectorOffset(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(bytes, base + i * 4));
  }

  const readChainSectors = (start) => {
    const list = [];
    const seen = new Set();
    let s = start;
    while (s !== ENDOFCHAIN) {
      if (s === FREESECT || s === FATSECT || s === DIFSECT) throw new QuoinError('cfb.chain', 'chain hits a special sector');
      if (seen.has(s)) throw new QuoinError('cfb.loop', 'FAT chain loops');
      checkSector(s);
      if (s >= fat.length) throw new QuoinError('cfb.range', 'FAT index out of range');
      seen.add(s);
      list.push(s);
      if (list.length > fat.length) throw new QuoinError('cfb.loop', 'chain longer than the FAT');
      s = fat[s];
    }
    return list;
  };

  const readRegular = (start, size) => {
    if (size === 0) return new Uint8Array(0);
    const sectors = readChainSectors(start);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) => out.set(bytes.subarray(sectorOffset(s), sectorOffset(s) + sectorSize), i * sectorSize));
    if (size !== null) {
      if (size > out.length) throw new QuoinError('cfb.short', 'stream shorter than its declared size');
      return out.slice(0, size);
    }
    return out;
  };

  const dirBytes = readRegular(firstDir, null);
  const dirEntries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const type = dirBytes[o + 66];
    const nameLen = u16(dirBytes, o + 64);
    dirEntries.push({
      id: o / 128,
      name: decodeName(dirBytes, o, nameLen),
      type,
      color: dirBytes[o + 67],
      left: u32(dirBytes, o + 68),
      right: u32(dirBytes, o + 72),
      child: u32(dirBytes, o + 76),
      clsid: dirBytes.slice(o + 80, o + 96),
      stateBits: u32(dirBytes, o + 96),
      created: dirBytes.slice(o + 100, o + 108),
      modified: dirBytes.slice(o + 108, o + 116),
      start: u32(dirBytes, o + 116),
      size: major === 3 ? u32(dirBytes, o + 120) : u32(dirBytes, o + 120) + u32(dirBytes, o + 124) * 0x100000000
    });
  }
  if (!dirEntries.length || dirEntries[0].type !== 5) throw new QuoinError('cfb.root', 'root entry missing');
  const rootEntry = dirEntries[0];

  const miniFat = [];
  if (numMiniFat && firstMiniFat !== ENDOFCHAIN) {
    const mf = readRegular(firstMiniFat, null);
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
  }
  let miniStream = null;
  const getMiniStream = () => {
    if (!miniStream) miniStream = rootEntry.start === ENDOFCHAIN ? new Uint8Array(0) : readRegular(rootEntry.start, rootEntry.size);
    return miniStream;
  };
  const readMini = (start, size) => {
    if (size === 0) return new Uint8Array(0);
    const ms = getMiniStream();
    const out = new Uint8Array(Math.ceil(size / miniSize) * miniSize);
    const seen = new Set();
    let s = start;
    let n = 0;
    while (s !== ENDOFCHAIN) {
      if (seen.has(s)) throw new QuoinError('cfb.loop', 'MiniFAT chain loops');
      if (s >= miniFat.length || (s + 1) * miniSize > ms.length) throw new QuoinError('cfb.range', 'mini sector out of range');
      seen.add(s);
      if ((n + 1) * miniSize > out.length) throw new QuoinError('cfb.loop', 'mini chain longer than the stream');
      out.set(ms.subarray(s * miniSize, (s + 1) * miniSize), n * miniSize);
      n++;
      s = miniFat[s];
    }
    if (n * miniSize < size) throw new QuoinError('cfb.short', 'mini stream shorter than its declared size');
    return out.slice(0, size);
  };

  const visited = new Set();
  const build = (id, parentPath) => {
    const siblings = [];
    const walk = (nid) => {
      if (nid === NOSTREAM) return;
      if (nid >= dirEntries.length) throw new QuoinError('cfb.range', 'directory id out of range');
      if (visited.has(nid)) throw new QuoinError('cfb.loop', 'directory tree loops');
      visited.add(nid);
      const e = dirEntries[nid];
      walk(e.left);
      siblings.push(e);
      walk(e.right);
    };
    walk(id);
    return siblings.map((e) => {
      const path = parentPath ? `${parentPath}/${e.name}` : e.name;
      const node = {
        name: e.name,
        path,
        type: e.type,
        clsid: e.clsid,
        stateBits: e.stateBits,
        created: e.created,
        modified: e.modified
      };
      if (e.type === 2) {
        node.data = e.size < cutoff ? readMini(e.start, e.size) : readRegular(e.start, e.size);
      } else if (e.type === 1) {
        node.children = build(e.child, path);
      } else {
        throw new QuoinError('cfb.type', `unexpected object type ${e.type}`);
      }
      return node;
    });
  };

  const root = {
    name: rootEntry.name,
    path: '',
    type: 5,
    clsid: rootEntry.clsid,
    stateBits: rootEntry.stateBits,
    created: rootEntry.created,
    modified: rootEntry.modified,
    children: build(rootEntry.child, '')
  };
  return { major, minor, root, find: (path) => findNode(root, path), list: () => flatten(root) };
}

export function flatten(node, out = []) {
  for (const c of node.children || []) {
    out.push(c);
    if (c.children) flatten(c, out);
  }
  return out;
}

export function findNode(root, path) {
  const lower = path.toLowerCase();
  return flatten(root).find((n) => n.path.toLowerCase() === lower) || null;
}
