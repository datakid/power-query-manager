export const KEYWORDS = new Set([
  'and', 'as', 'each', 'else', 'error', 'false', 'if', 'in', 'is', 'let', 'meta', 'not', 'null', 'or', 'otherwise', 'section', 'shared',
  'then', 'true', 'try', 'catch', 'type', '#binary', '#date', '#datetime', '#datetimezone', '#duration', '#infinity', '#nan', '#sections',
  '#shared', '#table', '#time'
]);

const IDENT_START = /[\p{L}\p{Nl}_]/u;
const IDENT_PART = /[\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}\p{Cf}]/u;
const NUMBER = /(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/y;
const HASH_WORD = /#[A-Za-z]+/y;
const THREE = new Set(['...']);
const TWO = new Set(['<=', '>=', '<>', '=>', '..', '??']);
const ONE = new Set(['=', '<', '>', '+', '-', '*', '/', '&', '(', ')', '[', ']', '{', '}', '@', '!', '?', ',', ';']);
const NEWLINES = new Set([0x0A, 0x0D, 0x85, 0x2028, 0x2029]);

const asciiIdentStart = (c) => (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c === 0x5F;
const asciiIdentPart = (c) => asciiIdentStart(c) || (c >= 0x30 && c <= 0x39);
const startCache = new Uint8Array(0x10000);
const partCache = new Uint8Array(0x10000);

function cachedClass(cache, regex, cp) {
  if (cp >= 0x10000) return regex.test(String.fromCodePoint(cp));
  let v = cache[cp];
  if (v === 0) {
    v = regex.test(String.fromCodePoint(cp)) ? 1 : 2;
    cache[cp] = v;
  }
  return v === 1;
}

const identStart = (cp) => (cp < 0x80 ? asciiIdentStart(cp) : cachedClass(startCache, IDENT_START, cp));
const identPart = (cp) => (cp < 0x80 ? asciiIdentPart(cp) : cachedClass(partCache, IDENT_PART, cp));
const WIDE_SPACE = new Set([0x85, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]);

const isWhitespace = (c) => c === 0x20 || c === 0x09 || c === 0x0B || c === 0x0C || c === 0x0A || c === 0x0D || (c > 0x7F && (WIDE_SPACE.has(c) || (c >= 0x2000 && c <= 0x200A)));

const NAMED_ESCAPES = { cr: '\r', lf: '\n', tab: '\t', '#': '#' };

function decodeEscapes(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '#' && raw[i + 1] === '(') {
      const close = raw.indexOf(')', i + 2);
      if (close < 0) {
        out += raw.slice(i);
        break;
      }
      const body = raw.slice(i + 2, close);
      let ok = true;
      let piece = '';
      for (const item of body.split(',')) {
        const key = item.trim().toLowerCase();
        if (key in NAMED_ESCAPES) piece += NAMED_ESCAPES[key];
        else if (/^[0-9a-f]{4}$/.test(key) || /^[0-9a-f]{8}$/.test(key)) {
          const code = parseInt(key, 16);
          if (code > 0x10FFFF) {
            ok = false;
            break;
          }
          piece += String.fromCodePoint(code);
        } else {
          ok = false;
          break;
        }
      }
      if (ok) {
        out += piece;
        i = close + 1;
        continue;
      }
    }
    out += raw[i];
    i++;
  }
  return out;
}

export function decodeQuotedIdentifier(raw) {
  return raw.replace(/""/g, '"');
}

export function lex(text, { start = 0, state = 'normal' } = {}) {
  const tokens = [];
  const n = text.length;
  let i = start;
  let line = 1;
  let lineStart = 0;
  if (start > 0) {
    for (let k = 0; k < start; k++) {
      const c = text.charCodeAt(k);
      if (c === 0x0D && text.charCodeAt(k + 1) === 0x0A) continue;
      if (NEWLINES.has(c)) {
        line++;
        lineStart = k + 1;
      }
    }
  }
  const push = (kind, value, s, e, extra) => {
    const tok = { kind, value, start: s, end: e, line: 0, col: 0 };
    tokens.push(tok);
    if (extra) Object.assign(tok, extra);
    return tok;
  };
  const lineMarks = [];
  const scanBreaks = (s, e) => {
    for (let k = s; k < e; k++) {
      const c = text.charCodeAt(k);
      if (c === 0x0D && text.charCodeAt(k + 1) === 0x0A) continue;
      if (NEWLINES.has(c)) lineMarks.push(k + 1);
    }
  };

  const readString = (from) => {
    let j = from;
    for (;;) {
      const q = text.indexOf('"', j);
      if (q < 0) return -1;
      if (text[q + 1] === '"') {
        j = q + 2;
        continue;
      }
      return q;
    }
  };

  const finishComment = (s) => {
    const e = text.indexOf('*/', s);
    return e < 0 ? -1 : e + 2;
  };

  if (state === 'string') {
    const q = readString(i);
    if (q < 0) {
      push('error', text.slice(i), i, n, { unterminated: 'string' });
      i = n;
    } else {
      push('string', decodeEscapes(text.slice(i, q).replace(/""/g, '"')), i, q + 1, { continued: true });
      i = q + 1;
    }
  } else if (state === 'comment') {
    const e = finishComment(i);
    if (e < 0) {
      push('comment', text.slice(i), i, n, { unterminated: true });
      i = n;
    } else {
      push('comment', text.slice(i, e), i, e);
      i = e;
    }
  }

  while (i < n) {
    const c = text.charCodeAt(i);
    if (isWhitespace(c)) {
      const s = i;
      while (i < n && isWhitespace(text.charCodeAt(i))) i++;
      push('ws', text.slice(s, i), s, i);
      continue;
    }
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      const s = i;
      i += 2;
      while (i < n && !NEWLINES.has(text.charCodeAt(i))) i++;
      push('comment', text.slice(s, i), s, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const s = i;
      const e = finishComment(i + 2);
      if (e < 0) {
        push('error', text.slice(s), s, n, { unterminated: 'comment' });
        i = n;
      } else {
        push('comment', text.slice(s, e), s, e);
        i = e;
      }
      continue;
    }
    if (ch === '"') {
      const s = i;
      const q = readString(i + 1);
      if (q < 0) {
        push('error', text.slice(s), s, n, { unterminated: 'string' });
        i = n;
      } else {
        push('string', decodeEscapes(text.slice(s + 1, q).replace(/""/g, '"')), s, q + 1);
        i = q + 1;
      }
      continue;
    }
    if (ch === '#') {
      if (text[i + 1] === '"') {
        const s = i;
        const q = readString(i + 2);
        if (q < 0) {
          push('error', text.slice(s), s, n, { unterminated: 'identifier' });
          i = n;
        } else {
          push('qident', decodeQuotedIdentifier(text.slice(s + 2, q)), s, q + 1);
          i = q + 1;
        }
        continue;
      }
      HASH_WORD.lastIndex = i;
      const m = HASH_WORD.exec(text);
      if (m && KEYWORDS.has(m[0])) {
        push('keyword', m[0], i, i + m[0].length);
        i += m[0].length;
        continue;
      }
      push('error', '#', i, i + 1);
      i++;
      continue;
    }
    if ((c >= 0x30 && c <= 0x39) || (ch === '.' && text.charCodeAt(i + 1) >= 0x30 && text.charCodeAt(i + 1) <= 0x39)) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (m) {
        const raw = m[0];
        const value = /^0[xX]/.test(raw) ? parseInt(raw, 16) : Number(raw);
        push('number', value, i, i + raw.length, { raw });
        i += raw.length;
        continue;
      }
    }
    const cp = text.codePointAt(i);
    const cpLen = cp > 0xFFFF ? 2 : 1;
    if (identStart(cp)) {
      const s = i;
      i += cpLen;
      for (;;) {
        while (i < n) {
          const p = text.codePointAt(i);
          if (!identPart(p)) break;
          i += p > 0xFFFF ? 2 : 1;
        }
        if (text.charCodeAt(i) === 0x2E && i + 1 < n) {
          if (identStart(text.codePointAt(i + 1))) {
            i += 1;
            continue;
          }
        }
        break;
      }
      const word = text.slice(s, i);
      push(KEYWORDS.has(word) ? 'keyword' : 'ident', word, s, i);
      continue;
    }
    const three = text.slice(i, i + 3);
    if (THREE.has(three)) {
      push('op', three, i, i + 3);
      i += 3;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (TWO.has(two)) {
      push('op', two, i, i + 2);
      i += 2;
      continue;
    }
    if (ONE.has(ch)) {
      push('op', ch, i, i + 1);
      i++;
      continue;
    }
    const s = i;
    i += cpLen;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === 'error' && last.end === s && !last.unterminated) {
      last.end = i;
      last.value += text.slice(s, i);
    } else {
      push('error', text.slice(s, i), s, i);
    }
  }

  scanBreaks(start, n);
  let mark = 0;
  let curLine = line;
  let curLineStart = lineStart;
  for (const tok of tokens) {
    while (mark < lineMarks.length && lineMarks[mark] <= tok.start) {
      curLine++;
      curLineStart = lineMarks[mark];
      mark++;
    }
    tok.line = curLine;
    tok.col = tok.start - curLineStart + 1;
  }
  return tokens;
}

export function significant(tokens) {
  return tokens.filter((t) => t.kind !== 'ws' && t.kind !== 'comment');
}

export function endState(tokens) {
  const last = tokens[tokens.length - 1];
  if (!last) return 'normal';
  if (last.kind === 'error' && last.unterminated === 'string') return 'string';
  if (last.kind === 'error' && last.unterminated === 'comment') return 'comment';
  return 'normal';
}
