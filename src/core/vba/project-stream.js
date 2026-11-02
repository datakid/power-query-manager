import { decodeBytes } from './codepages.js';

export function parseProjectStream(bytes, codePage) {
  const text = decodeBytes(codePage, bytes);
  const lines = text.split(/\r?\n/);
  const info = { text, lines, id: null, documents: [], modules: [], classes: [], baseClasses: [], packages: [], name: null, cmg: null, dpb: null, gc: null, hasProtectionFields: false };
  let section = 'main';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }
    if (section !== 'main') continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq);
    let value = line.slice(eq + 1);
    const unquoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1) : value;
    switch (key) {
      case 'ID':
        info.id = unquoted;
        break;
      case 'Document':
        info.documents.push(value.split('/')[0]);
        break;
      case 'Module':
        info.modules.push(value);
        break;
      case 'Class':
        info.classes.push(value);
        break;
      case 'BaseClass':
        info.baseClasses.push(value);
        break;
      case 'Package':
        info.packages.push(value);
        break;
      case 'Name':
        info.name = unquoted;
        break;
      case 'CMG':
        info.cmg = unquoted;
        info.hasProtectionFields = true;
        break;
      case 'DPB':
        info.dpb = unquoted;
        info.hasProtectionFields = true;
        break;
      case 'GC':
        info.gc = unquoted;
        break;
      default:
        break;
    }
  }
  return info;
}

export function classifyModule(name, projectInfo, dirType) {
  const lower = name.toLowerCase();
  const has = (list) => list.some((n) => n.toLowerCase() === lower);
  if (has(projectInfo.baseClasses)) return 'form';
  if (has(projectInfo.documents)) return 'document';
  if (has(projectInfo.classes)) return 'class';
  if (has(projectInfo.modules)) return 'standard';
  return dirType === 'procedural' ? 'standard' : 'class';
}

export function decryptProjectField(hex) {
  if (!hex || hex.length % 2 !== 0 || /[^0-9A-Fa-f]/.test(hex)) return null;
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  if (bytes.length < 7) return null;
  const seed = bytes[0];
  const versionEnc = bytes[1];
  const projKeyEnc = bytes[2];
  const version = seed ^ versionEnc;
  const projKey = seed ^ projKeyEnc;
  if (version !== 2) return null;
  let unencrypted1 = projKey;
  let encrypted1 = projKeyEnc;
  let encrypted2 = versionEnc;
  const ignored = (seed & 6) >> 1;
  let p = 3;
  const next = () => {
    const enc = bytes[p++];
    const dec = enc ^ ((encrypted2 + unencrypted1) & 0xFF);
    encrypted2 = encrypted1;
    encrypted1 = enc;
    unencrypted1 = dec;
    return dec;
  };
  for (let i = 0; i < ignored; i++) next();
  if (p + 4 > bytes.length) return null;
  const length = next() | (next() << 8) | (next() << 16) | (next() * 0x1000000);
  if (p + length > bytes.length) return null;
  const data = [];
  for (let i = 0; i < length; i++) data.push(next());
  return Uint8Array.from(data);
}

export function protectionState(projectInfo) {
  if (!projectInfo.cmg) return { known: true, state: 0 };
  const data = decryptProjectField(projectInfo.cmg);
  if (!data || data.length < 4) return { known: false, state: null };
  return { known: true, state: data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24) };
}
