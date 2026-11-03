const COLOUR_LIKE = /^(#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\(|color-mix\()/i;

export function cssBlock(css, marker) {
  const at = css.indexOf(marker);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let k = open; k < css.length; k++) {
    if (css[k] === '{') depth++;
    if (css[k] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, k);
    }
  }
  return '';
}

export function expandHex(value) {
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toUpperCase();
  return null;
}

export function colourTokens(block) {
  const hex = {};
  const other = [];
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const value = m[2].trim();
    if (!COLOUR_LIKE.test(value)) continue;
    const parsed = expandHex(value);
    if (parsed) hex[m[1]] = parsed;
    else other.push({ name: m[1], value });
  }
  return { hex, other };
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export function contrastProblems({ light, dark, pairs }) {
  const problems = [];
  const exempt = pairs.exempt || {};
  const sets = { light: colourTokens(light), dark: colourTokens(dark) };
  const used = new Set();
  for (const theme of ['light', 'dark']) {
    for (const t of sets[theme].other) if (!exempt[t.name]) problems.push(`not-plain-hex:${theme}:${t.name}=${t.value}`);
    for (const [fg, bg] of pairs[theme] || []) {
      used.add(fg);
      used.add(bg);
      for (const name of [fg, bg]) if (!sets[theme].hex[name]) problems.push(`missing:${theme}:${name}`);
    }
  }
  const declared = new Set([...Object.keys(sets.light.hex), ...Object.keys(sets.dark.hex), ...sets.light.other.map((t) => t.name), ...sets.dark.other.map((t) => t.name)]);
  for (const name of declared) if (!used.has(name) && !exempt[name]) problems.push(`uncovered:${name}`);
  for (const [name, reason] of Object.entries(exempt)) {
    if (typeof reason !== 'string' || !reason.trim()) problems.push(`exempt-without-reason:${name}`);
    if (!declared.has(name)) problems.push(`exempt-unknown:${name}`);
    if (used.has(name)) problems.push(`exempt-but-paired:${name}`);
  }
  return problems.sort();
}
