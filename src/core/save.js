import { QuoinError } from './errors.js';
import { removeVbaSignatures } from './opc.js';
import { changedQueryEdits, writeQueryEdits } from './pq/writeback.js';
import { writeVbaProject } from './vba/writeback.js';
import { openWorkbook } from './workbook.js';
import { equalBytes } from './bytes.js';
import { suggestedFileName } from './filename.js';

export { suggestedFileName };

export function changedVbaEdits(wb, edits) {
  const out = new Map();
  if (!wb.vba || !wb.vba.project) return out;
  for (const [name, view] of edits) {
    const m = wb.vba.project.modules.find((x) => x.name === name);
    if (!m || !m.model) throw new QuoinError('vba.unknown', name);
    if (view !== m.model.visible) out.set(name, view);
  }
  return out;
}

export async function buildWorkbook(wb, { queryEdits = new Map(), vbaEdits = new Map(), refreshOnLoad = true, checkSection = null, acknowledgeSignature = false, faultInject = false } = {}) {
  const qEdits = changedQueryEdits(wb, queryEdits);
  const vEdits = changedVbaEdits(wb, vbaEdits);
  const pkg = wb.pkg.clone();
  const touched = new Set();
  if (qEdits.size) {
    await writeQueryEdits(wb, pkg, qEdits, { refreshOnLoad, checkSection });
    touched.add(wb.mashup.part);
    if (refreshOnLoad && wb.connections.part) touched.add(wb.connections.part);
  }
  let signatureRemoved = false;
  if (vEdits.size) {
    if (!wb.vba || !wb.vba.project) throw new QuoinError('vba.unreadable', 'no readable VBA project');
    if (wb.vba.signed && !acknowledgeSignature) throw new QuoinError('vba.signature', 'signature removal was not confirmed');
    const bytes = writeVbaProject(wb.vba.project, vEdits);
    pkg.set(wb.vba.part, bytes);
    touched.add(wb.vba.part);
    if (wb.vba.signed) {
      await removeVbaSignatures(pkg);
      signatureRemoved = true;
    }
  }
  const bytes = await pkg.write();
  if (faultInject) throw new QuoinError('write.selfcheck', 'injected fault');
  await selfCheck(wb, bytes, { qEdits, vEdits, touched, signatureRemoved });
  return { bytes, name: suggestedFileName(wb), queriesChanged: qEdits.size, modulesChanged: vEdits.size, signatureRemoved };
}

async function selfCheck(wb, bytes, { qEdits, vEdits, touched, signatureRemoved }) {
  try {
    const back = await openWorkbook(bytes, wb.fileName, wb.limits);
    for (const [name, view] of qEdits) {
      const q = back.queries.find((x) => x.name === name);
      if (!q || q.original !== view) throw new QuoinError('check.query', 'query text differs after write', name);
    }
    for (const q of wb.queries) {
      if (qEdits.has(q.name)) continue;
      const b = back.queries.find((x) => x.name === q.name);
      if (!b || b.original !== q.original) throw new QuoinError('check.query', 'untouched query changed', q.name);
    }
    if (back.queries.length !== wb.queries.length) throw new QuoinError('check.query', 'query count changed');
    for (const [name, view] of vEdits) {
      const m = back.vba && back.vba.project && back.vba.project.modules.find((x) => x.name === name);
      if (!m || !m.model || m.model.visible !== view) throw new QuoinError('check.vba', 'module text differs after write', name);
    }
    if (vEdits.size) {
      for (const m of wb.vba.project.modules) {
        if (vEdits.has(m.name)) continue;
        const b = back.vba.project.modules.find((x) => x.name === m.name);
        if (!b || b.text !== m.text) throw new QuoinError('check.vba', 'untouched module changed', m.name);
      }
    }
    for (const entry of back.pkg.zip.entries) await entry.read();
    const removedNames = signatureRemoved ? (n) => /vbaProjectSignature/i.test(n) || /vbaProject\.bin\.rels$/i.test(n) || n === '[Content_Types].xml' : () => false;
    for (const e of wb.pkg.zip.entries) {
      if (touched.has(e.name) || removedNames(e.name)) continue;
      const n = back.pkg.zip.get(e.name);
      if (!n || !equalBytes(n.rawCompressed(), e.rawCompressed()) || n.crc32 !== e.crc32) throw new QuoinError('check.part', 'part changed unexpectedly', e.name);
    }
  } catch (e) {
    if (e instanceof QuoinError) throw new QuoinError('write.selfcheck', `${e.code}${e.part ? ` ${e.part}` : ''}`, e.part);
    throw new QuoinError('write.selfcheck', String(e && e.message));
  }
}
