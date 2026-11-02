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

function lcsMap(a, b) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const map = new Array(a.length).fill(-1);
  for (let i = 0; i < pre; i++) map[i] = i;
  for (let i = 0; i < suf; i++) map[a.length - 1 - i] = b.length - 1 - i;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  if (am.length && bm.length && am.length * bm.length <= 4000000) {
    const w = bm.length + 1;
    const dp = new Uint32Array((am.length + 1) * w);
    for (let i = am.length - 1; i >= 0; i--) {
      for (let j = bm.length - 1; j >= 0; j--) {
        dp[i * w + j] = am[i] === bm[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < am.length && j < bm.length) {
      if (am[i] === bm[j]) {
        map[pre + i] = pre + j;
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
      else j++;
    }
  }
  return map;
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
