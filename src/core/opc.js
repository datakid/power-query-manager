import { QuoinError } from './errors.js';
import { decodeTextBytes, encodeTextBytes } from './bytes.js';
import { parseXml, applyEdits, removeElementEdit } from './xml.js';
import { writeZip, rawFromEntry } from './zip-write.js';

export function resolveTarget(sourcePart, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = sourcePart.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

export function relationshipsPartFor(part) {
  const i = part.lastIndexOf('/');
  return `${i < 0 ? '' : part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

export class Package {
  constructor(zip) {
    this.zip = zip;
    this.order = zip.entries.map((e) => e.name);
    this.replaced = new Map();
    this.removed = new Set();
    this.cache = new Map();
  }

  clone() {
    const c = new Package(this.zip);
    c.order = [...this.order];
    c.replaced = new Map(this.replaced);
    c.removed = new Set(this.removed);
    c.cache = this.cache;
    return c;
  }

  resolve(name) {
    const lower = name.toLowerCase();
    for (const n of this.order) if (n.toLowerCase() === lower) return this.removed.has(n) ? null : n;
    return null;
  }

  has(name) {
    return this.resolve(name) !== null;
  }

  names() {
    return this.order.filter((n) => !this.removed.has(n));
  }

  async bytes(name) {
    const real = this.resolve(name);
    if (!real) return null;
    if (this.replaced.has(real)) return this.replaced.get(real);
    if (this.cache.has(real)) return this.cache.get(real);
    const entry = this.zip.get(real);
    const data = await entry.read();
    this.cache.set(real, data);
    return data;
  }

  async text(name) {
    const b = await this.bytes(name);
    return b ? decodeTextBytes(b) : null;
  }

  set(name, data) {
    const real = this.resolve(name) || name;
    if (!this.order.includes(real)) this.order.push(real);
    this.removed.delete(real);
    this.replaced.set(real, data);
  }

  async setText(name, text, like) {
    const old = like || (await this.text(name));
    const enc = old ? old.encoding : 'utf-8';
    const bom = old ? old.bom : false;
    this.set(name, encodeTextBytes(text, enc, bom));
  }

  remove(name) {
    const real = this.resolve(name);
    if (real) this.removed.add(real);
  }

  isChanged(name) {
    const real = this.resolve(name);
    return real ? this.replaced.has(real) : this.removed.has(name);
  }

  async write(options) {
    const entries = [];
    for (const name of this.order) {
      if (this.removed.has(name)) continue;
      if (this.replaced.has(name)) {
        entries.push({ name, data: this.replaced.get(name) });
      } else {
        const entry = this.zip.get(name);
        entries.push({ name, raw: rawFromEntry(entry) });
      }
    }
    const ct = entries.findIndex((e) => e.name === '[Content_Types].xml');
    if (ct > 0) entries.unshift(entries.splice(ct, 1)[0]);
    return writeZip(entries, options);
  }
}

export async function readContentTypes(pkg) {
  const t = await pkg.text('[Content_Types].xml');
  if (!t) throw new QuoinError('opc.contentTypes', 'missing [Content_Types].xml');
  const doc = parseXml(t.text, '[Content_Types].xml');
  const defaults = new Map();
  const overrides = new Map();
  for (const el of doc.root.elements()) {
    if (el.local === 'Default') defaults.set(el.attr('Extension').toLowerCase(), el.attr('ContentType'));
    else if (el.local === 'Override') overrides.set(el.attr('PartName'), el.attr('ContentType'));
  }
  return { doc, text: t, defaults, overrides };
}

export async function readRelationships(pkg, sourcePart) {
  const relPart = relationshipsPartFor(sourcePart);
  const t = await pkg.text(relPart);
  if (!t) return { part: relPart, items: [], doc: null, text: null };
  const doc = parseXml(t.text, relPart);
  const items = doc.root.childrenNamed('Relationship').map((el) => {
    const external = el.attr('TargetMode') === 'External';
    const target = el.attr('Target') || '';
    return {
      id: el.attr('Id'),
      type: el.attr('Type') || '',
      target: external ? target : resolveTarget(sourcePart, target),
      external,
      element: el
    };
  });
  return { part: relPart, items, doc, text: t };
}

export async function removeVbaSignatures(pkg) {
  const sigPattern = /vbaProjectSignature(Agile|V3)?$/;
  const removedParts = [];
  for (const name of pkg.names().filter((n) => n.toLowerCase().endsWith('.rels'))) {
    const t = await pkg.text(name);
    const doc = parseXml(t.text, name);
    const sigs = doc.root.childrenNamed('Relationship').filter((el) => sigPattern.test(el.attr('Type') || ''));
    if (!sigs.length) continue;
    for (const el of sigs) {
      if (el.attr('TargetMode') === 'External') continue;
      const sourcePart = name.replace(/_rels\//, '').replace(/\.rels$/, '');
      removedParts.push(resolveTarget(sourcePart, el.attr('Target')));
    }
    const all = doc.root.childrenNamed('Relationship');
    if (all.length === sigs.length) {
      pkg.remove(name);
    } else {
      await pkg.setText(name, applyEdits(t.text, sigs.map(removeElementEdit)), t);
    }
  }
  for (const p of pkg.names()) {
    if (/\/vbaProjectSignature(Agile|V3)?\.bin$/i.test(`/${p}`) && !removedParts.includes(p)) removedParts.push(p);
  }
  for (const p of removedParts) pkg.remove(p);
  const ct = await readContentTypes(pkg);
  const edits = [];
  for (const el of ct.doc.root.childrenNamed('Override')) {
    if (/^\/xl\/vbaProjectSignature(Agile|V3)?\.bin$/i.test(el.attr('PartName') || '')) edits.push(removeElementEdit(el));
  }
  if (edits.length) await pkg.setText('[Content_Types].xml', applyEdits(ct.text.text, edits), ct.text);
  return removedParts;
}
