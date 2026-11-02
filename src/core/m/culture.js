import { expressionError } from './values.js';

const cache = new Map();

function months(locale, style) {
  const f = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2021, i, 15))));
}

function weekdays(locale, style) {
  const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2021, 7, 1 + i))));
}

function numericDatePattern(locale) {
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2021, 10, 25)));
  const order = [];
  let sep = '/';
  for (const p of parts) {
    if (p.type === 'month') order.push('M');
    else if (p.type === 'day') order.push('D');
    else if (p.type === 'year') order.push('Y');
    else if (p.type === 'literal' && p.value.trim()) sep = p.value.trim();
  }
  return { order: order.length === 3 ? order : ['M', 'D', 'Y'], sep };
}

export function getCulture(name = 'en-US') {
  const key = name || 'en-US';
  if (cache.has(key)) return cache.get(key);
  let canonical;
  try {
    canonical = Intl.getCanonicalLocales(key)[0];
    if (!canonical) throw new Error('empty');
    new Intl.NumberFormat(canonical);
  } catch {
    throw expressionError(`The culture '${key}' is not recognized.`, key);
  }
  const num = new Intl.NumberFormat(canonical, { useGrouping: true }).formatToParts(-1234567.5);
  const dec = num.find((p) => p.type === 'decimal');
  const grp = num.find((p) => p.type === 'group');
  const minus = num.find((p) => p.type === 'minusSign');
  const pct = new Intl.NumberFormat(canonical, { style: 'percent' }).formatToParts(0.5).find((p) => p.type === 'percentSign');
  const pattern = numericDatePattern(canonical);
  const time = new Intl.DateTimeFormat(canonical, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2021, 0, 1, 15, 5)));
  const hour12 = time.some((p) => p.type === 'dayPeriod');
  const am = hour12 ? new Intl.DateTimeFormat(canonical, { hour: 'numeric', hour12: true, timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2021, 0, 1, 3))).find((p) => p.type === 'dayPeriod').value : 'AM';
  const pm = hour12 ? new Intl.DateTimeFormat(canonical, { hour: 'numeric', hour12: true, timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2021, 0, 1, 15))).find((p) => p.type === 'dayPeriod').value : 'PM';
  const c = {
    name: canonical,
    decimal: dec ? dec.value : '.',
    group: grp ? grp.value.replace(/\u00A0|\u202F/g, ' ') : ',',
    groupRaw: grp ? grp.value : ',',
    minus: minus ? minus.value : '-',
    percent: pct ? pct.value : '%',
    dateOrder: pattern.order,
    dateSep: pattern.sep,
    monthNames: months(canonical, 'long'),
    monthShort: months(canonical, 'short'),
    dayNames: weekdays(canonical, 'long'),
    dayShort: weekdays(canonical, 'short'),
    hour12,
    am,
    pm,
    isEnglishUS: canonical === 'en-US'
  };
  cache.set(key, c);
  return c;
}

export function supportedCultures() {
  let list = [];
  try {
    list = Intl.supportedValuesOf ? Intl.supportedValuesOf('calendar').length >= 0 ? [] : [] : [];
  } catch {
    list = [];
  }
  const base = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO', 'fi-FI', 'pl-PL', 'cs-CZ', 'ru-RU', 'tr-TR', 'ja-JP', 'zh-CN', 'ko-KR', 'ar-SA', 'he-IL', 'hi-IN'];
  return [...new Set([...base, ...list])];
}

export function parseNumberText(text, culture) {
  let s = text.trim();
  if (!s) return null;
  if (s === '#nan' || s === 'NaN') return NaN;
  if (/^[+-]?(Infinity|#infinity)$/i.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  let percent = false;
  if (s.endsWith(culture.percent)) {
    percent = true;
    s = s.slice(0, s.length - culture.percent.length).trim();
  } else if (s.endsWith('%')) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  let sign = 1;
  if (s.startsWith('-') || s.startsWith(culture.minus)) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('(') && s.endsWith(')')) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    sign = -sign;
    s = s.slice(0, -1);
  }
  const g = culture.groupRaw;
  const groupChars = new Set([g, culture.group]);
  if (culture.group === ' ') groupChars.add('\u00A0').add('\u202F');
  let out = '';
  for (const ch of s) {
    if (ch === culture.decimal) out += '.';
    else if (groupChars.has(ch)) continue;
    else out += ch;
  }
  if (!/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(out)) return undefined;
  const n = Number(out) * sign;
  return percent ? n / 100 : n;
}
