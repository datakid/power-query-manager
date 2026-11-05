export function lcsMap(a, b) {
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

const splitLines = (text) => (text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n'));

export function diffLines(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  const map = lcsMap(a, b);
  const out = [];
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    if (map[i] >= 0) {
      while (j < map[i]) {
        out.push({ kind: 'add', b: j + 1, text: b[j] });
        j++;
      }
      out.push({ kind: 'same', a: i + 1, b: map[i] + 1, text: a[i] });
      j = map[i] + 1;
    } else out.push({ kind: 'del', a: i + 1, text: a[i] });
  }
  while (j < b.length) {
    out.push({ kind: 'add', b: j + 1, text: b[j] });
    j++;
  }
  return out;
}

export function diffStats(lines) {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === 'add') added++;
    else if (l.kind === 'del') removed++;
  }
  return { added, removed };
}

export function hunkLines(lines, context = 3) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [];
  let hidden = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden) out.push({ kind: 'gap', hidden });
      hidden = 0;
      out.push(l);
    } else hidden++;
  });
  if (hidden) out.push({ kind: 'gap', hidden });
  return out;
}
