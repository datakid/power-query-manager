const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export function classifyFormat(numFmtId, code) {
  if (code === undefined || code === null) return BUILTIN_DATE.has(numFmtId) ? 'datetime' : 'number';
  let s = code.split(';')[0];
  s = s.replace(/"(?:[^"]|"")*"/g, '').replace(/\\./g, '');
  const elapsed = /\[(h+|m+|s+)\]/i.test(s);
  s = s.replace(/\[[^\]]*\]/g, '');
  s = s.replace(/_./g, '').replace(/\*./g, '');
  const dateTokens = /[yd]/i.test(s);
  const timeTokens = /[hms]/i.test(s);
  if (!dateTokens && !timeTokens && !elapsed) return 'number';
  if (elapsed && !dateTokens) return 'duration';
  return 'datetime';
}

export function serialToParts(serial, date1904) {
  let days = Math.floor(serial);
  let frac = serial - days;
  let ms = Math.round(frac * 86400000);
  if (ms >= 86400000) {
    ms -= 86400000;
    days += 1;
  }
  let base;
  if (date1904) base = Date.UTC(1904, 0, 1);
  else base = days < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(base + days * 86400000 + ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds() + d.getUTCMilliseconds() / 1000
  };
}

export function serialToEpochMs(serial, date1904) {
  const days = Math.floor(serial);
  let base;
  if (date1904) base = Date.UTC(1904, 0, 1);
  else base = days < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  return base + Math.round(serial * 86400000);
}
