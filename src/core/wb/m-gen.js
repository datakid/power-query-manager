import { KEYWORDS } from '../m/lexer.js';
import { quoteIdent, textLiteral } from './ident.js';

export { quoteIdent, textLiteral };

const BARE_FIELD = /^[\p{L}_][\p{L}\p{Nd}_]*( [\p{L}\p{Nd}_]+)*$/u;

export function fieldRef(name) {
  const bare = BARE_FIELD.test(name) && !name.split(' ').some((w) => KEYWORDS.has(w));
  return bare ? `[${name}]` : `[#"${name.replace(/"/g, '""')}"]`;
}

export function numberLiteral(n) {
  if (Number.isNaN(n)) return '#nan';
  if (n === Infinity) return '#infinity';
  if (n === -Infinity) return '-#infinity';
  if (Object.is(n, -0)) return '0';
  return String(n);
}

function parts(text, count) {
  const m = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${count > 3 ? '[T ](\\d{2}):(\\d{2})(?::(\\d{2}(?:\\.\\d+)?))?' : ''}`).exec(text);
  if (!m) throw new Error(`"${text}" is not an ISO date.`);
  return m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
}

export function literal(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return textLiteral(v);
  if (typeof v === 'number') return numberLiteral(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v.date) return `#date(${parts(v.date, 3).join(', ')})`;
  if (v.datetime) return `#datetime(${parts(v.datetime, 6).join(', ')})`;
  if (v.time) {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(v.time);
    if (!m) throw new Error(`"${v.time}" is not a time.`);
    return `#time(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3] || 0)})`;
  }
  throw new Error('That value has no M literal.');
}

const TYPES = {
  text: 'type text',
  number: 'type number',
  integer: 'Int64.Type',
  decimal: 'Decimal.Type',
  currency: 'Currency.Type',
  percentage: 'Percentage.Type',
  date: 'type date',
  datetime: 'type datetime',
  datetimezone: 'type datetimezone',
  time: 'type time',
  duration: 'type duration',
  logical: 'type logical',
  binary: 'type binary',
  any: 'type any'
};

const list = (items) => `{${items.join(', ')}}`;
const textList = (names) => list(names.map(textLiteral));

const FILTERS = {
  equals: (c, v) => `${c} = ${literal(v)}`,
  notEquals: (c, v) => `${c} <> ${literal(v)}`,
  gt: (c, v) => `${c} > ${literal(v)}`,
  gte: (c, v) => `${c} >= ${literal(v)}`,
  lt: (c, v) => `${c} < ${literal(v)}`,
  lte: (c, v) => `${c} <= ${literal(v)}`,
  isNull: (c) => `${c} = null`,
  isNotNull: (c) => `${c} <> null`,
  contains: (c, v, o) => `Text.Contains(${c}, ${literal(String(v))}${o.ignoreCase ? ', Comparer.OrdinalIgnoreCase' : ''})`,
  beginsWith: (c, v, o) => `Text.StartsWith(${c}, ${literal(String(v))}${o.ignoreCase ? ', Comparer.OrdinalIgnoreCase' : ''})`,
  endsWith: (c, v, o) => `Text.EndsWith(${c}, ${literal(String(v))}${o.ignoreCase ? ', Comparer.OrdinalIgnoreCase' : ''})`
};

export const FILTER_OPS = [...Object.keys(FILTERS), 'in'];

export function uniqueName(base, existing) {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 1; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function needColumns(action, key = 'columns') {
  const cols = action[key];
  if (!Array.isArray(cols) || !cols.length) throw new Error('Choose at least one column.');
  return cols;
}

function build(action, prev) {
  switch (action.type) {
    case 'filter': {
      const c = fieldRef(action.column);
      let cond;
      if (action.op === 'in') {
        if (!Array.isArray(action.values) || !action.values.length) throw new Error('Choose at least one value.');
        cond = `List.Contains(${list(action.values.map(literal))}, ${c})`;
      } else if (FILTERS[action.op]) cond = FILTERS[action.op](c, action.value, action);
      else throw new Error(`The filter "${action.op}" is not known.`);
      return { key: 'filter', expr: `Table.SelectRows(${prev}, each ${cond})` };
    }
    case 'sort': {
      const cols = needColumns(action);
      return { key: 'sort', expr: `Table.Sort(${prev}, ${list(cols.map((c) => `{${textLiteral(c.name)}, ${c.descending ? 'Order.Descending' : 'Order.Ascending'}}`))})` };
    }
    case 'removeColumns':
      return { key: 'removeColumns', expr: `Table.RemoveColumns(${prev}, ${textList(needColumns(action))})` };
    case 'keepColumns':
      return { key: 'keepColumns', expr: `Table.SelectColumns(${prev}, ${textList(needColumns(action))})` };
    case 'renameColumn': {
      const pairs = needColumns(action, 'renames');
      return { key: 'renameColumn', expr: `Table.RenameColumns(${prev}, ${list(pairs.map((p) => `{${textLiteral(p.from)}, ${textLiteral(p.to)}}`))})` };
    }
    case 'changeType': {
      const cols = needColumns(action);
      for (const c of cols) if (!TYPES[c.type]) throw new Error(`The type "${c.type}" is not known.`);
      return { key: 'changeType', expr: `Table.TransformColumnTypes(${prev}, ${list(cols.map((c) => `{${textLiteral(c.name)}, ${TYPES[c.type]}}`))})` };
    }
    case 'removeDuplicates':
      return { key: 'removeDuplicates', expr: action.columns && action.columns.length ? `Table.Distinct(${prev}, ${textList(action.columns)})` : `Table.Distinct(${prev})` };
    case 'keepFirstRows': {
      if (!Number.isInteger(action.count) || action.count < 0) throw new Error('The number of rows must be a whole number, zero or more.');
      return { key: 'keepFirstRows', expr: `Table.FirstN(${prev}, ${action.count})` };
    }
    case 'replaceValue': {
      const replacer = action.mode === 'text' ? 'Replacer.ReplaceText' : 'Replacer.ReplaceValue';
      return { key: 'replaceValue', expr: `Table.ReplaceValue(${prev}, ${literal(action.find)}, ${literal(action.replace)}, ${replacer}, ${textList([action.column])})` };
    }
    default:
      throw new Error(`The action "${action.type}" is not known.`);
  }
}

export function generateStep(action, { prev, existing = [], names }) {
  const { key, expr } = build(action, quoteIdent(prev));
  const name = uniqueName(names[key], existing);
  return { name, expr, binding: `${quoteIdent(name)} = ${expr}`, kind: key };
}
