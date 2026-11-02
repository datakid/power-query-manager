import { lex, KEYWORDS } from '../core/m/lexer.js';
import { LIB } from '../core/m/library/index.js';

const VBA_KEYWORDS = new Set(['Sub', 'Function', 'End', 'If', 'Then', 'Else', 'ElseIf', 'For', 'Next', 'To', 'Step', 'Each', 'In', 'While', 'Wend', 'Do', 'Loop', 'Until', 'Dim', 'As', 'Set', 'Let', 'Private', 'Public', 'Friend', 'Static', 'Const', 'Option', 'Explicit', 'Base', 'Compare', 'Text', 'Binary', 'Type', 'Enum', 'Property', 'Get', 'ByVal', 'ByRef', 'Optional', 'ParamArray', 'Call', 'Exit', 'Select', 'Case', 'With', 'New', 'Not', 'And', 'Or', 'Xor', 'Eqv', 'Imp', 'Mod', 'Is', 'Like', 'True', 'False', 'Nothing', 'Null', 'Empty', 'On', 'Error', 'Resume', 'GoTo', 'GoSub', 'Return', 'Redim', 'Preserve', 'Erase', 'Declare', 'Lib', 'Alias', 'Event', 'RaiseEvent', 'WithEvents', 'Implements', 'Attribute', 'Stop', 'Open', 'Close', 'Print', 'Input', 'Output', 'Append', 'Boolean', 'Byte', 'Currency', 'Date', 'Double', 'Integer', 'Long', 'LongLong', 'LongPtr', 'Object', 'Single', 'String', 'Variant']);
const VBA_LOWER = new Set([...VBA_KEYWORDS].map((k) => k.toLowerCase()));

export const BRACKETS = { '(': ')', '[': ']', '{': '}' };
export const CLOSERS = { ')': '(', ']': '[', '}': '{' };

function mClass(tok) {
  switch (tok.kind) {
    case 'keyword':
      return tok.value.startsWith('#') ? 'tok-num' : 'tok-kw';
    case 'ident':
      return LIB.has(tok.value) ? 'tok-fn' : '';
    case 'qident':
      return 'tok-qid';
    case 'string':
      return 'tok-str';
    case 'number':
      return 'tok-num';
    case 'comment':
      return 'tok-com';
    case 'op':
      return 'tok-op';
    case 'error':
      return tok.unterminated === 'comment' ? 'tok-com' : tok.unterminated ? 'tok-str' : 'tok-err';
    default:
      return '';
  }
}

export function splitLinesWithOffsets(text) {
  const lines = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      lines.push({ start, end: i });
      start = i + 1;
    }
  }
  return lines;
}

function pushPiece(lines, lineIndexOf, tokStart, tokEnd, cls, offsets) {
  let s = tokStart;
  while (s < tokEnd) {
    const li = lineIndexOf(s);
    const line = offsets[li];
    const e = Math.min(tokEnd, line.end);
    if (e > s) lines[li].push({ cls, start: s - line.start, end: e - line.start });
    s = line.end + 1;
  }
}

export function highlightLines(text, language) {
  const offsets = splitLinesWithOffsets(text);
  const lines = offsets.map(() => []);
  let cursor = 0;
  const lineIndexOf = (pos) => {
    while (cursor > 0 && offsets[cursor].start > pos) cursor--;
    while (cursor < offsets.length - 1 && offsets[cursor].end < pos) cursor++;
    return cursor;
  };
  if (language === 'vba') {
    for (let li = 0; li < offsets.length; li++) {
      const { start, end } = offsets[li];
      const line = text.slice(start, end);
      for (const piece of vbaLine(line)) lines[li].push(piece);
    }
    return lines;
  }
  const tokens = lex(text.replace(/\r/g, ' '));
  for (const tok of tokens) {
    if (tok.kind === 'ws') continue;
    const cls = mClass(tok);
    if (!cls) continue;
    pushPiece(lines, lineIndexOf, tok.start, tok.end, cls, offsets);
  }
  return lines;
}

function vbaLine(line) {
  const out = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === "'" || (/^rem\b/i.test(line.slice(i)) && /^\s*$/.test(line.slice(0, i)))) {
      out.push({ cls: 'tok-com', start: i, end: n });
      return out;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (line[j] === '"') {
          if (line[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out.push({ cls: 'tok-str', start: i, end: Math.min(j + 1, n) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.eE&%#]/.test(line[j])) j++;
      out.push({ cls: 'tok-num', start: i, end: j });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(line[j])) j++;
      if (VBA_LOWER.has(line.slice(i, j).toLowerCase())) out.push({ cls: 'tok-kw', start: i, end: j });
      i = j;
      continue;
    }
    if (/[=<>+\-*/\\^&(),:.]/.test(ch)) out.push({ cls: 'tok-op', start: i, end: i + 1 });
    i++;
  }
  return out;
}

export function matchBracket(text, caret, language) {
  if (language === 'vba') return null;
  const tokens = lex(text.replace(/\r/g, ' ')).filter((t) => t.kind === 'op' && (t.value in BRACKETS || t.value in CLOSERS));
  let idx = tokens.findIndex((t) => t.start === caret - 1 || t.start === caret);
  if (idx < 0) return null;
  const tok = tokens[idx];
  const stack = [];
  if (tok.value in BRACKETS) {
    for (let i = idx; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.value in BRACKETS) stack.push(t);
      else {
        const open = stack.pop();
        if (!open || BRACKETS[open.value] !== t.value) return null;
        if (open === tok) return [tok.start, t.start];
      }
    }
    return null;
  }
  for (let i = idx; i >= 0; i--) {
    const t = tokens[i];
    if (t.value in CLOSERS) stack.push(t);
    else {
      const close = stack.pop();
      if (!close || CLOSERS[close.value] !== t.value) return null;
      if (close === tok) return [t.start, tok.start];
    }
  }
  return null;
}

export { KEYWORDS };
