import { u16, u32, concat } from '../bytes.js';

export const REC = {
  LCID: 0x0002,
  CODEPAGE: 0x0003,
  NAME: 0x0004,
  VERSION: 0x0009,
  MODULES: 0x000F,
  TERMINATOR: 0x0010,
  COOKIE: 0x0013,
  REF_NAME: 0x0016,
  MODULE_NAME: 0x0019,
  MODULE_STREAM_NAME: 0x001A,
  MODULE_TYPE_PROCEDURAL: 0x0021,
  MODULE_TYPE_DOCUMENT: 0x0022,
  MODULE_READONLY: 0x0025,
  MODULE_PRIVATE: 0x0028,
  MODULE_TERMINATOR: 0x002B,
  MODULE_OFFSET: 0x0031,
  STREAM_NAME_UNICODE: 0x0032,
  REF_NAME_UNICODE: 0x003E,
  MODULE_NAME_UNICODE: 0x0047
};

export function parseDir(bytes) {
  const records = [];
  const anomalies = [];
  let o = 0;
  while (o + 6 <= bytes.length) {
    const id = u16(bytes, o);
    const sizeField = u32(bytes, o + 2);
    const dataLength = id === REC.VERSION ? 6 : sizeField;
    const start = o + 6;
    const end = start + dataLength;
    if (end > bytes.length) {
      anomalies.push('dir.truncated');
      break;
    }
    records.push({ id, sizeField, data: bytes.subarray(start, end) });
    o = end;
    if (id === REC.TERMINATOR) break;
  }
  if (o !== bytes.length) anomalies.push('dir.trailing');
  if (!records.length || records[records.length - 1].id !== REC.TERMINATOR) anomalies.push('dir.terminator');
  return { records, anomalies };
}

export function serializeDir(records) {
  const parts = [];
  for (const r of records) {
    const head = new Uint8Array(6);
    head[0] = r.id & 0xFF;
    head[1] = (r.id >> 8) & 0xFF;
    const size = r.sizeField;
    head[2] = size & 0xFF;
    head[3] = (size >>> 8) & 0xFF;
    head[4] = (size >>> 16) & 0xFF;
    head[5] = (size >>> 24) & 0xFF;
    parts.push(head, r.data);
  }
  return concat(parts);
}

export function interpretDir(records, decode) {
  const info = { codePage: null, name: '', modules: [], references: [], moduleCount: null };
  let current = null;
  let inModules = false;
  records.forEach((r, index) => {
    if (current) {
      switch (r.id) {
        case REC.MODULE_NAME_UNICODE:
          current.nameUnicode = new TextDecoder('utf-16le').decode(r.data);
          break;
        case REC.MODULE_STREAM_NAME:
          current.streamNameBytes = r.data;
          break;
        case REC.STREAM_NAME_UNICODE:
          current.streamNameUnicode = new TextDecoder('utf-16le').decode(r.data);
          break;
        case REC.MODULE_OFFSET:
          current.offset = u32(r.data, 0);
          current.offsetRecord = index;
          break;
        case REC.MODULE_TYPE_PROCEDURAL:
          current.type = 'procedural';
          break;
        case REC.MODULE_TYPE_DOCUMENT:
          current.type = 'document';
          break;
        case REC.MODULE_READONLY:
          current.readOnly = true;
          break;
        case REC.MODULE_PRIVATE:
          current.private = true;
          break;
        case REC.MODULE_TERMINATOR:
          info.modules.push(current);
          current = null;
          break;
        default:
          break;
      }
      return;
    }
    switch (r.id) {
      case REC.CODEPAGE:
        info.codePage = u16(r.data, 0);
        break;
      case REC.NAME:
        info.name = decode(r.data);
        break;
      case REC.REF_NAME:
        info.references.push(decode(r.data));
        break;
      case REC.MODULES:
        inModules = true;
        info.moduleCount = u16(r.data, 0);
        break;
      case REC.MODULE_NAME:
        if (inModules) current = { nameBytes: r.data, name: decode(r.data), nameUnicode: null, streamNameBytes: null, streamNameUnicode: null, offset: null, offsetRecord: -1, type: null, readOnly: false, private: false };
        break;
      default:
        break;
    }
  });
  return info;
}
