import { expressionError, ymdFromDays, dayOfWeek, timeParts, TICKS_PER_SECOND } from './values.js';

function digitsOf(n) {
  const [mant, exp] = n.toExponential().split('e');
  const digits = mant.replace('.', '').replace('-', '');
  return { digits, exp: Number(exp) };
}

export function defaultNumberText(n, culture) {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (n === 0) return '0';
  const neg = n < 0;
  const { digits, exp } = digitsOf(Math.abs(n));
  let body;
  if (exp >= 15 || exp < -4) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const e = Math.abs(exp);
    body = `${mant}E${exp < 0 ? '-' : '+'}${e < 10 ? `0${e}` : e}`;
  } else if (exp >= 0) {
    body = digits.length <= exp + 1 ? digits + '0'.repeat(exp + 1 - digits.length) : `${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
  } else {
    body = `0.${'0'.repeat(-exp - 1)}${digits}`;
  }
  if (culture && culture.decimal !== '.') body = body.replace('.', culture.decimal);
  return (neg ? '-' : '') + body;
}

function roundHalfAwayFixed(abs, decimals) {
  if (abs === 0) return decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0';
  const { digits, exp } = digitsOf(Number(abs.toPrecision(15)));
  let intDigits;
  let fracDigits;
  if (exp >= 0) {
    const padded = digits.padEnd(exp + 1, '0');
    intDigits = padded.slice(0, exp + 1);
    fracDigits = padded.slice(exp + 1);
  } else {
    intDigits = '0';
    fracDigits = '0'.repeat(-exp - 1) + digits;
  }
  let all = intDigits + fracDigits.padEnd(decimals + 1, '0');
  const cut = intDigits.length + decimals;
  const roundUp = all.charCodeAt(cut) >= 53;
  let head = all.slice(0, cut).split('').map(Number);
  if (roundUp) {
    let i = head.length - 1;
    while (i >= 0) {
      if (head[i] === 9) {
        head[i] = 0;
        i--;
      } else {
        head[i]++;
        break;
      }
    }
    if (i < 0) head = [1, ...head];
  }
  const text = head.join('');
  const intLen = text.length - decimals;
  return decimals > 0 ? `${text.slice(0, intLen)}.${text.slice(intLen)}` : text;
}

function groupDigits(intPart, sep, sizes = [3]) {
  let out = '';
  let i = intPart.length;
  let sizeIdx = 0;
  while (i > 0) {
    const size = sizes[Math.min(sizeIdx, sizes.length - 1)];
    const start = Math.max(0, i - size);
    out = intPart.slice(start, i) + (out ? sep + out : '');
    i = start;
    sizeIdx++;
  }
  return out || '0';
}

function fixedText(n, decimals, culture, grouped) {
  const abs = Math.abs(n);
  let text = roundHalfAwayFixed(abs, decimals);
  if (abs >= 1e21) text = BigInt(Math.round(abs)).toString() + (decimals ? `.${'0'.repeat(decimals)}` : '');
  const [ip, fp = ''] = text.split('.');
  const sep = culture.group === ' ' ? '\u00A0' : culture.groupRaw;
  const int = grouped ? groupDigits(ip, sep) : ip;
  const body = fp ? `${int}${culture.decimal}${fp}` : int;
  return (n < 0 && /[1-9]/.test(text) ? culture.minus : '') + body;
}

function expText(n, decimals, culture, upper = true) {
  const neg = n < 0;
  let [m, e] = Math.abs(n).toExponential(decimals).split('e');
  const exp = Number(e);
  const text = `${m.replace('.', culture.decimal)}${upper ? 'E' : 'e'}${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(3, '0')}`;
  return (neg ? culture.minus : '') + text;
}

function customNumber(n, format, culture) {
  const sections = [];
  let cur = '';
  let quote = null;
  for (const ch of format) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ';') {
      sections.push(cur);
      cur = '';
    } else cur += ch;
  }
  sections.push(cur);
  let pattern = sections[0];
  let value = n;
  if (n < 0 && sections.length > 1) {
    pattern = sections[1];
    value = -n;
  } else if (n === 0 && sections.length > 2) pattern = sections[2];
  const percentCount = (pattern.replace(/"[^"]*"|'[^']*'/g, '').match(/%/g) || []).length;
  value = Math.abs(value) * Math.pow(100, percentCount);
  const tokens = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '"' || ch === "'") {
      const end = pattern.indexOf(ch, i + 1);
      tokens.push({ lit: pattern.slice(i + 1, end < 0 ? pattern.length : end) });
      i = end < 0 ? pattern.length : end + 1;
    } else if (ch === '\\') {
      tokens.push({ lit: pattern[i + 1] || '' });
      i += 2;
    } else {
      tokens.push({ ch });
      i++;
    }
  }
  const digitTokens = tokens.filter((t) => t.ch === '0' || t.ch === '#');
  const pointIndex = tokens.findIndex((t) => t.ch === '.');
  const beforePoint = pointIndex < 0 ? tokens : tokens.slice(0, pointIndex);
  const afterPoint = pointIndex < 0 ? [] : tokens.slice(pointIndex + 1);
  const grouped = beforePoint.some((t) => t.ch === ',');
  const fracDigits = afterPoint.filter((t) => t.ch === '0' || t.ch === '#');
  const minFrac = fracDigits.filter((t) => t.ch === '0').length;
  const maxFrac = fracDigits.length;
  const minInt = beforePoint.filter((t) => t.ch === '0').length;
  void digitTokens;
  let text = value.toFixed(maxFrac);
  let [ip, fp = ''] = text.split('.');
  while (fp.length > minFrac && fp.endsWith('0')) fp = fp.slice(0, -1);
  ip = ip.replace(/^0+(?=\d)/, '');
  if (ip === '0' && minInt === 0) ip = '';
  ip = ip.padStart(minInt, '0');
  const sep = culture.group === ' ' ? '\u00A0' : culture.groupRaw;
  const intText = grouped ? groupDigits(ip, sep).replace(/^0$/, ip === '' ? '' : '0') : ip;
  let out = '';
  let intPlaced = false;
  let fracPlaced = false;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.lit !== undefined) out += t.lit;
    else if (t.ch === '0' || t.ch === '#') {
      if (pointIndex >= 0 && k > pointIndex) {
        if (!fracPlaced) {
          out += fp ? culture.decimal + fp : '';
          fracPlaced = true;
        }
      } else if (!intPlaced) {
        out += intText;
        intPlaced = true;
      }
    } else if (t.ch === '.' || t.ch === ',') continue;
    else if (t.ch === '%') out += culture.percent;
    else out += t.ch;
  }
  if (n < 0 && sections.length === 1 && /[1-9]/.test(text)) out = culture.minus + out;
  return out;
}

export function formatNumber(n, format, culture) {
  if (format === undefined || format === null || format === '') return defaultNumberText(n, culture);
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  const m = /^([A-Za-z])(\d{0,2})$/.exec(format);
  if (m) {
    const kind = m[1].toUpperCase();
    const prec = m[2] === '' ? null : Number(m[2]);
    switch (kind) {
      case 'G': {
        if (prec === null || prec === 0) return defaultNumberText(n, culture);
        const p = Number(n.toPrecision(prec));
        const { exp } = digitsOf(Math.abs(p) || 1);
        if (exp >= prec || exp < -5) return expText(p, Math.max(prec - 1, 0), culture, m[1] === 'G').replace(/\.?0+E/, 'E').replace(/E([+-])0*(\d{2})/, 'E$1$2');
        return defaultNumberText(p, culture);
      }
      case 'N':
        return fixedText(n, prec === null ? 2 : prec, culture, true);
      case 'F':
        return fixedText(n, prec === null ? 2 : prec, culture, false);
      case 'D': {
        if (!Number.isInteger(n)) throw expressionError('Format specifier D requires an integer value.', format);
        const s = String(Math.abs(n)).padStart(prec || 0, '0');
        return (n < 0 ? culture.minus : '') + s;
      }
      case 'P': {
        const body = fixedText(n * 100, prec === null ? 2 : prec, culture, true);
        return culture.isEnglishUS || culture.name.startsWith('en') ? `${body}${culture.percent}` : `${body}\u00A0${culture.percent}`;
      }
      case 'E':
        return expText(n, prec === null ? 6 : prec, culture, m[1] === 'E');
      case 'X': {
        if (!Number.isInteger(n)) throw expressionError('Format specifier X requires an integer value.', format);
        const v = n < 0 ? (BigInt(n) + (1n << 64n)).toString(16) : n.toString(16);
        const t = m[1] === 'X' ? v.toUpperCase() : v;
        return t.padStart(prec || 0, '0');
      }
      default:
        break;
    }
  }
  return customNumber(n, format, culture);
}

export function dateParts(v) {
  const k = v.k;
  if (k === 'date') {
    const ymd = ymdFromDays(v.days);
    return { ...ymd, hour: 0, minute: 0, second: 0, fraction: 0, dow: dayOfWeek(v.days) };
  }
  if (k === 'time') {
    const t = timeParts(v.ticks);
    return { year: 1, month: 1, day: 1, hour: t.hour, minute: t.minute, second: t.second, fraction: t.fraction, dow: 1 };
  }
  const total = v.ticks;
  let days = total / 864000000000n;
  let rem = total % 864000000000n;
  if (rem < 0n) {
    rem += 864000000000n;
    days -= 1n;
  }
  const d = Number(days);
  const ymd = ymdFromDays(d);
  const t = timeParts(Number(rem));
  return { ...ymd, hour: t.hour, minute: t.minute, second: t.second, fraction: t.fraction, dow: dayOfWeek(d) };
}

const pad = (n, w) => String(n).padStart(w, '0');

export function formatDateTime(v, format, culture) {
  const p = dateParts(v);
  const kind = v.k;
  if (!format) {
    if (kind === 'date') return formatDateTime(v, 'd', culture);
    if (kind === 'time') return formatDateTime(v, 'T', culture);
    return formatDateTime(v, 'G', culture);
  }
  const std = { d: shortDate(culture), D: longDate(culture), t: shortTime(culture), T: longTime(culture), g: `${shortDate(culture)} ${shortTime(culture)}`, G: `${shortDate(culture)} ${longTime(culture)}`, s: "yyyy-MM-dd'T'HH:mm:ss", o: "yyyy-MM-dd'T'HH:mm:ss.fffffff", M: 'MMMM d', m: 'MMMM d', Y: 'MMMM yyyy', y: 'MMMM yyyy' };
  let fmt = format;
  if (format.length === 1 && std[format]) fmt = std[format];
  else if (format.length === 1 && /[A-Za-z]/.test(format)) throw expressionError(`The format string '${format}' is not valid.`, format);
  let out = '';
  let i = 0;
  while (i < fmt.length) {
    const ch = fmt[i];
    if (ch === "'" || ch === '"') {
      const end = fmt.indexOf(ch, i + 1);
      out += fmt.slice(i + 1, end < 0 ? fmt.length : end);
      i = end < 0 ? fmt.length : end + 1;
      continue;
    }
    if (ch === '\\') {
      out += fmt[i + 1] || '';
      i += 2;
      continue;
    }
    let run = 1;
    while (fmt[i + run] === ch) run++;
    switch (ch) {
      case 'y':
        out += run === 1 ? String(p.year % 100) : run === 2 ? pad(p.year % 100, 2) : pad(p.year, run);
        break;
      case 'M':
        out += run === 1 ? p.month : run === 2 ? pad(p.month, 2) : run === 3 ? culture.monthShort[p.month - 1] : culture.monthNames[p.month - 1];
        break;
      case 'd':
        out += run === 1 ? p.day : run === 2 ? pad(p.day, 2) : run === 3 ? culture.dayShort[p.dow] : culture.dayNames[p.dow];
        break;
      case 'H':
        out += run === 1 ? p.hour : pad(p.hour, 2);
        break;
      case 'h': {
        const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
        out += run === 1 ? h : pad(h, 2);
        break;
      }
      case 'm':
        out += run === 1 ? p.minute : pad(p.minute, 2);
        break;
      case 's':
        out += run === 1 ? p.second : pad(p.second, 2);
        break;
      case 'f':
        out += pad(p.fraction, 7).slice(0, run);
        break;
      case 'F': {
        const t = pad(p.fraction, 7).slice(0, run).replace(/0+$/, '');
        out += t ? `${t}` : '';
        break;
      }
      case 't':
        out += (p.hour < 12 ? culture.am : culture.pm).slice(0, run === 1 ? 1 : undefined);
        break;
      case '/':
        out += culture.dateSep;
        run = 1;
        break;
      case ':':
        out += ':';
        run = 1;
        break;
      default:
        out += ch.repeat(run);
    }
    i += run;
  }
  return out;
}

function shortDate(c) {
  const parts = c.dateOrder.map((o) => (o === 'M' ? 'M' : o === 'D' ? 'd' : 'yyyy'));
  return parts.join('/');
}

function longDate(c) {
  return c.isEnglishUS ? 'dddd, MMMM d, yyyy' : `dddd, d MMMM yyyy`;
}

function shortTime(c) {
  return c.hour12 ? 'h:mm tt' : 'HH:mm';
}

function longTime(c) {
  return c.hour12 ? 'h:mm:ss tt' : 'HH:mm:ss';
}

export function formatDuration(ticks) {
  const neg = ticks < 0n;
  let t = neg ? -ticks : ticks;
  const days = t / 864000000000n;
  t %= 864000000000n;
  const hours = t / 36000000000n;
  t %= 36000000000n;
  const minutes = t / 600000000n;
  t %= 600000000n;
  const seconds = t / 10000000n;
  const frac = t % 10000000n;
  let s = `${days > 0n ? `${days}.` : ''}${pad(Number(hours), 2)}:${pad(Number(minutes), 2)}:${pad(Number(seconds), 2)}`;
  if (frac > 0n) s += `.${pad(Number(frac), 7)}`;
  return (neg ? '-' : '') + s;
}

export { TICKS_PER_SECOND };
