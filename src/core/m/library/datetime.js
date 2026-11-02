import {
  MRecord, expressionError, kindOf, mkDate, mkTime, mkDateTime, mkDtz, mkDuration, daysFromYmd, ymdFromDays, daysInMonth, dayOfWeek, isLeap,
  splitDateTime, joinDateTime, TICKS_PER_DAY, listOf, MAX_DAYS
} from '../values.js';
import { RT } from '../runtime.js';
import { def, asText } from './core.js';
import { toDate, toDateTime, toTime, toDateTimeZone, toDuration, cultureArg, offsetText } from '../convert.js';
import { formatDateTime, formatDuration, dateParts } from '../format.js';

const isDay = (v) => v !== null && (v.k === 'date' || v.k === 'datetime' || v.k === 'dtz');

function daysOf(v) {
  if (v.k === 'date') return v.days;
  return splitDateTime(v.ticks).days;
}

function timeOf(v) {
  return v.k === 'date' ? 0 : splitDateTime(v.ticks).time;
}

function rebuild(v, days) {
  if (days < 0 || days > MAX_DAYS) throw expressionError('The date is outside the supported range.', days);
  if (v.k === 'date') return mkDate(days);
  const ticks = joinDateTime(days, timeOf(v));
  return v.k === 'datetime' ? mkDateTime(ticks) : mkDtz(ticks, v.offsetMin);
}

function rebuildStart(v, days) {
  if (v.k === 'date') return mkDate(days);
  const ticks = joinDateTime(days, 0);
  return v.k === 'datetime' ? mkDateTime(ticks) : mkDtz(ticks, v.offsetMin);
}

function rebuildEnd(v, days) {
  if (v.k === 'date') return mkDate(days);
  const ticks = joinDateTime(days, Number(TICKS_PER_DAY) - 1);
  return v.k === 'datetime' ? mkDateTime(ticks) : mkDtz(ticks, v.offsetMin);
}

const ymdOf = (v) => ymdFromDays(daysOf(v));

function addMonths(v, n) {
  const { year, month, day } = ymdOf(v);
  const total = year * 12 + (month - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  if (y < 1 || y > 9999) throw expressionError('The date is outside the supported range.', n);
  return rebuild(v, daysFromYmd(y, m, Math.min(day, daysInMonth(y, m))));
}

const guard = (fn) => (v, ...rest) => (v === null ? null : fn(v, ...rest));

for (const prefix of ['Date', 'DateTime', 'DateTimeZone']) {
  def(`${prefix}.Year`, ['value'], guard((v) => ymdOf(v).year));
  def(`${prefix}.Month`, ['value'], guard((v) => ymdOf(v).month));
  def(`${prefix}.Day`, ['value'], guard((v) => ymdOf(v).day));
  def(`${prefix}.DayOfWeek`, ['value', '?firstDayOfWeek'], guard((v, f) => (dayOfWeek(daysOf(v)) - (f || 0) + 7) % 7));
  def(`${prefix}.DayOfYear`, ['value'], guard((v) => daysOf(v) - daysFromYmd(ymdOf(v).year, 1, 1) + 1));
  def(`${prefix}.DaysInMonth`, ['value'], guard((v) => daysInMonth(ymdOf(v).year, ymdOf(v).month)));
  def(`${prefix}.IsLeapYear`, ['value'], guard((v) => isLeap(ymdOf(v).year)));
  def(`${prefix}.QuarterOfYear`, ['value'], guard((v) => Math.floor((ymdOf(v).month - 1) / 3) + 1));
  def(`${prefix}.WeekOfYear`, ['value', '?firstDayOfWeek'], guard((v, f) => {
    const { year } = ymdOf(v);
    const jan1 = daysFromYmd(year, 1, 1);
    const offset = (dayOfWeek(jan1) - (f || 0) + 7) % 7;
    return Math.floor((daysOf(v) - jan1 + offset) / 7) + 1;
  }));
  def(`${prefix}.WeekOfMonth`, ['value', '?firstDayOfWeek'], guard((v, f) => {
    const { year, month } = ymdOf(v);
    const first = daysFromYmd(year, month, 1);
    const offset = (dayOfWeek(first) - (f || 0) + 7) % 7;
    return Math.floor((daysOf(v) - first + offset) / 7) + 1;
  }));
  def(`${prefix}.AddDays`, ['value', 'numberOfDays'], guard((v, n) => rebuild(v, daysOf(v) + Math.trunc(n))));
  def(`${prefix}.AddWeeks`, ['value', 'numberOfWeeks'], guard((v, n) => rebuild(v, daysOf(v) + 7 * Math.trunc(n))));
  def(`${prefix}.AddMonths`, ['value', 'numberOfMonths'], guard((v, n) => addMonths(v, Math.trunc(n))));
  def(`${prefix}.AddQuarters`, ['value', 'numberOfQuarters'], guard((v, n) => addMonths(v, 3 * Math.trunc(n))));
  def(`${prefix}.AddYears`, ['value', 'numberOfYears'], guard((v, n) => addMonths(v, 12 * Math.trunc(n))));
  def(`${prefix}.StartOfDay`, ['value'], guard((v) => rebuildStart(v, daysOf(v))));
  def(`${prefix}.EndOfDay`, ['value'], guard((v) => rebuildEnd(v, daysOf(v))));
  def(`${prefix}.StartOfMonth`, ['value'], guard((v) => rebuildStart(v, daysFromYmd(ymdOf(v).year, ymdOf(v).month, 1))));
  def(`${prefix}.EndOfMonth`, ['value'], guard((v) => rebuildEnd(v, daysFromYmd(ymdOf(v).year, ymdOf(v).month, daysInMonth(ymdOf(v).year, ymdOf(v).month)))));
  def(`${prefix}.StartOfYear`, ['value'], guard((v) => rebuildStart(v, daysFromYmd(ymdOf(v).year, 1, 1))));
  def(`${prefix}.EndOfYear`, ['value'], guard((v) => rebuildEnd(v, daysFromYmd(ymdOf(v).year, 12, 31))));
  def(`${prefix}.StartOfQuarter`, ['value'], guard((v) => rebuildStart(v, daysFromYmd(ymdOf(v).year, Math.floor((ymdOf(v).month - 1) / 3) * 3 + 1, 1))));
  def(`${prefix}.EndOfQuarter`, ['value'], guard((v) => {
    const { year, month } = ymdOf(v);
    const qm = Math.floor((month - 1) / 3) * 3 + 3;
    return rebuildEnd(v, daysFromYmd(year, qm, daysInMonth(year, qm)));
  }));
  def(`${prefix}.StartOfWeek`, ['value', '?firstDayOfWeek'], guard((v, f) => rebuildStart(v, daysOf(v) - ((dayOfWeek(daysOf(v)) - (f || 0) + 7) % 7))));
  def(`${prefix}.EndOfWeek`, ['value', '?firstDayOfWeek'], guard((v, f) => rebuildEnd(v, daysOf(v) - ((dayOfWeek(daysOf(v)) - (f || 0) + 7) % 7) + 6)));
  def(`${prefix}.MonthName`, ['value', '?culture'], guard((v, c) => cultureArg(c).monthNames[ymdOf(v).month - 1]));
  def(`${prefix}.DayOfWeekName`, ['value', '?culture'], guard((v, c) => cultureArg(c).dayNames[dayOfWeek(daysOf(v))]));
}

def('Date.From', ['value', '?culture'], (v, c) => toDate(v, cultureArg(c)));
def('Date.FromText', ['text', '?options'], (t, o) => toDate(asText(t), cultureArg(o instanceof MRecord ? o.getOr('Culture', null) : o)));
def('DateTime.From', ['value', '?culture'], (v, c) => toDateTime(v, cultureArg(c)));
def('DateTime.FromText', ['text', '?options'], (t, o) => toDateTime(asText(t), cultureArg(o instanceof MRecord ? o.getOr('Culture', null) : o)));
def('DateTimeZone.From', ['value', '?culture'], (v, c) => toDateTimeZone(v, cultureArg(c)));
def('DateTimeZone.FromText', ['text', '?options'], (t, o) => toDateTimeZone(asText(t), cultureArg(o instanceof MRecord ? o.getOr('Culture', null) : o)));
def('Time.From', ['value', '?culture'], (v, c) => toTime(v, cultureArg(c)));
def('Time.FromText', ['text', '?options'], (t, o) => toTime(asText(t), cultureArg(o instanceof MRecord ? o.getOr('Culture', null) : o)));
def('Duration.From', ['value'], (v) => toDuration(v));
def('Duration.FromText', ['text'], (t) => toDuration(t));

function textFmt(o, c) {
  if (o instanceof MRecord) return [o.getOr('Format', null), cultureArg(o.getOr('Culture', c === undefined ? null : c))];
  return [o === undefined ? null : o, cultureArg(c)];
}

for (const name of ['Date', 'DateTime', 'DateTimeZone', 'Time']) {
  def(`${name}.ToText`, ['value', '?format', '?culture'], (v, f, c) => {
    if (v === null) return null;
    const [fmt, culture] = textFmt(f, c);
    const base = formatDateTime(v, fmt, culture);
    if (v.k === 'dtz' && !fmt) return `${base} ${offsetText(v.offsetMin)}`;
    return base;
  });
}
def('Duration.ToText', ['duration', '?format'], (v) => (v === null ? null : formatDuration(v.ticks)));

def('Date.ToRecord', ['date'], (d) => MRecord.from({ ...ymdFromDays(d.days) }));
def('Date.AddDays', ['value', 'numberOfDays'], guard((v, n) => rebuild(v, daysOf(v) + Math.trunc(n))));
def('DateTime.Date', ['value'], guard((v) => mkDate(daysOf(toDateTime(v)))));
def('DateTime.Time', ['value'], guard((v) => mkTime(timeOf(toDateTime(v)))));
def('DateTimeZone.RemoveZone', ['value'], guard((v) => mkDateTime(v.ticks)));
def('DateTimeZone.ZoneHours', ['value'], guard((v) => Math.trunc(v.offsetMin / 60)));
def('DateTimeZone.ZoneMinutes', ['value'], guard((v) => v.offsetMin % 60));
def('DateTime.AddZone', ['dateTime', 'timezoneHours', '?timezoneMinutes'], (v, h, m) => (v === null ? null : mkDtz(v.ticks, h * 60 + Math.sign(h || 1) * (m || 0))));
def('DateTimeZone.SwitchZone', ['value', 'timezoneHours', '?timezoneMinutes'], (v, h, m) => {
  if (v === null) return null;
  const off = h * 60 + Math.sign(h || 1) * (m || 0);
  const utc = v.ticks - BigInt(v.offsetMin) * 600000000n;
  return mkDtz(utc + BigInt(off) * 600000000n, off);
});
def('DateTimeZone.ToLocal', ['value'], (v) => {
  if (v === null) return null;
  const off = RT.localOffsetMin || 0;
  const utc = v.ticks - BigInt(v.offsetMin) * 600000000n;
  return mkDtz(utc + BigInt(off) * 600000000n, off);
});
def('DateTimeZone.ToUtc', ['value'], (v) => (v === null ? null : mkDtz(v.ticks - BigInt(v.offsetMin) * 600000000n, 0)));

function nowParts() {
  RT.flags.add('time-dependent');
  const off = RT.localOffsetMin || 0;
  const ms = RT.now.getTime() + off * 60000;
  const ticks = BigInt(Math.floor(ms)) * 10000n + 621355968000000000n;
  return { ticks, off };
}

def('DateTime.LocalNow', [], () => mkDateTime(nowParts().ticks));
def('DateTime.FixedLocalNow', [], () => mkDateTime(nowParts().ticks));
def('Date.FixedLocalNow', [], () => mkDate(splitDateTime(nowParts().ticks).days));
def('DateTimeZone.LocalNow', [], () => mkDtz(nowParts().ticks, nowParts().off));
def('DateTimeZone.FixedLocalNow', [], () => mkDtz(nowParts().ticks, nowParts().off));
def('DateTimeZone.UtcNow', [], () => mkDtz(BigInt(RT.now.getTime()) * 10000n + 621355968000000000n, 0));
def('DateTimeZone.FixedUtcNow', [], () => mkDtz(BigInt(RT.now.getTime()) * 10000n + 621355968000000000n, 0));
def('Time.LocalNow', [], () => mkTime(splitDateTime(nowParts().ticks).time));

function today() {
  RT.flags.add('time-dependent');
  return splitDateTime(nowParts().ticks).days;
}

def('Date.IsInPreviousNDays', ['dateTime', 'days'], (v, n) => {
  if (v === null) return null;
  const d = daysOf(v);
  return d >= today() - n && d < today();
});
def('Date.IsInNextNDays', ['dateTime', 'days'], (v, n) => (v === null ? null : daysOf(v) > today() && daysOf(v) <= today() + n));
def('Date.IsInCurrentDay', ['dateTime'], (v) => (v === null ? null : daysOf(v) === today()));
def('Date.IsInCurrentMonth', ['dateTime'], (v) => {
  if (v === null) return null;
  const a = ymdOf(v);
  const b = ymdFromDays(today());
  return a.year === b.year && a.month === b.month;
});
def('Date.IsInCurrentYear', ['dateTime'], (v) => (v === null ? null : ymdOf(v).year === ymdFromDays(today()).year));
def('Date.IsInPreviousMonth', ['dateTime'], (v) => {
  if (v === null) return null;
  const b = ymdFromDays(today());
  const total = b.year * 12 + b.month - 2;
  const a = ymdOf(v);
  return a.year * 12 + a.month - 1 === total;
});
def('Date.IsInPreviousYear', ['dateTime'], (v) => (v === null ? null : ymdOf(v).year === ymdFromDays(today()).year - 1));

def('Time.Hour', ['time'], guard((v) => dateParts(v.k === 'time' ? v : mkTime(timeOf(v))).hour));
def('Time.Minute', ['time'], guard((v) => dateParts(v.k === 'time' ? v : mkTime(timeOf(v))).minute));
def('Time.Second', ['time'], guard((v) => dateParts(v.k === 'time' ? v : mkTime(timeOf(v))).second));
def('Time.StartOfHour', ['time'], guard((v) => mkTime(Math.floor(v.ticks / 36000000000) * 36000000000)));
def('DateTime.Hour', ['dateTime'], guard((v) => dateParts(v).hour));
def('DateTime.Minute', ['dateTime'], guard((v) => dateParts(v).minute));
def('DateTime.Second', ['dateTime'], guard((v) => dateParts(v).second));

const TPS = 10000000n;
const TPM = 600000000n;
const TPH = 36000000000n;
const bigDiv = (a, b) => Number(a / b);
def('Duration.Days', ['duration'], guard((v) => Number(v.ticks / TICKS_PER_DAY)));
def('Duration.Hours', ['duration'], guard((v) => Number((v.ticks % TICKS_PER_DAY) / TPH)));
def('Duration.Minutes', ['duration'], guard((v) => Number((v.ticks % TPH) / TPM)));
def('Duration.Seconds', ['duration'], guard((v) => Number(v.ticks % TPM) / 10000000));
def('Duration.TotalDays', ['duration'], guard((v) => Number(v.ticks) / Number(TICKS_PER_DAY)));
def('Duration.TotalHours', ['duration'], guard((v) => Number(v.ticks) / Number(TPH)));
def('Duration.TotalMinutes', ['duration'], guard((v) => Number(v.ticks) / Number(TPM)));
def('Duration.TotalSeconds', ['duration'], guard((v) => Number(v.ticks) / Number(TPS)));
void bigDiv;

function checkRange(ok, what, args) {
  if (!ok) throw expressionError(`The ${what} value is not valid.`, args);
}

def('#date', ['year', 'month', 'day'], (y, m, d) => {
  checkRange(Number.isInteger(y) && y >= 1 && y <= 9999 && Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= daysInMonth(y, m), 'date', [y, m, d]);
  return mkDate(daysFromYmd(y, m, d));
});
def('#time', ['hour', 'minute', 'second'], (h, m, s) => {
  checkRange(h >= 0 && h <= 24 && m >= 0 && m <= 59 && s >= 0 && s < 60 && (h < 24 || (m === 0 && s === 0)), 'time', [h, m, s]);
  return mkTime(Math.round(((h * 60 + m) * 60 + s) * 10000000));
});
def('#datetime', ['year', 'month', 'day', 'hour', 'minute', 'second'], (y, mo, d, h, mi, s) => {
  checkRange(y >= 1 && y <= 9999 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) && h >= 0 && h < 24 && mi >= 0 && mi < 60 && s >= 0 && s < 60, 'datetime', [y, mo, d, h, mi, s]);
  return mkDateTime(joinDateTime(daysFromYmd(y, mo, d), Math.round(((h * 60 + mi) * 60 + s) * 10000000)));
});
def('#datetimezone', ['year', 'month', 'day', 'hour', 'minute', 'second', 'offsetHours', 'offsetMinutes'], (y, mo, d, h, mi, s, oh, om) => {
  checkRange(y >= 1 && y <= 9999 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) && h >= 0 && h < 24 && mi >= 0 && mi < 60 && s >= 0 && s < 60, 'datetimezone', [y, mo, d]);
  return mkDtz(joinDateTime(daysFromYmd(y, mo, d), Math.round(((h * 60 + mi) * 60 + s) * 10000000)), oh * 60 + Math.sign(oh || 1) * om);
});
def('#duration', ['days', 'hours', 'minutes', 'seconds'], (d, h, m, s) => mkDuration(BigInt(Math.round((((d * 24 + h) * 60 + m) * 60 + s) * 10000000))));
def('Date.Duration', [], () => null);
def('List.Dates', ['start', 'count', 'step'], (start, count, step) => {
  const out = [];
  let cur = start.days;
  const stepDays = Number(step.ticks / TICKS_PER_DAY);
  for (let i = 0; i < count; i++) {
    out.push(mkDate(cur));
    cur += stepDays;
  }
  return listOf(out);
});

export { isDay, kindOf, isLeap };
