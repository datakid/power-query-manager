export const HANG_COLUMNS = 2;

export function splitCodeText(text) {
  return text === '' ? [] : text.split(/\r\n|\r|\n/);
}

function expandTabs(line, tabWidth) {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(tabWidth - (out.length % tabWidth));
    else out += ch;
  }
  return out;
}

function breakAt(text, width) {
  if (text.length <= width) return text.length;
  const floor = Math.floor(width * 0.8);
  for (let i = width; i > floor; i--) {
    const prev = text[i - 1];
    if (prev === ' ' || /[,;)+\-*/=<>&|.]/.test(prev)) return i;
    if (text[i] === ' ') return i;
  }
  return width;
}

export function wrapCodeLines({ lines, columns, tabWidth = 4 }) {
  const out = [];
  const width = Math.max(HANG_COLUMNS + 1, Math.floor(columns));
  lines.forEach((raw, i) => {
    let rest = expandTabs(raw, tabWidth);
    let continued = false;
    do {
      const w = continued ? width - HANG_COLUMNS : width;
      const cut = breakAt(rest, w);
      out.push({ number: i + 1, text: rest.slice(0, cut), continued });
      rest = rest.slice(cut);
      continued = true;
    } while (rest.length);
  });
  return out;
}
