import { QuoinError } from './errors.js';

const NAME_END = /[\s/>=]/;
const WS = /\s/;

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s, part) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code > 0x10FFFF) throw new QuoinError('xml.parse', 'bad character reference', part);
      return String.fromCodePoint(code);
    }
    if (!(body in ENTITIES)) throw new QuoinError('xml.parse', `unknown entity ${body}`, part);
    return ENTITIES[body];
  });
}

export function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s, quote = '"') {
  const base = s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return quote === '"' ? base.replace(/"/g, '&quot;') : base.replace(/'/g, '&apos;');
}

export function rejectDoctype(text, part) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new QuoinError('xml.doctype', 'DOCTYPE or ENTITY declaration', part);
}

export function localName(qname) {
  const i = qname.indexOf(':');
  return i < 0 ? qname : qname.slice(i + 1);
}

export function scanXml(text, handlers, part = '') {
  rejectDoctype(text, part);
  const n = text.length;
  let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  const stack = [];
  let rootSeen = false;
  const fail = (msg) => {
    throw new QuoinError('xml.parse', `${msg} at ${i}`, part);
  };
  while (i < n) {
    if (text.charCodeAt(i) !== 60) {
      let j = text.indexOf('<', i);
      if (j < 0) j = n;
      if (stack.length && handlers.text) handlers.text(decodeEntities(text.slice(i, j), part), i, j);
      else if (!stack.length && text.slice(i, j).trim() !== '') fail('text outside root');
      i = j;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const j = text.indexOf('?>', i + 2);
      if (j < 0) fail('unterminated processing instruction');
      if (handlers.pi) handlers.pi(text.slice(i, j + 2), i, j + 2);
      i = j + 2;
      continue;
    }
    if (text.startsWith('<!--', i)) {
      const j = text.indexOf('-->', i + 4);
      if (j < 0) fail('unterminated comment');
      i = j + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const j = text.indexOf(']]>', i + 9);
      if (j < 0) fail('unterminated CDATA');
      if (stack.length && handlers.text) handlers.text(text.slice(i + 9, j), i, j + 3);
      i = j + 3;
      continue;
    }
    if (text.startsWith('</', i)) {
      const j = text.indexOf('>', i + 2);
      if (j < 0) fail('unterminated end tag');
      const name = text.slice(i + 2, j).trim();
      const top = stack.pop();
      if (top !== name) fail(`mismatched end tag ${name}`);
      if (handlers.close) handlers.close(name, i, j + 1);
      i = j + 1;
      continue;
    }
    if (text.startsWith('<!', i)) fail('unsupported declaration');
    const start = i;
    i++;
    const ns = i;
    while (i < n && !NAME_END.test(text[i])) i++;
    const name = text.slice(ns, i);
    if (!name) fail('empty element name');
    const attrs = [];
    let selfClosing = false;
    for (;;) {
      while (i < n && WS.test(text[i])) i++;
      if (i >= n) fail('unterminated start tag');
      if (text[i] === '>') {
        i++;
        break;
      }
      if (text[i] === '/' && text[i + 1] === '>') {
        selfClosing = true;
        i += 2;
        break;
      }
      const as = i;
      while (i < n && !NAME_END.test(text[i])) i++;
      const aname = text.slice(as, i);
      if (!aname) fail('bad attribute');
      while (i < n && WS.test(text[i])) i++;
      if (text[i] !== '=') fail('attribute without value');
      i++;
      while (i < n && WS.test(text[i])) i++;
      const q = text[i];
      if (q !== '"' && q !== "'") fail('unquoted attribute');
      const vs = i + 1;
      const ve = text.indexOf(q, vs);
      if (ve < 0) fail('unterminated attribute');
      attrs.push({ name: aname, value: decodeEntities(text.slice(vs, ve), part), start: as, end: ve + 1, valueStart: vs, valueEnd: ve, quote: q });
      i = ve + 1;
    }
    if (!stack.length) {
      if (rootSeen) fail('multiple roots');
      rootSeen = true;
    }
    if (handlers.open) handlers.open(name, attrs, selfClosing, start, i);
    if (selfClosing) {
      if (handlers.close) handlers.close(name, start, i, true);
    } else {
      stack.push(name);
    }
  }
  if (stack.length) fail('unclosed element');
  if (!rootSeen) fail('no root element');
}

export class XmlElement {
  constructor(name, attrs, parent, start, openEnd, selfClosing) {
    this.name = name;
    this.local = localName(name);
    this.attrs = attrs;
    this.parent = parent;
    this.start = start;
    this.openEnd = openEnd;
    this.selfClosing = selfClosing;
    this.closeStart = selfClosing ? openEnd : -1;
    this.end = selfClosing ? openEnd : -1;
    this.children = [];
    this.ns = '';
  }

  attr(name) {
    const a = this.attrs.find((x) => x.name === name);
    return a ? a.value : null;
  }

  attrNode(name) {
    return this.attrs.find((x) => x.name === name) || null;
  }

  attrNS(nsUri, local) {
    for (const a of this.attrs) {
      const i = a.name.indexOf(':');
      if (i < 0) continue;
      if (a.name.slice(i + 1) !== local) continue;
      if (this.resolvePrefix(a.name.slice(0, i)) === nsUri) return a.value;
    }
    return null;
  }

  resolvePrefix(prefix) {
    for (let e = this; e; e = e.parent) {
      const a = e.attrs.find((x) => x.name === `xmlns:${prefix}`);
      if (a) return a.value;
    }
    return '';
  }

  elements() {
    return this.children.filter((c) => c instanceof XmlElement);
  }

  child(local) {
    return this.elements().find((c) => c.local === local) || null;
  }

  childrenNamed(local) {
    return this.elements().filter((c) => c.local === local);
  }

  find(local) {
    for (const c of this.elements()) {
      if (c.local === local) return c;
      const d = c.find(local);
      if (d) return d;
    }
    return null;
  }

  findAll(local, out = []) {
    for (const c of this.elements()) {
      if (c.local === local) out.push(c);
      c.findAll(local, out);
    }
    return out;
  }

  text() {
    let s = '';
    for (const c of this.children) s += c instanceof XmlElement ? c.text() : c.value;
    return s;
  }
}

export class XmlDocument {
  constructor(text, root, declaration) {
    this.text = text;
    this.root = root;
    this.declaration = declaration;
  }
}

export function parseXml(text, part = '') {
  let root = null;
  let current = null;
  let declaration = '';
  const defaultNs = [];
  scanXml(
    text,
    {
      pi(raw, s) {
        if (!root && s <= 1 && raw.startsWith('<?xml')) declaration = raw;
      },
      open(name, attrs, selfClosing, start, openEnd) {
        const el = new XmlElement(name, attrs, current, start, openEnd, selfClosing);
        const dflt = attrs.find((a) => a.name === 'xmlns');
        const inherited = defaultNs.length ? defaultNs[defaultNs.length - 1] : '';
        const scope = dflt ? dflt.value : inherited;
        const colon = name.indexOf(':');
        el.ns = colon < 0 ? scope : el.resolvePrefix(name.slice(0, colon));
        if (!selfClosing) defaultNs.push(scope);
        if (current) current.children.push(el);
        else root = el;
        if (!selfClosing) current = el;
      },
      close(name, closeStart, end, selfClosing) {
        if (selfClosing) return;
        current.closeStart = closeStart;
        current.end = end;
        current = current.parent;
        defaultNs.pop();
      },
      text(value) {
        if (current) current.children.push({ value });
      }
    },
    part
  );
  return new XmlDocument(text, root, declaration);
}

export function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  let floor = Infinity;
  for (const e of sorted) {
    if (e.end > floor) throw new QuoinError('xml.edit', 'overlapping edits');
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    floor = e.start;
  }
  return out;
}

export function attributeEdit(element, name, value) {
  const existing = element.attrNode(name);
  if (existing) {
    return { start: existing.valueStart, end: existing.valueEnd, replacement: escapeAttr(value, existing.quote) };
  }
  const at = element.selfClosing ? element.openEnd - 2 : element.openEnd - 1;
  return { start: at, end: at, replacement: ` ${name}="${escapeAttr(value)}"` };
}

export function textContentEdit(element, value) {
  if (element.selfClosing) {
    return { start: element.openEnd - 2, end: element.openEnd, replacement: `>${escapeText(value)}</${element.name}>` };
  }
  return { start: element.openEnd, end: element.closeStart, replacement: escapeText(value) };
}

export function removeElementEdit(element) {
  return { start: element.start, end: element.end, replacement: '' };
}

export function streamSheetCells(text, onCell, part = '') {
  let cell = null;
  let field = '';
  let inRuby = 0;
  scanXml(
    text,
    {
      open(name, attrs) {
        const local = localName(name);
        if (local === 'c') {
          const get = (k) => {
            const a = attrs.find((x) => x.name === k);
            return a ? a.value : null;
          };
          cell = { ref: get('r'), type: get('t') || 'n', style: Number(get('s') || 0), value: null, inline: false };
        } else if (cell && local === 'v') {
          field = 'v';
        } else if (cell && local === 'is') {
          cell.inline = true;
          cell.value = '';
        } else if (cell && cell.inline && local === 't' && !inRuby) {
          field = 'is';
        } else if (cell && cell.inline && local === 'rPh') {
          inRuby++;
        }
      },
      text(value) {
        if (!cell) return;
        if (field === 'v') cell.value = (cell.value || '') + value;
        else if (field === 'is') cell.value += value;
      },
      close(name) {
        const local = localName(name);
        if (local === 'c') {
          if (cell && cell.ref) onCell(cell);
          cell = null;
          field = '';
        } else if (local === 'v' || local === 't') {
          field = '';
        } else if (local === 'rPh' && inRuby) {
          inRuby--;
        }
      }
    },
    part
  );
}

export function readSharedStrings(text, part = '') {
  const out = [];
  let inSi = false;
  let buf = '';
  let ruby = 0;
  let inT = false;
  scanXml(
    text,
    {
      open(name) {
        const local = localName(name);
        if (local === 'si') {
          inSi = true;
          buf = '';
        } else if (inSi && local === 'rPh') {
          ruby++;
        } else if (inSi && local === 't' && !ruby) {
          inT = true;
        }
      },
      text(value) {
        if (inSi && inT) buf += value;
      },
      close(name) {
        const local = localName(name);
        if (local === 't') inT = false;
        else if (local === 'rPh' && ruby) ruby--;
        else if (local === 'si') {
          out.push(buf);
          inSi = false;
        }
      }
    },
    part
  );
  return out;
}
