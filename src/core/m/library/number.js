import { expressionError, formatError, MList, listOf } from '../values.js';
import { RT, random } from '../runtime.js';
import { def, asNumber, asList } from './core.js';
import { toNumber, cultureArg, convertToType, roundMode } from '../convert.js';
import { formatNumber } from '../format.js';
import { T, prim } from '../values.js';

const num = (v) => (v === null ? null : asNumber(v));

function roundDigits(x, digits, mode) {
  if (!Number.isFinite(x)) return x;
  if (digits === 0 || digits === undefined || digits === null) return roundMode(x, mode);
  const f = Math.pow(10, Math.abs(digits));
  if (digits > 0) {
    const scaled = Number((x * f).toPrecision(15));
    return roundMode(scaled, mode) / f;
  }
  return roundMode(x / f, mode) * f;
}

const modeOf = (m) => (m === undefined || m === null ? 4 : m);

def('Number.From', ['value', '?culture'], (v, c) => toNumber(v, cultureArg(c)));
def('Number.FromText', ['text', '?culture'], (t, c) => {
  if (t === null) return null;
  if (typeof t !== 'string') throw expressionError('Number.FromText expects text.', t);
  return toNumber(t, cultureArg(c));
});
def('Number.ToText', ['number', '?format', '?culture'], (n, f, c) => (n === null ? null : formatNumber(asNumber(n), f === undefined ? null : f, cultureArg(c))));
def('Number.Round', ['number', '?digits', '?roundingMode'], (n, d, m) => (n === null ? null : roundDigits(asNumber(n), d, modeOf(m))));
def('Number.RoundUp', ['number', '?digits'], (n, d) => (n === null ? null : roundDigits(n, d, 1)));
def('Number.RoundDown', ['number', '?digits'], (n, d) => (n === null ? null : roundDigits(n, d, 0)));
def('Number.RoundTowardZero', ['number', '?digits'], (n, d) => (n === null ? null : roundDigits(n, d, 2)));
def('Number.RoundAwayFromZero', ['number', '?digits'], (n, d) => (n === null ? null : roundDigits(n, d, 5)));
def('Number.Abs', ['number'], (n) => (n === null ? null : Math.abs(n)));
def('Number.Sign', ['number'], (n) => (n === null ? null : Math.sign(n)));
def('Number.Sqrt', ['number'], (n) => (n === null ? null : Math.sqrt(n)));
def('Number.Power', ['number', 'power'], (n, p) => (n === null || p === null ? null : Math.pow(n, p)));
def('Number.Exp', ['number'], (n) => (n === null ? null : Math.exp(n)));
def('Number.Ln', ['number'], (n) => (n === null ? null : Math.log(n)));
def('Number.Log10', ['number'], (n) => (n === null ? null : Math.log10(n)));
def('Number.Log', ['number', '?base'], (n, b) => (n === null ? null : b === undefined ? Math.log(n) : Math.log(n) / Math.log(b)));
def('Number.IsNaN', ['number'], (n) => (n === null ? null : Number.isNaN(n)));
def('Number.IsEven', ['number'], (n) => (n === null ? null : n % 2 === 0));
def('Number.IsOdd', ['number'], (n) => (n === null ? null : Math.abs(n % 2) === 1));
def('Number.Mod', ['number', 'divisor'], (n, d) => {
  if (n === null || d === null) return null;
  const r = n % d;
  return r;
});
def('Number.IntegerDivide', ['number', 'divisor'], (n, d) => (n === null || d === null ? null : Math.trunc(n / d)));
def('Number.Factorial', ['number'], (n) => {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
});
def('Number.Sin', ['number'], (n) => (n === null ? null : Math.sin(n)));
def('Number.Cos', ['number'], (n) => (n === null ? null : Math.cos(n)));
def('Number.Tan', ['number'], (n) => (n === null ? null : Math.tan(n)));
def('Number.PI', [], () => Math.PI);
def('Number.E', [], () => Math.E);
def('Number.Random', [], () => random());
def('Number.RandomBetween', ['bottom', 'top'], (a, b) => a + random() * (b - a));
def('Number.BitwiseAnd', ['a', 'b'], (a, b) => (a & b));
def('Number.BitwiseOr', ['a', 'b'], (a, b) => (a | b));
def('Number.BitwiseXor', ['a', 'b'], (a, b) => (a ^ b));
def('Number.BitwiseShiftLeft', ['a', 'b'], (a, b) => (a << b));
def('Number.BitwiseShiftRight', ['a', 'b'], (a, b) => (a >> b));

const facetFrom = (name, type) => def(name, ['value', '?culture', '?roundingMode'], (v, c, m) => {
  if (v === null) return null;
  if (type.facet && ['int64', 'int32', 'int16', 'int8', 'byte'].includes(type.facet)) {
    const n = toNumber(v, cultureArg(c));
    return convertToIntFacet(n, type, modeOf(m));
  }
  return convertToType(v, type, cultureArg(c));
});

function convertToIntFacet(n, type, mode) {
  const ranges = { int64: [-9223372036854775808, 9223372036854775807], int32: [-2147483648, 2147483647], int16: [-32768, 32767], int8: [-128, 127], byte: [0, 255] };
  const r = roundMode(n, mode);
  const [lo, hi] = ranges[type.facet];
  if (!Number.isFinite(r) || r < lo || r > hi) throw formatError('Overflow: the value is outside the range of the type.', n);
  return r;
}

facetFrom('Int64.From', prim('number', false, 'int64'));
facetFrom('Int32.From', prim('number', false, 'int32'));
facetFrom('Int16.From', prim('number', false, 'int16'));
facetFrom('Int8.From', prim('number', false, 'int8'));
facetFrom('Byte.From', prim('number', false, 'byte'));
def('Decimal.From', ['value', '?culture'], (v, c) => toNumber(v, cultureArg(c)));
def('Double.From', ['value', '?culture'], (v, c) => toNumber(v, cultureArg(c)));
def('Single.From', ['value', '?culture'], (v, c) => (v === null ? null : Math.fround(toNumber(v, cultureArg(c)))));
def('Currency.From', ['value', '?culture', '?roundingMode'], (v, c) => (v === null ? null : Math.round(toNumber(v, cultureArg(c)) * 10000) / 10000));
def('Percentage.From', ['value', '?culture'], (v, c) => toNumber(v, cultureArg(c)));

export { num, T, MList, listOf, asList, RT };
