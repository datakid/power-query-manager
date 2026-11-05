import { encodeText } from './codepages.js';
import { ATTRIBUTE_LINE, splitLines } from './module-source.js';
import { DEFAULT_LIMITS } from '../limits.js';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function validateModuleText({ text, codePage, originalBytes, limits = DEFAULT_LIMITS }) {
  const problems = [];
  const lines = splitLines(text);
  const starts = [];
  let offset = 0;
  const eolLengths = [];
  const raw = text.split(/(\r\n|\r|\n)/);
  for (let i = 0; i < raw.length; i += 2) eolLengths.push(raw[i + 1] ? raw[i + 1].length : 0);
  for (let i = 0; i < lines.length; i++) {
    starts.push(offset);
    offset += lines[i].length + eolLengths[i];
  }
  const at = (line, col, length = 1) => ({ line: line + 1, col: col + 1, start: starts[line] + col, end: starts[line] + col + length });
  const encodable = new Map();
  const canEncode = (ch) => {
    if (!encodable.has(ch)) {
      try {
        encodeText(codePage, ch, originalBytes);
        encodable.set(ch, true);
      } catch {
        encodable.set(ch, false);
      }
    }
    return encodable.get(ch);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nul = line.indexOf('\u0000');
    if (nul >= 0) problems.push({ code: 'vba.nul', ...at(i, nul) });
    const sur = LONE_SURROGATE.exec(line);
    if (sur) problems.push({ code: 'vba.surrogate', ...at(i, sur.index) });
    let col = 0;
    for (const ch of line) {
      if (ch.codePointAt(0) >= 0x80 && !canEncode(ch)) {
        problems.push({ code: 'vba.encoding', char: ch, cp: codePage, ...at(i, col, ch.length) });
        break;
      }
      col += ch.length;
    }
    if (line.length > limits.maxVbaLineChars) problems.push({ code: 'vba.lineLength', n: line.length, max: limits.maxVbaLineChars, ...at(i, limits.maxVbaLineChars, line.length - limits.maxVbaLineChars) });
    if (ATTRIBUTE_LINE.test(line)) problems.push({ code: 'vba.attribute', ...at(i, 0, line.length) });
  }
  if (new TextEncoder().encode(text).length > limits.maxModuleBytes) problems.push({ code: 'vba.tooLarge', max: limits.maxModuleBytes, line: 1, col: 1, start: 0, end: 0 });
  return problems;
}
