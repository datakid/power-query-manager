import { writeZip } from '../zip-write.js';
import { utf8Encode } from '../bytes.js';
import { encodeText } from '../vba/codepages.js';

export function sanitizeFileName(name, ext) {
  const base = String(name).replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/^\.+/, '').slice(0, 120).trim() || 'file';
  const clean = base.toLowerCase().endsWith(ext.toLowerCase()) ? base.slice(0, base.length - ext.length) : base;
  return `${clean.slice(0, 120 - ext.length)}${ext}`;
}

export function queryFile(name, text) {
  return { name: sanitizeFileName(name, '.m'), data: utf8Encode(text.replace(/\r?\n/g, '\r\n')) };
}

const CLASS_HEADER = 'VERSION 1.0 CLASS\r\nBEGIN\r\n  MultiUse = -1  \'True\r\nEND\r\n';

export function moduleFile(mod, text, codePage) {
  let ext = '.bas';
  let source = text;
  if (mod.kind === 'class' || mod.kind === 'document') {
    ext = '.cls';
    source = CLASS_HEADER + text;
  } else if (mod.kind === 'form') {
    ext = '.frm';
    source = `${text}${text.endsWith('\n') ? '' : '\r\n'}' Form layout not included.\r\n`;
  }
  const crlf = source.replace(/\r\n|\r|\n/g, '\r\n');
  return { name: sanitizeFileName(mod.name, ext), data: encodeText(codePage, crlf, null) };
}

export async function zipFiles(files) {
  const seen = new Set();
  const unique = files.map((f) => {
    let name = f.name;
    let n = 2;
    while (seen.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      name = `${f.name.slice(0, dot)} (${n++})${f.name.slice(dot)}`;
    }
    seen.add(name.toLowerCase());
    return { ...f, name };
  });
  return writeZip(unique);
}
