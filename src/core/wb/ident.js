import { KEYWORDS } from '../m/lexer.js';

const PART = '[\\p{L}_][\\p{L}\\p{Nd}\\p{Mn}\\p{Mc}\\p{Pc}]*';
const BARE = new RegExp(`^${PART}(\\.${PART})*$`, 'u');

export function isBareIdent(name) {
  return BARE.test(name) && !KEYWORDS.has(name);
}

export function quoteIdent(name) {
  return isBareIdent(name) ? name : `#"${name.replace(/"/g, '""')}"`;
}

export function textLiteral(value) {
  const text = String(value).replace(/#\(/g, '#(#)(');
  let out = '"';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '""';
    else if (ch === '\r') out += '#(cr)';
    else if (ch === '\n') out += '#(lf)';
    else if (ch === '\t') out += '#(tab)';
    else if (c < 0x20 || c === 0x7f) out += `#(${c.toString(16).padStart(4, '0')})`;
    else out += ch;
  }
  return `${out}"`;
}
