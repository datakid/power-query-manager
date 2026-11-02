const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const MAX_CODE_POINTS = 120;

const takeCodePoints = (s, n) => [...s].slice(0, Math.max(0, n)).join('');

export function sanitizeFileName(name, ext) {
  let base = String(name).replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/^\.+/, '').trim();
  if (base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, base.length - ext.length);
  base = takeCodePoints(base, MAX_CODE_POINTS - [...ext].length).replace(/[.\s]+$/u, '');
  if (!base) base = 'file';
  if (RESERVED.test(base.split('.')[0].trim())) base = `_${base}`;
  return `${base}${ext}`;
}

export function extensionFor(format, hasVba) {
  switch (format) {
    case 'xltm':
      return 'xltm';
    case 'xltx':
      return hasVba ? 'xltm' : 'xltx';
    case 'xlsm':
      return 'xlsm';
    case 'xlsx':
      return hasVba ? 'xlsm' : 'xlsx';
    default:
      return null;
  }
}

export function suggestedFileName(wb) {
  const original = wb.fileName || 'workbook';
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  const ext = extensionFor(wb.format, !!wb.vba) || (dot > 0 ? original.slice(dot + 1) : 'xlsx');
  return sanitizeFileName(`${base} (edited).${ext}`, `.${ext}`);
}
