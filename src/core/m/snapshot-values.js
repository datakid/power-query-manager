import { mkDateTime, joinDateTime, daysFromYmd, TICKS_PER_DAY } from './values.js';

const OA_EPOCH = daysFromYmd(1899, 12, 30);

export function serialToEpochDays(serial, date1904, mode) {
  if (mode === 'iso') return null;
  const days = Math.floor(serial);
  const frac = Math.round((serial - days) * Number(TICKS_PER_DAY));
  const base = date1904 ? daysFromYmd(1904, 1, 1) : days < 61 ? daysFromYmd(1899, 12, 31) : OA_EPOCH;
  return mkDateTime(joinDateTime(base + days, frac));
}
