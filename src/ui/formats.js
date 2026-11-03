const cache = new Map();

export function formatsFor(culture) {
  const key = culture || 'en-US';
  let f = cache.get(key);
  if (f) return f;
  let name = key;
  try {
    Intl.NumberFormat.supportedLocalesOf([name]);
    new Intl.NumberFormat(name);
  } catch {
    name = 'en-US';
  }
  f = Object.freeze({
    culture: name,
    integer: new Intl.NumberFormat(name),
    number: new Intl.NumberFormat(name, { maximumFractionDigits: 15, useGrouping: false })
  });
  cache.set(key, f);
  return f;
}
