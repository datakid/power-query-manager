import { parseXml } from '../xml.js';

export function decodeEntryValue(raw) {
  if (raw === null || raw === undefined) return { kind: 'none', value: null, raw: '' };
  const tag = raw[0];
  const body = raw.slice(1);
  if (tag === 'l' && /^-?\d+$/.test(body)) return { kind: 'long', value: Number(body), raw };
  if (tag === 's') return { kind: 'string', value: body, raw };
  if (tag === 'd') return { kind: 'datetime', value: body, raw };
  if (tag === 'b' && (body === '0' || body === '1')) return { kind: 'bool', value: body === '1', raw };
  return { kind: 'unknown', value: raw, raw };
}

export function parseMetadata(xml) {
  const items = new Map();
  const all = new Map();
  if (!xml) return { items, all, groups: [] };
  const doc = parseXml(xml, 'Metadata');
  for (const item of doc.root.findAll('Item')) {
    const loc = item.child('ItemLocation');
    if (!loc) continue;
    const type = loc.child('ItemType');
    const path = loc.child('ItemPath');
    const entries = new Map();
    const stable = item.child('StableEntries');
    if (stable) {
      for (const en of stable.childrenNamed('Entry')) entries.set(en.attr('Type'), decodeEntryValue(en.attr('Value')));
    }
    const itemType = type ? type.text() : '';
    const itemPath = path ? path.text() : '';
    if (itemType === 'AllFormulas') {
      for (const [k, v] of entries) all.set(k, v);
      continue;
    }
    if (itemType !== 'Formula') continue;
    const segments = itemPath.split('/');
    if (segments.length !== 2) continue;
    let name;
    try {
      name = decodeURIComponent(segments[1]);
    } catch {
      name = segments[1];
    }
    items.set(name, entries);
  }
  return { items, all, groups: parseGroups(all.get('QueryGroups')) };
}

function parseGroups(entry) {
  if (!entry || entry.kind !== 'string' || !entry.value) return [];
  try {
    const parsed = JSON.parse(entry.value);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.Groups) ? parsed.Groups : Array.isArray(parsed.groups) ? parsed.groups : [];
    return list
      .map((g) => ({ id: String(g.Id ?? g.id ?? g.ID ?? ''), name: String(g.Name ?? g.name ?? ''), parent: g.ParentId ?? g.parentId ?? g.parent ?? null }))
      .filter((g) => g.id && g.name);
  } catch {
    return [];
  }
}

export function entryNumber(entries, key) {
  const e = entries && entries.get(key);
  return e && e.kind === 'long' ? e.value : null;
}

export function entryString(entries, key) {
  const e = entries && entries.get(key);
  return e && e.kind === 'string' ? e.value : null;
}
