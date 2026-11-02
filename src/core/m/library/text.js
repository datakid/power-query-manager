import { MList, listOf, expressionError, T, MRecord, kindOf, valuesEqual, compareValues } from '../values.js';
import { def, asText, asList, asFn, textList, call, asNumber } from './core.js';
import { toText, cultureArg } from '../convert.js';
import { cannotConvert } from '../eval.js';
import { RT } from '../runtime.js';

const t = (v) => (v === null || v === undefined ? null : asText(v));

def('Text.Upper', ['text', '?culture'], (s) => (t(s) === null ? null : s.toUpperCase()));
def('Text.Lower', ['text', '?culture'], (s) => (t(s) === null ? null : s.toLowerCase()));
def('Text.Proper', ['text', '?culture'], (s) => (t(s) === null ? null : s.toLowerCase().replace(/(^|[^\p{L}\p{Nd}'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())));

const WS = /[\s\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
function trimChars(s, chars, start, end) {
  const test = chars === undefined || chars === null ? (c) => WS.test(c) : typeof chars === 'string' ? (c) => chars.includes(c) : (c) => asList(chars).toArray().includes(c);
  let a = 0;
  let b = s.length;
  if (start) while (a < b && test(s[a])) a++;
  if (end) while (b > a && test(s[b - 1])) b--;
  return s.slice(a, b);
}
def('Text.Trim', ['text', '?trim'], (s, c) => (t(s) === null ? null : trimChars(s, c, true, true)));
def('Text.TrimStart', ['text', '?trim'], (s, c) => (t(s) === null ? null : trimChars(s, c, true, false)));
def('Text.TrimEnd', ['text', '?trim'], (s, c) => (t(s) === null ? null : trimChars(s, c, false, true)));
def('Text.Clean', ['text'], (s) => (t(s) === null ? null : s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')));
def('Text.Length', ['text'], (s) => (t(s) === null ? null : [...s].length));
def('Text.Start', ['text', 'count'], (s, n) => (t(s) === null ? null : s.slice(0, n)));
def('Text.End', ['text', 'count'], (s, n) => (t(s) === null ? null : n === 0 ? '' : s.slice(-n)));
def('Text.Middle', ['text', 'start', '?count'], (s, a, n) => {
  if (t(s) === null) return null;
  if (a < 0) throw expressionError('The start index must be non-negative.', a);
  return n === undefined || n === null ? s.slice(a) : s.slice(a, a + n);
});
def('Text.Range', ['text', 'offset', '?count'], (s, a, n) => {
  if (t(s) === null) return null;
  if (a > s.length || a < 0) throw expressionError('The offset is outside the text.', a);
  if (n !== undefined && n !== null && a + n > s.length) throw expressionError('The range extends beyond the text.', n);
  return n === undefined || n === null ? s.slice(a) : s.slice(a, a + n);
});

const eqFn = (cmp) => {
  if (cmp === undefined || cmp === null) return (a, b) => a === b;
  const f = asFn(cmp);
  return (a, b) => Number(f.invoke([a, b])) === 0;
};

function findPositions(s, sub, cmp) {
  const out = [];
  if (!sub.length) return out;
  const same = eqFn(cmp);
  const useFast = cmp === undefined || cmp === null;
  for (let i = 0; i + sub.length <= s.length; i++) {
    if (useFast ? s.startsWith(sub, i) : same(s.slice(i, i + sub.length), sub)) out.push(i);
  }
  return out;
}

def('Text.Contains', ['text', 'substring', '?comparer'], (s, sub, c) => (t(s) === null ? null : sub === '' ? true : findPositions(s, sub, c).length > 0));
def('Text.StartsWith', ['text', 'substring', '?comparer'], (s, sub, c) => (t(s) === null ? null : sub === '' ? true : (c ? eqFn(c)(s.slice(0, sub.length), sub) : s.startsWith(sub))));
def('Text.EndsWith', ['text', 'substring', '?comparer'], (s, sub, c) => (t(s) === null ? null : sub === '' ? true : (c ? eqFn(c)(s.slice(-sub.length), sub) : s.endsWith(sub))));
def('Text.PositionOf', ['text', 'substring', '?occurrence', '?comparer'], (s, sub, occ, c) => {
  if (t(s) === null) return null;
  const all = findPositions(s, sub, c);
  const mode = occ === undefined || occ === null ? 0 : occ;
  if (mode === 2) return listOf(all);
  if (!all.length) return -1;
  return mode === 1 ? all[all.length - 1] : all[0];
});
def('Text.PositionOfAny', ['text', 'characters', '?occurrence'], (s, chars, occ) => {
  const set = textList(chars);
  const pos = [];
  for (let i = 0; i < s.length; i++) if (set.includes(s[i])) pos.push(i);
  if (occ === 2) return listOf(pos);
  if (!pos.length) return -1;
  return occ === 1 ? pos[pos.length - 1] : pos[0];
});
def('Text.Replace', ['text', 'old', 'new'], (s, o, n) => {
  if (t(s) === null) return null;
  if (o === '') return s;
  return s.split(o).join(n);
});
def('Text.Remove', ['text', 'removeChars'], (s, chars) => {
  if (t(s) === null) return null;
  const set = new Set(typeof chars === 'string' ? [...chars] : textList(chars));
  return [...s].filter((c) => !set.has(c)).join('');
});
def('Text.RemoveRange', ['text', 'offset', '?count'], (s, o, n) => s.slice(0, o) + s.slice(o + (n === undefined ? 1 : n)));
def('Text.ReplaceRange', ['text', 'offset', 'count', 'newText'], (s, o, n, x) => s.slice(0, o) + x + s.slice(o + n));
def('Text.Select', ['text', 'selectChars'], (s, chars) => {
  if (t(s) === null) return null;
  const set = new Set(typeof chars === 'string' ? [...chars] : textList(chars));
  return [...s].filter((c) => set.has(c)).join('');
});
def('Text.Split', ['text', 'separator'], (s, sep) => {
  if (t(s) === null) return null;
  return listOf(sep === '' ? [...s] : s.split(sep));
});
def('Text.SplitAny', ['text', 'separators'], (s, seps) => {
  const set = [...seps];
  const out = [];
  let cur = '';
  for (const ch of s) {
    if (set.includes(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return listOf(out);
});
def('Text.Combine', ['texts', '?separator'], (list, sep) => {
  const items = asList(list).toArray().filter((x) => x !== null).map((x) => {
    if (typeof x !== 'string') throw cannotConvert(x, 'Text');
    return x;
  });
  return items.join(sep === undefined || sep === null ? '' : sep);
});
def('Text.PadStart', ['text', 'count', '?character'], (s, n, ch) => (t(s) === null ? null : s.padStart(n, ch === undefined || ch === null ? ' ' : ch)));
def('Text.PadEnd', ['text', 'count', '?character'], (s, n, ch) => (t(s) === null ? null : s.padEnd(n, ch === undefined || ch === null ? ' ' : ch)));
def('Text.From', ['value', '?culture'], (v, c) => toText(v, cultureArg(c)));
def('Text.Insert', ['text', 'offset', 'newText'], (s, o, x) => {
  if (o < 0 || o > s.length) throw expressionError('The offset is outside the text.', o);
  return s.slice(0, o) + x + s.slice(o);
});
def('Text.Repeat', ['text', 'count'], (s, n) => (t(s) === null ? null : s.repeat(n)));
def('Text.Reverse', ['text'], (s) => (t(s) === null ? null : [...s].reverse().join('')));
def('Text.ToList', ['text'], (s) => (t(s) === null ? null : listOf([...s])));
def('Text.AfterDelimiter', ['text', 'delimiter', '?index'], (s, d, idx) => delim(s, d, idx, 'after'));
def('Text.BeforeDelimiter', ['text', 'delimiter', '?index'], (s, d, idx) => delim(s, d, idx, 'before'));
def('Text.BetweenDelimiters', ['text', 'startDelimiter', 'endDelimiter', '?startIndex', '?endIndex'], (s, a, b, si, ei) => {
  if (t(s) === null) return null;
  const after = delim(s, a, si, 'after');
  if (after === null) return null;
  return delim(after, b, ei, 'before');
});

function delim(s, d, idx, side) {
  if (t(s) === null) return null;
  let n = 0;
  let fromEnd = false;
  if (idx instanceof MList) {
    n = idx.at(0);
    fromEnd = idx.at(1) === 1;
  } else if (typeof idx === 'number') n = idx;
  const pos = findPositions(s, d);
  if (d === '') return side === 'after' ? s : '';
  let at;
  if (fromEnd) at = pos[pos.length - 1 - n];
  else at = pos[n];
  if (at === undefined) {
    if (pos.length === 0 && n === 0 && false) return null;
    throw expressionError('The specified delimiter was not found in the text.', d);
  }
  return side === 'after' ? s.slice(at + d.length) : s.slice(0, at);
}

def('Text.Format', ['formatString', '?arguments', '?culture'], (fmt, args, c) => {
  const culture = cultureArg(c);
  return fmt.replace(/#\{([^}]*)\}/g, (m, key) => {
    let v;
    if (args instanceof MRecord) v = args.get(key);
    else if (args instanceof MList) v = args.at(Number(key));
    else throw expressionError('Text.Format arguments must be a list or record.');
    return toText(v, culture) ?? '';
  });
});
def('Text.NewGuid', [], () => crypto.randomUUID());
def('Text.Order', ['x', 'y'], (a, b) => compareValues(a, b));
def('Character.FromNumber', ['number'], (n) => (n === null ? null : String.fromCodePoint(n)));
def('Character.ToNumber', ['character'], (c) => (c === null ? null : c.codePointAt(0)));
def('Guid.From', ['value'], (v) => v);

export { T, kindOf, valuesEqual, call, asNumber, RT };
