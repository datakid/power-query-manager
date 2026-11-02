import { QuoinError } from '../errors.js';
import { base64Encode } from '../bytes.js';
import { applyEdits, attributeEdit, textContentEdit, parseXml } from '../xml.js';
import { buildDataMashup } from './datamashup.js';
import { rebuildSection } from './section.js';

function wrapBase64(text, lineLength) {
  if (!lineLength) return text;
  const lines = [];
  for (let i = 0; i < text.length; i += lineLength) lines.push(text.slice(i, i + lineLength));
  return lines.join('\r\n');
}

export function changedQueryEdits(wb, edits) {
  const out = new Map();
  for (const [name, view] of edits) {
    const q = wb.queries.find((x) => x.name === name);
    if (!q) throw new QuoinError('pq.unknown', name);
    const trimmed = view.replace(/^\s+/, '').replace(/\s+$/, '');
    if (trimmed !== q.original) out.set(name, trimmed);
  }
  return out;
}

export async function writeQueryEdits(wb, pkg, edits, { refreshOnLoad = true, checkSection = null } = {}) {
  const mashup = wb.mashup;
  if (!mashup || mashup.error) throw new QuoinError('pq.format', 'no readable query data');
  if (mashup.model.warnings.length) throw new QuoinError('pq.format', mashup.model.warnings.join(','));
  if (mashup.split.errors.length) throw new QuoinError('pq.format', 'section did not split cleanly');
  const members = mashup.split.members.filter((m) => edits.has(m.name));
  const map = new Map([...edits].map(([k, v]) => [k, v]));
  const sectionText = rebuildSection(mashup.section.text, members, map);
  if (checkSection) {
    const problem = checkSection(sectionText);
    if (problem) throw new QuoinError('m.parse', `${problem.message} Line ${problem.line}, column ${problem.col}.`, mashup.part);
  }
  const bytes = await buildDataMashup(mashup.model, { text: sectionText, bom: mashup.section.bom });
  const encoded = wrapBase64(base64Encode(bytes), mashup.lineLength);
  const fresh = parseXml(mashup.text.text, mashup.part);
  const newXml = applyEdits(mashup.text.text, [textContentEdit(fresh.root, encoded)]);
  await pkg.setText(mashup.part, newXml, mashup.text);

  if (refreshOnLoad && wb.connections.part) {
    const cdoc = parseXml(wb.connections.text.text, wb.connections.part);
    const conns = cdoc.root.childrenNamed('connection');
    const pieces = [];
    for (const name of edits.keys()) {
      const q = wb.queries.find((x) => x.name === name);
      if (!q || !q.connection) continue;
      const el = conns.find((c) => c.attr('id') === q.connection.id);
      if (el && el.attr('refreshOnLoad') !== '1') pieces.push(attributeEdit(el, 'refreshOnLoad', '1'));
    }
    if (pieces.length) await pkg.setText(wb.connections.part, applyEdits(wb.connections.text.text, pieces), wb.connections.text);
  }
  return sectionText;
}
