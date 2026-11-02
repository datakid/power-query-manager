import { kindOf, cell, force, splitDateTime, TICKS_PER_DAY, daysFromYmd } from '../m/values.js';
import { toText } from '../m/convert.js';
import { formatDateTime, formatDuration } from '../m/format.js';
import { offsetText } from '../m/convert.js';

const OA_EPOCH = daysFromYmd(1899, 12, 30);

export function cellValue(raw) {
  try {
    return { ok: true, v: cell(force(raw)) };
  } catch (e) {
    if (e && e.isM) return { ok: false, error: e };
    throw e;
  }
}

export function serialOf(v) {
  const k = kindOf(v);
  if (k === 'date') return v.days - OA_EPOCH;
  if (k === 'datetime' || k === 'datetimezone') {
    const p = splitDateTime(v.ticks);
    return p.days - OA_EPOCH + p.time / Number(TICKS_PER_DAY);
  }
  if (k === 'time') return v.ticks / Number(TICKS_PER_DAY);
  return null;
}

export function exportText(v, culture) {
  const k = kindOf(v);
  switch (k) {
    case 'null':
      return '';
    case 'text':
      return v;
    case 'number':
      return toText(v, culture);
    case 'logical':
      return v ? 'true' : 'false';
    case 'date':
      return formatDateTime(v, 'yyyy-MM-dd', culture);
    case 'time':
      return formatDateTime(v, 'HH:mm:ss', culture);
    case 'datetime':
      return formatDateTime(v, "yyyy-MM-dd'T'HH:mm:ss", culture);
    case 'datetimezone':
      return `${formatDateTime(v, "yyyy-MM-dd'T'HH:mm:ss", culture)}${offsetText(v.offsetMin)}`;
    case 'duration':
      return formatDuration(v.ticks);
    case 'binary':
      return '';
    case 'list':
      return 'List';
    case 'record':
      return 'Record';
    case 'table':
      return 'Table';
    case 'function':
      return 'Function';
    default:
      return '';
  }
}
