import { lcsMap } from '../diff.js';

const ATTRIBUTE_LINE = /^\s*Attribute\s+\S/i;

export function splitLines(text) {
  return text.split(/\r\n|\r|\n/);
}

export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  const cr = (text.match(/\r(?!\n)/g) || []).length;
  if (crlf >= lf && crlf >= cr) return '\r\n';
  return lf >= cr ? '\n' : '\r';
}

export function splitModuleSource(text) {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const visible = [];
  const hidden = [];
  for (const line of lines) {
    if (ATTRIBUTE_LINE.test(line)) hidden.push({ after: visible.length, text: line });
    else visible.push(line);
  }
  return { eol, visible: visible.join('\n'), visibleLines: visible, hidden };
}

export function joinModuleSource(model, editedVisible) {
  const editedLines = editedVisible.split('\n');
  const map = lcsMap(model.visibleLines, editedLines);
  const placed = model.hidden.map((h) => {
    let anchor = h.after - 1;
    while (anchor >= 0 && map[anchor] < 0) anchor--;
    const target = anchor < 0 ? 0 : map[anchor] + 1;
    return { text: h.text, target, order: h.after };
  });
  const out = [];
  let hi = 0;
  const sorted = placed.sort((x, y) => x.target - y.target || x.order - y.order);
  for (let i = 0; i <= editedLines.length; i++) {
    while (hi < sorted.length && sorted[hi].target <= i) out.push(sorted[hi++].text);
    if (i < editedLines.length) out.push(editedLines[i]);
  }
  while (hi < sorted.length) out.push(sorted[hi++].text);
  return out.join(model.eol);
}
