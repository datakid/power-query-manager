import { QuoinError } from '../errors.js';
import { writeU16, writeU32 } from '../bytes.js';
import { CFB_SIGNATURE, FREESECT, ENDOFCHAIN, FATSECT, DIFSECT, NOSTREAM } from './cfb-read.js';

const SECTOR = 512;
const MINI = 64;
const CUTOFF = 4096;

export function compareNames(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  for (let i = 0; i < ua.length; i++) {
    const d = ua.charCodeAt(i) - ub.charCodeAt(i);
    if (d) return d;
  }
  return 0;
}

const ceilDiv = (a, b) => Math.ceil(a / b);

function assignIds(root) {
  const entries = [];
  const visit = (node, parent) => {
    node.dirId = entries.length;
    entries.push(node);
    node.parentNode = parent;
    if (node.children) {
      node.sorted = [...node.children].sort((x, y) => compareNames(x.name, y.name));
      for (const c of node.sorted) visit(c, node);
    }
  };
  visit(root, null);
  return entries;
}

function buildTree(sorted) {
  let maxDepth = 0;
  const place = (lo, hi, depth) => {
    if (lo > hi) return null;
    const mid = Math.floor((lo + hi + 1) / 2);
    const node = sorted[mid];
    node.depth = depth;
    if (depth > maxDepth) maxDepth = depth;
    node.leftNode = place(lo, mid - 1, depth + 1);
    node.rightNode = place(mid + 1, hi, depth + 1);
    return node;
  };
  const top = place(0, sorted.length - 1, 1);
  const full = sorted.length === Math.pow(2, maxDepth) - 1;
  for (const n of sorted) n.color = !full && n.depth === maxDepth && maxDepth > 1 ? 0 : 1;
  return top;
}

export function writeCfb(rootNode) {
  const root = { ...rootNode };
  const clone = (n) => ({ ...n, children: n.children ? n.children.map(clone) : undefined });
  const tree = clone(root);
  const entries = assignIds(tree);
  for (const e of entries) {
    if (e.children) {
      const top = buildTree(e.sorted);
      e.childId = top ? top.dirId : NOSTREAM;
    }
  }
  for (const e of entries) {
    if (e.children) {
      for (const c of e.sorted) {
        c.leftId = c.leftNode ? c.leftNode.dirId : NOSTREAM;
        c.rightId = c.rightNode ? c.rightNode.dirId : NOSTREAM;
      }
    }
  }
  tree.leftId = NOSTREAM;
  tree.rightId = NOSTREAM;
  tree.color = 1;

  const small = [];
  const large = [];
  for (const e of entries) {
    if (e.type !== 2) continue;
    if (e.data.length < CUTOFF) small.push(e);
    else large.push(e);
  }
  let miniCount = 0;
  const miniChains = [];
  for (const e of small) {
    if (e.data.length === 0) {
      e.startSector = ENDOFCHAIN;
      continue;
    }
    const n = ceilDiv(e.data.length, MINI);
    e.startSector = miniCount;
    miniChains.push({ start: miniCount, n });
    miniCount += n;
  }
  const miniStream = new Uint8Array(miniCount * MINI);
  for (const e of small) {
    if (e.data.length === 0) continue;
    miniStream.set(e.data, e.startSector * MINI);
  }
  const miniFat = new Uint32Array(Math.max(miniCount, 0)).fill(FREESECT);
  for (const c of miniChains) {
    for (let i = 0; i < c.n; i++) miniFat[c.start + i] = i === c.n - 1 ? ENDOFCHAIN : c.start + i + 1;
  }

  const dirSectors = ceilDiv(entries.length, SECTOR / 128);
  const miniFatSectors = miniCount ? ceilDiv(miniCount * 4, SECTOR) : 0;
  const miniStreamSectors = ceilDiv(miniStream.length, SECTOR);
  let streamSectors = 0;
  for (const e of large) streamSectors += ceilDiv(e.data.length, SECTOR);
  const others = dirSectors + miniFatSectors + miniStreamSectors + streamSectors;
  let fatSectors = 1;
  let difatSectors = 0;
  for (;;) {
    const needed = ceilDiv(others + fatSectors + difatSectors, SECTOR / 4);
    const diff = fatSectors > 109 ? ceilDiv(fatSectors - 109, SECTOR / 4 - 1) : 0;
    if (needed === fatSectors && diff === difatSectors) break;
    fatSectors = Math.max(needed, 1);
    difatSectors = fatSectors > 109 ? ceilDiv(fatSectors - 109, SECTOR / 4 - 1) : 0;
  }

  const total = fatSectors + difatSectors + others;
  const fat = new Uint32Array(fatSectors * (SECTOR / 4)).fill(FREESECT);
  let next = 0;
  const fatStart = next;
  for (let i = 0; i < fatSectors; i++) fat[next++] = FATSECT;
  const difatStart = next;
  for (let i = 0; i < difatSectors; i++) fat[next++] = DIFSECT;
  const chain = (count) => {
    const start = next;
    for (let i = 0; i < count; i++) {
      fat[next] = i === count - 1 ? ENDOFCHAIN : next + 1;
      next++;
    }
    return count ? start : ENDOFCHAIN;
  };
  const dirStart = chain(dirSectors);
  const miniFatStart = chain(miniFatSectors);
  const miniStreamStart = chain(miniStreamSectors);
  for (const e of large) e.startSector = chain(ceilDiv(e.data.length, SECTOR));
  if (next !== total) throw new QuoinError('cfb.write', 'sector accounting mismatch');

  const out = new Uint8Array((total + 1) * SECTOR);
  out.set(CFB_SIGNATURE, 0);
  writeU16(out, 24, 0x3E);
  writeU16(out, 26, 3);
  writeU16(out, 28, 0xFFFE);
  writeU16(out, 30, 9);
  writeU16(out, 32, 6);
  writeU32(out, 40, 0);
  writeU32(out, 44, fatSectors);
  writeU32(out, 48, dirStart);
  writeU32(out, 52, 0);
  writeU32(out, 56, CUTOFF);
  writeU32(out, 60, miniFatSectors ? miniFatStart : ENDOFCHAIN);
  writeU32(out, 64, miniFatSectors);
  writeU32(out, 68, difatSectors ? difatStart : ENDOFCHAIN);
  writeU32(out, 72, difatSectors);
  for (let i = 0; i < 109; i++) writeU32(out, 76 + i * 4, i < fatSectors ? fatStart + i : FREESECT);

  const sectorPos = (n) => (n + 1) * SECTOR;
  for (let i = 0; i < fatSectors; i++) {
    for (let k = 0; k < SECTOR / 4; k++) writeU32(out, sectorPos(fatStart + i) + k * 4, fat[i * (SECTOR / 4) + k]);
  }
  for (let d = 0; d < difatSectors; d++) {
    const base = sectorPos(difatStart + d);
    for (let k = 0; k < SECTOR / 4 - 1; k++) {
      const idx = 109 + d * (SECTOR / 4 - 1) + k;
      writeU32(out, base + k * 4, idx < fatSectors ? fatStart + idx : FREESECT);
    }
    writeU32(out, base + (SECTOR / 4 - 1) * 4, d === difatSectors - 1 ? ENDOFCHAIN : difatStart + d + 1);
  }

  const dirBase = sectorPos(dirStart);
  for (let i = 0; i < dirSectors * (SECTOR / 128); i++) {
    const o = dirBase + i * 128;
    const e = entries[i];
    if (!e) {
      writeU32(out, o + 68, NOSTREAM);
      writeU32(out, o + 72, NOSTREAM);
      writeU32(out, o + 76, NOSTREAM);
      continue;
    }
    const name = e.name;
    if (name.length > 31) throw new QuoinError('cfb.write', 'entry name too long');
    for (let k = 0; k < name.length; k++) writeU16(out, o + k * 2, name.charCodeAt(k));
    writeU16(out, o + 64, name.length * 2 + 2);
    out[o + 66] = e.type;
    out[o + 67] = e.color === undefined ? 1 : e.color;
    writeU32(out, o + 68, e.leftId === undefined ? NOSTREAM : e.leftId);
    writeU32(out, o + 72, e.rightId === undefined ? NOSTREAM : e.rightId);
    writeU32(out, o + 76, e.children ? e.childId : NOSTREAM);
    if (e.clsid) out.set(e.clsid.subarray(0, 16), o + 80);
    writeU32(out, o + 96, e.stateBits || 0);
    if (e.created) out.set(e.created.subarray(0, 8), o + 100);
    if (e.modified) out.set(e.modified.subarray(0, 8), o + 108);
    if (e.type === 5) {
      writeU32(out, o + 116, miniStream.length ? miniStreamStart : ENDOFCHAIN);
      writeU32(out, o + 120, miniStream.length);
    } else if (e.type === 2) {
      writeU32(out, o + 116, e.data.length === 0 ? ENDOFCHAIN : e.startSector);
      writeU32(out, o + 120, e.data.length);
    }
  }
  for (let i = 0; i < miniFatSectors; i++) {
    for (let k = 0; k < SECTOR / 4; k++) {
      const idx = i * (SECTOR / 4) + k;
      writeU32(out, sectorPos(miniFatStart + i) + k * 4, idx < miniFat.length ? miniFat[idx] : FREESECT);
    }
  }
  if (miniStream.length) out.set(miniStream, sectorPos(miniStreamStart));
  for (const e of large) out.set(e.data, sectorPos(e.startSector));
  return out;
}

export function checkRedBlack(rootNode) {
  const sorted = rootNode.children || [];
  const bytes = writeCfb(rootNode);
  return { bytes, count: sorted.length };
}
