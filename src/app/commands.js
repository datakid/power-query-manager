import { S } from '../ui/strings.js';

export const RESERVED = ['Mod+W', 'Mod+T', 'Mod+N', 'Mod+Tab', 'Mod+PageUp', 'Mod+PageDown', 'Mod+Shift+H', 'Mod+L', 'Mod+R', 'F5', 'F11', ...Array.from({ length: 9 }, (_, i) => `Mod+${i + 1}`)];

const CODE = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '.': 'Period', ',': 'Comma' };

export function parseShortcut(spec) {
  const parts = spec.split('+');
  const key = parts[parts.length - 1] === '' ? '+' : parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  return { mod: mods.has('mod'), shift: mods.has('shift'), alt: mods.has('alt'), key };
}

function codeOf(key) {
  if (CODE[key]) return CODE[key];
  if (/^[A-Za-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}

export function matches(ev, spec) {
  const p = typeof spec === 'string' ? parseShortcut(spec) : spec;
  const mod = ev.ctrlKey || ev.metaKey;
  if (p.mod !== !!mod || p.alt !== !!ev.altKey) return false;
  if (p.key !== '?' && p.shift !== !!ev.shiftKey) return false;
  if (p.alt) return ev.code === codeOf(p.key);
  return ev.key.length === 1 ? ev.key.toLowerCase() === p.key.toLowerCase() : ev.key === p.key;
}

export function labelOf(spec) {
  return spec.replace('Mod', 'Ctrl/Cmd').replace('ArrowUp', 'Up').replace('ArrowDown', 'Down').replace('Escape', 'Esc');
}

export class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }

  register(cmd) {
    if (this.commands.has(cmd.id)) throw new Error(`The command ${cmd.id} is already registered.`);
    for (const k of cmd.keys || []) if (RESERVED.includes(k)) throw new Error(`The shortcut ${k} belongs to the browser.`);
    if (!cmd.surfaces || !cmd.surfaces.length) throw new Error(`The command ${cmd.id} declares no surface.`);
    this.commands.set(cmd.id, { keys: [], enabled: () => true, run: null, ...cmd });
    return this;
  }

  get(id) {
    return this.commands.get(id);
  }

  all() {
    return [...this.commands.values()];
  }

  name(id) {
    return S.cmd[id] || id;
  }

  state(cmd, ctx) {
    const r = cmd.run ? cmd.enabled(ctx) : 'display';
    if (r === true) return { enabled: true, reason: null };
    return { enabled: false, reason: typeof r === 'string' ? r : null };
  }

  list(ctx) {
    return this.all().filter((c) => c.run).map((c) => ({ id: c.id, name: this.name(c.id), shortcut: c.keys.length ? labelOf(c.keys[0]) : null, ...this.state(c, ctx) }));
  }

  dispatch(ev, ctx) {
    for (const c of this.commands.values()) {
      if (!c.run || !c.keys.some((k) => matches(ev, k))) continue;
      if (c.when && !c.when(ev, ctx)) continue;
      return c;
    }
    return null;
  }

  sheet() {
    return this.all().filter((c) => c.keys.length).map((c) => [c.keys.map(labelOf).join(' / '), this.name(c.id)]);
  }
}
