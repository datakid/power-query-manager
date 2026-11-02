import {
  MError, MList, MRecord, MTable, MFunction, MType, expressionError, formatError, kindOf, kindLabel,
  mkDate, mkTime, mkDateTime, mkDtz, mkDuration, daysFromYmd, daysInMonth, joinDateTime, splitDateTime, TICKS_PER_DAY
} from './values.js';
import { getCulture, parseNumberText } from './culture.js';
import { defaultNumberText, formatDateTime, formatDuration } from './format.js';
import { RT } from './runtime.js';

export const currentCulture = () => RT.culture || getCulture('en-US');

export function cultureArg(name) {
  if (name === undefined || name === null) return currentCulture();
  return getCulture(name);
}

const OA_EPOCH_DAYS = daysFromYmd(1899, 12, 30);

export function offsetText(min) {
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

export function toText(v, culture = currentCulture()) {
  const k = kindOf(v);
  switch (k) {
    case 'null':
      return null;
    case 'text':
      return v;
    case 'number':
      return defaultNumberText(v, culture);
    case 'logical':
      return v ? 'true' : 'false';
    case 'date':
      return formatDateTime(v, 'd', culture);
    case 'time':
      return formatDateTime(v, 'T', culture);
    case 'datetime':
      return formatDateTime(v, 'G', culture);
    case 'datetimezone':
      return `${formatDateTime(v, 'G', culture)} ${offsetText(v.offsetMin)}`;
    case 'duration':
      return formatDuration(v.ticks);
    default:
      throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Text.`, v);
  }
}

export function toNumber(v, culture = currentCulture()) {
  const k = kindOf(v);
  switch (k) {
    case 'null':
      return null;
    case 'number':
      return v;
    case 'logical':
      return v ? 1 : 0;
    case 'text': {
      const n = parseNumberText(v, culture);
      if (n === null || n === undefined) throw formatError("We couldn't convert to Number.", v);
      return n;
    }
    case 'date':
      return v.days - OA_EPOCH_DAYS;
    case 'datetime': {
      const p = splitDateTime(v.ticks);
      return p.days - OA_EPOCH_DAYS + p.time / Number(TICKS_PER_DAY);
    }
    case 'datetimezone': {
      const p = splitDateTime(v.ticks);
      return p.days - OA_EPOCH_DAYS + p.time / Number(TICKS_PER_DAY);
    }
    case 'time':
      return v.ticks / Number(TICKS_PER_DAY);
    case 'duration':
      return Number(v.ticks) / Number(TICKS_PER_DAY);
    default:
      throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Number.`, v);
  }
}

export function toLogical(v) {
  const k = kindOf(v);
  if (k === 'null') return null;
  if (k === 'logical') return v;
  if (k === 'number') return v !== 0;
  if (k === 'text') {
    const t = v.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
    throw formatError("We couldn't convert to Logical.", v);
  }
  throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Logical.`, v);
}

const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,7}))?)?\s*([AaPp]\.?[Mm]\.?)?/;
const OFFSET_RE = /\s*(Z|[+-]\d{1,2}(?::?\d{2})?)$/i;

function parseYear(s) {
  const y = Number(s);
  if (s.length <= 2) return y <= 29 ? 2000 + y : 1900 + y;
  return y;
}

function monthFromName(name, culture) {
  const n = name.toLowerCase().replace(/\.$/, '');
  for (let i = 0; i < 12; i++) {
    if (culture.monthNames[i].toLowerCase() === n || culture.monthShort[i].toLowerCase().replace(/\.$/, '') === n) return i + 1;
  }
  const en = getCulture('en-US');
  for (let i = 0; i < 12; i++) if (en.monthNames[i].toLowerCase() === n || en.monthShort[i].toLowerCase() === n) return i + 1;
  return 0;
}

export function parseDateText(text, culture) {
  let s = text.trim();
  if (!s) return null;
  let offsetMin = null;
  let time = null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/.exec(s);
  let dateText = s;
  let timeText = '';
  if (iso) {
    dateText = `${iso[1]}-${iso[2]}-${iso[3]}`;
    timeText = iso[4] || '';
  } else {
    const tm = TIME_RE.exec(s);
    if (tm) {
      timeText = s.slice(tm.index);
      dateText = s.slice(0, tm.index).replace(/[T,]\s*$/, '').trim();
    }
  }
  if (timeText) {
    const om = OFFSET_RE.exec(timeText);
    if (om && /:|\d/.test(timeText.slice(0, om.index))) {
      const o = om[1].toUpperCase();
      if (o === 'Z') offsetMin = 0;
      else {
        const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec(o);
        offsetMin = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
      }
      timeText = timeText.slice(0, om.index);
    }
    const tm = TIME_RE.exec(timeText.trim());
    if (!tm || tm.index !== 0 || tm[0].length !== timeText.trim().length) return null;
    let h = Number(tm[1]);
    const mi = Number(tm[2]);
    const se = Number(tm[3] || 0);
    const frac = tm[4] ? Number(tm[4].padEnd(7, '0')) : 0;
    if (tm[5]) {
      const pm = tm[5][0].toLowerCase() === 'p';
      if (h < 1 || h > 12) return null;
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    if (h > 24 || mi > 59 || se > 59) return null;
    time = ((h * 60 + mi) * 60 + se) * 10000000 + frac;
  }
  let days = null;
  dateText = dateText.replace(/^[A-Za-z]+,?\s+(?=[A-Za-z]+\s+\d|\d+\s+[A-Za-z]|\d+[/.-])/, (m) => (monthFromName(m.trim().replace(/,$/, ''), culture) ? m : ''));
  if (dateText) {
    let y;
    let mo;
    let d;
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText))) {
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
    } else if ((m = /^(\d{1,4})([/.\-\s])(\d{1,2})\2(\d{1,4})$/.exec(dateText))) {
      const vals = { };
      const parts = [m[1], m[3], m[4]];
      culture.dateOrder.forEach((o, i) => {
        vals[o] = parts[i];
      });
      y = parseYear(vals.Y);
      mo = Number(vals.M);
      d = Number(vals.D);
    } else if ((m = /^(\d{1,2})\s+([^\d\s,]+),?\s+(\d{2,4})$/.exec(dateText))) {
      d = Number(m[1]);
      mo = monthFromName(m[2], culture);
      y = parseYear(m[3]);
    } else if ((m = /^([^\d\s,]+)\.?\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(dateText))) {
      mo = monthFromName(m[1], culture);
      d = Number(m[2]);
      y = parseYear(m[3]);
    } else if ((m = /^([^\d\s,]+)\s+(\d{4})$/.exec(dateText))) {
      mo = monthFromName(m[1], culture);
      d = 1;
      y = Number(m[2]);
    } else return null;
    if (!mo || mo < 1 || mo > 12 || y < 1 || y > 9999 || d < 1 || d > daysInMonth(y, mo)) return null;
    days = daysFromYmd(y, mo, d);
  }
  if (days === null && time === null) return null;
  return { days, time, offsetMin };
}

export function dateFailure(kind, text) {
  return formatError(`We couldn't parse the input provided as a ${kind} value.`, text);
}

export function toDate(v, culture = currentCulture()) {
  const k = kindOf(v);
  if (k === 'null') return null;
  if (k === 'date') return v;
  if (k === 'datetime' || k === 'datetimezone') return mkDate(splitDateTime(v.ticks).days);
  if (k === 'number') return mkDate(Math.floor(v) + OA_EPOCH_DAYS);
  if (k === 'text') {
    const p = parseDateText(v, culture);
    if (!p || p.days === null) throw dateFailure('Date', v);
    return mkDate(p.days);
  }
  throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Date.`, v);
}

export function toDateTime(v, culture = currentCulture()) {
  const k = kindOf(v);
  if (k === 'null') return null;
  if (k === 'datetime') return v;
  if (k === 'date') return mkDateTime(joinDateTime(v.days, 0));
  if (k === 'datetimezone') return mkDateTime(v.ticks);
  if (k === 'time') return mkDateTime(joinDateTime(daysFromYmd(1899, 12, 30), v.ticks));
  if (k === 'number') {
    const days = Math.floor(v);
    return mkDateTime(joinDateTime(days + OA_EPOCH_DAYS, Math.round((v - days) * Number(TICKS_PER_DAY))));
  }
  if (k === 'text') {
    const p = parseDateText(v, culture);
    if (!p) throw dateFailure('DateTime', v);
    return mkDateTime(joinDateTime(p.days === null ? daysFromYmd(1899, 12, 30) : p.days, p.time || 0));
  }
  throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type DateTime.`, v);
}

export function toTime(v, culture = currentCulture()) {
  const k = kindOf(v);
  if (k === 'null') return null;
  if (k === 'time') return v;
  if (k === 'datetime' || k === 'datetimezone') return mkTime(splitDateTime(v.ticks).time);
  if (k === 'number') return mkTime(Math.round((v - Math.floor(v)) * Number(TICKS_PER_DAY)));
  if (k === 'text') {
    const p = parseDateText(v, culture);
    if (!p || p.time === null) throw dateFailure('Time', v);
    return mkTime(p.time);
  }
  throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Time.`, v);
}

export function toDateTimeZone(v, culture = currentCulture()) {
  const k = kindOf(v);
  if (k === 'null') return null;
  if (k === 'datetimezone') return v;
  if (k === 'text') {
    const p = parseDateText(v, culture);
    if (!p) throw dateFailure('DateTimeZone', v);
    return mkDtz(joinDateTime(p.days === null ? daysFromYmd(1899, 12, 30) : p.days, p.time || 0), p.offsetMin === null ? RT.localOffsetMin || 0 : p.offsetMin);
  }
  const dt = toDateTime(v, culture);
  return mkDtz(dt.ticks, RT.localOffsetMin || 0);
}

export function toDuration(v) {
  const k = kindOf(v);
  if (k === 'null') return null;
  if (k === 'duration') return v;
  if (k === 'number') return mkDuration(BigInt(Math.round(v * Number(TICKS_PER_DAY))));
  if (k === 'text') {
    const m = /^(-)?(?:(\d+)\.)?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?$/.exec(v.trim());
    if (!m) throw formatError("We couldn't parse the input provided as a Duration value.", v);
    let t = BigInt(m[2] || 0) * TICKS_PER_DAY + BigInt(Number(m[3]) * 36000000000 + Number(m[4]) * 600000000 + Number(m[5] || 0) * 10000000) + BigInt(m[6] ? Number(m[6].padEnd(7, '0')) : 0);
    if (m[1]) t = -t;
    return mkDuration(t);
  }
  throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Duration.`, v);
}

export function roundMode(x, mode) {
  switch (mode) {
    case 0:
      return Math.floor(x);
    case 1:
      return Math.ceil(x);
    case 2:
      return Math.trunc(x);
    case 5:
      return x < 0 ? Math.floor(x) : Math.ceil(x);
    case 3:
      return x < 0 ? -Math.round(-x) : Math.round(x);
    default: {
      const f = Math.floor(x);
      const d = x - f;
      if (d < 0.5) return f;
      if (d > 0.5) return f + 1;
      return f % 2 === 0 ? f : f + 1;
    }
  }
}

const RANGES = { int64: [-9223372036854775808, 9223372036854775807], int32: [-2147483648, 2147483647], int16: [-32768, 32767], int8: [-128, 127], byte: [0, 255] };

export function convertToType(v, type, culture = currentCulture()) {
  if (type.tk !== 'primitive') return v;
  if (v === null || v === undefined) {
    if (!type.nullable && type.name !== 'any') return v;
    return null;
  }
  switch (type.name) {
    case 'any':
    case 'anynonnull':
      return v;
    case 'text':
      return toText(v, culture);
    case 'logical':
      return toLogical(v);
    case 'number': {
      let n = toNumber(v, culture);
      const f = type.facet;
      if (f && RANGES[f]) {
        if (!Number.isFinite(n)) throw formatError("We couldn't convert to Number.", String(n));
        n = roundMode(n, 4);
        if (n < RANGES[f][0] || n > RANGES[f][1]) throw formatError('Overflow: the value is outside the range of the type.', v);
      } else if (f === 'single') n = Math.fround(n);
      else if (f === 'currency') n = Math.round(n * 10000) / 10000;
      return n;
    }
    case 'date':
      return toDate(v, culture);
    case 'datetime':
      return toDateTime(v, culture);
    case 'datetimezone':
      return toDateTimeZone(v, culture);
    case 'time':
      return toTime(v, culture);
    case 'duration':
      return toDuration(v);
    case 'binary':
      if (kindOf(v) === 'binary') return v;
      throw expressionError(`We cannot convert a value of type ${kindLabel(v)} to type Binary.`, v);
    default:
      return v;
  }
}

export { MError, MList, MRecord, MTable, MFunction, MType };
