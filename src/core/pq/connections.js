import { parseXml } from '../xml.js';

export function parseConnectionString(text) {
  const out = new Map();
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && (text[i] === ' ' || text[i] === ';')) i++;
    if (i >= n) break;
    const eq = text.indexOf('=', i);
    if (eq < 0) break;
    const key = text.slice(i, eq).trim();
    i = eq + 1;
    while (i < n && text[i] === ' ') i++;
    let value = '';
    const q = text[i];
    if (q === '"' || q === "'") {
      i++;
      for (;;) {
        if (i >= n) break;
        if (text[i] === q) {
          if (text[i + 1] === q) {
            value += q;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += text[i++];
      }
      while (i < n && text[i] !== ';') i++;
    } else {
      const end = text.indexOf(';', i);
      const stop = end < 0 ? n : end;
      value = text.slice(i, stop).trim();
      i = stop;
    }
    out.set(key.toLowerCase(), value);
  }
  return out;
}

export function parseConnections(text) {
  const doc = parseXml(text, 'xl/connections.xml');
  const list = [];
  for (const el of doc.root.childrenNamed('connection')) {
    const db = el.child('dbPr');
    const cs = db ? parseConnectionString(db.attr('connection') || '') : new Map();
    const provider = cs.get('provider') || '';
    list.push({
      id: el.attr('id'),
      name: el.attr('name') || '',
      mashup: /^Microsoft\.Mashup\.OleDb/i.test(provider),
      location: cs.get('location') || null,
      refreshOnLoad: el.attr('refreshOnLoad') === '1',
      element: el
    });
  }
  return { doc, list };
}
