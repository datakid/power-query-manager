import { lex } from '../m/lexer.js';

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);

const isTrivia = (t) => t.kind === 'ws' || t.kind === 'comment';

export function splitSection(text) {
  const tokens = lex(text);
  const sig = tokens.filter((t) => !isTrivia(t));
  const errors = [];
  const members = [];
  let i = 0;
  let header = null;

  const skipBracketGroup = () => {
    let depth = 0;
    const start = sig[i];
    while (i < sig.length) {
      const t = sig[i];
      if (t.kind === 'op' && OPEN.has(t.value)) depth++;
      else if (t.kind === 'op' && CLOSE.has(t.value)) depth--;
      i++;
      if (depth === 0) return { start: start.start, end: sig[i - 1].end };
    }
    return { start: start.start, end: sig[sig.length - 1].end };
  };

  if (sig[i] && sig[i].kind === 'op' && sig[i].value === '[') skipBracketGroup();
  if (sig[i] && sig[i].kind === 'keyword' && sig[i].value === 'section') {
    const kw = sig[i];
    i++;
    const nameTok = sig[i];
    if (nameTok && (nameTok.kind === 'ident' || nameTok.kind === 'qident')) {
      i++;
      if (sig[i] && sig[i].kind === 'op' && sig[i].value === ';') {
        header = { start: kw.start, end: sig[i].end, name: nameTok.value };
        i++;
      } else {
        errors.push({ message: 'Expected ";" after the section name.', at: nameTok.end });
      }
    } else {
      errors.push({ message: 'Expected a section name.', at: kw.end });
    }
  } else {
    errors.push({ message: 'Expected "section".', at: 0 });
  }

  while (i < sig.length) {
    const first = sig[i];
    let attr = null;
    if (first.kind === 'op' && first.value === '[') attr = skipBracketGroup();
    let shared = false;
    let sharedTok = null;
    let nameTok = sig[i];
    if (nameTok && nameTok.kind === 'keyword' && nameTok.value === 'shared') {
      shared = true;
      sharedTok = nameTok;
      i++;
      nameTok = sig[i];
    }
    if (!nameTok || (nameTok.kind !== 'ident' && nameTok.kind !== 'qident')) {
      errors.push({ message: 'Expected a member name.', at: nameTok ? nameTok.start : text.length });
      break;
    }
    i++;
    const eq = sig[i];
    if (!eq || eq.kind !== 'op' || eq.value !== '=') {
      errors.push({ message: `Expected "=" after ${nameTok.kind === 'qident' ? `#"${nameTok.value}"` : nameTok.value}.`, at: nameTok.end });
      break;
    }
    i++;
    let depth = 0;
    const exprFirst = i;
    let semi = null;
    while (i < sig.length) {
      const t = sig[i];
      if (t.kind === 'op') {
        if (OPEN.has(t.value)) depth++;
        else if (CLOSE.has(t.value)) depth--;
        else if (t.value === ';' && depth <= 0) {
          semi = t;
          break;
        }
      }
      i++;
    }
    let exprStart = eq.end;
    while (exprStart < text.length && /\s/.test(text[exprStart])) exprStart++;
    let exprEnd = semi ? semi.start : text.length;
    while (exprEnd > exprStart && /\s/.test(text[exprEnd - 1])) exprEnd--;
    if (!semi) errors.push({ message: 'Expected ";" at the end of the member.', at: text.length });
    if (i === exprFirst) errors.push({ message: 'Expected an expression.', at: eq.end });
    members.push({
      name: nameTok.value,
      shared,
      attributes: attr,
      start: attr ? attr.start : shared ? sharedTok.start : nameTok.start,
      nameStart: nameTok.start,
      nameEnd: nameTok.end,
      exprStart,
      exprEnd,
      end: semi ? semi.end : text.length,
      terminated: !!semi
    });
    if (semi) i++;
  }
  return { header, members, errors };
}

export function dominantEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  if (crlf === 0 && lf === 0) return null;
  return crlf >= lf ? '\r\n' : '\n';
}

export const toViewText = (raw) => raw.replace(/\r\n?/g, '\n');

export function fromViewText(view, eol) {
  return eol === '\r\n' ? view.replace(/\n/g, '\r\n') : view;
}

export function memberEol(sectionText, member) {
  const expr = sectionText.slice(member.exprStart, member.exprEnd);
  return dominantEol(expr) || dominantEol(sectionText) || '\r\n';
}

function endsInLineComment(text) {
  const tokens = lex(text);
  const last = tokens[tokens.length - 1];
  return !!last && last.kind === 'comment' && last.value.startsWith('//');
}

export function rebuildSection(sectionText, members, edits) {
  const pieces = [];
  for (const m of members) {
    if (!edits.has(m.name)) continue;
    const eol = memberEol(sectionText, m);
    let replacement = fromViewText(edits.get(m.name), eol);
    if (endsInLineComment(replacement)) replacement += eol;
    pieces.push({ start: m.exprStart, end: m.exprEnd, replacement });
  }
  pieces.sort((a, b) => b.start - a.start);
  let out = sectionText;
  for (const p of pieces) out = out.slice(0, p.start) + p.replacement + out.slice(p.end);
  return out;
}
