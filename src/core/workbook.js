import { QuoinError } from './errors.js';
import { u32, base64Decode, startsWith } from './bytes.js';
import { readZip } from './zip-read.js';
import { Package, readContentTypes, readRelationships, resolveTarget } from './opc.js';
import { parseXml } from './xml.js';
import { isCfb, readCfb, flatten } from './vba/cfb-read.js';
import { readVbaProject } from './vba/vba-project.js';
import { parseDataMashup, readSection } from './pq/datamashup.js';
import { splitSection, toViewText } from './pq/section.js';
import { parseMetadata, entryNumber, entryString } from './pq/metadata.js';
import { parseConnections } from './pq/connections.js';
import { DEFAULT_LIMITS } from './limits.js';

const NS_DATAMASHUP = 'http://schemas.microsoft.com/DataMashup';
const NS_STRICT = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_OFFICE_DOC = /\/officeDocument$/;

const MAIN_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml': 'xlsx',
  'application/vnd.ms-excel.sheet.macroEnabled.main+xml': 'xlsm',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml': 'xltx',
  'application/vnd.ms-excel.template.macroEnabled.main+xml': 'xltm'
};

function detectCfb(bytes, limits) {
  let names = [];
  try {
    names = flatten(readCfb(bytes, limits).root).map((n) => n.name);
  } catch (e) {
    throw new QuoinError('file.notWorkbook', e.code || '');
  }
  if (names.includes('EncryptedPackage') && names.includes('EncryptionInfo')) throw new QuoinError('file.encrypted');
  if (names.includes('Workbook') || names.includes('Book')) throw new QuoinError('file.xls');
  throw new QuoinError('file.notWorkbook');
}

export async function openWorkbook(bytes, fileName = '', limits = DEFAULT_LIMITS) {
  if (bytes.length > limits.maxFileBytes) throw new QuoinError('file.tooLarge');
  if (isCfb(bytes)) detectCfb(bytes, limits);
  if (!startsWith(bytes, [0x50, 0x4B])) throw new QuoinError('file.notWorkbook');
  let zip;
  try {
    zip = readZip(bytes, limits);
  } catch (e) {
    if (e instanceof QuoinError && e.code.startsWith('zip.eocd')) throw new QuoinError('file.notWorkbook');
    throw e;
  }
  const pkg = new Package(zip);
  if (pkg.has('xl/workbook.bin')) throw new QuoinError('file.xlsb');
  if (pkg.has('content.xml') && pkg.has('mimetype')) {
    const mt = await pkg.bytes('mimetype');
    if (new TextDecoder().decode(mt).trim() === 'application/vnd.oasis.opendocument.spreadsheet') throw new QuoinError('file.ods');
  }
  if (!pkg.has('[Content_Types].xml')) throw new QuoinError('file.notWorkbook');
  const ct = await readContentTypes(pkg);
  const rootRels = await readRelationships(pkg, '');
  const officeRel = rootRels.items.find((r) => REL_OFFICE_DOC.test(r.type) && !r.external);
  if (!officeRel || !pkg.has(officeRel.target)) throw new QuoinError('file.notWorkbook');
  const workbookPart = pkg.resolve(officeRel.target);
  const contentType = ct.overrides.get(`/${workbookPart}`) || ct.overrides.get(`/${officeRel.target}`) || '';
  const wbText = await pkg.text(workbookPart);
  const wbDoc = parseXml(wbText.text, workbookPart);
  if (wbDoc.root.ns === NS_STRICT) throw new QuoinError('file.strict');
  if (wbDoc.root.local !== 'workbook' || wbDoc.root.ns !== NS_MAIN) throw new QuoinError('file.notWorkbook');
  const format = MAIN_TYPES[contentType];
  if (!format) throw new QuoinError('file.notWorkbook');

  const wb = {
    fileName,
    bytes,
    limits,
    pkg,
    format,
    workbookPart,
    contentType,
    warnings: [],
    date1904: false,
    sheets: [],
    definedNames: [],
    tables: [],
    connections: { list: [], doc: null, text: null },
    mashup: null,
    queries: [],
    groups: [],
    vba: null,
    hasDataModel: pkg.has('xl/model/item.data'),
    orphanConnections: []
  };

  const pr = wbDoc.root.child('workbookPr');
  wb.date1904 = !!pr && /^(1|true)$/i.test(pr.attr('date1904') || '');
  const wbRels = await readRelationships(pkg, workbookPart);
  const relById = new Map(wbRels.items.map((r) => [r.id, r]));
  const sheetsEl = wbDoc.root.child('sheets');
  if (sheetsEl) {
    for (const el of sheetsEl.childrenNamed('sheet')) {
      const rid = el.attrNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const rel = rid ? relById.get(rid) : null;
      wb.sheets.push({ name: el.attr('name'), sheetId: el.attr('sheetId'), state: el.attr('state') || 'visible', part: rel && !rel.external ? pkg.resolve(rel.target) : null, type: rel ? rel.type.split('/').pop() : '' });
    }
  }
  const dn = wbDoc.root.child('definedNames');
  if (dn) {
    for (const el of dn.childrenNamed('definedName')) {
      wb.definedNames.push({ name: el.attr('name'), localSheetId: el.attr('localSheetId'), hidden: el.attr('hidden') === '1', ref: el.text().trim() });
    }
  }

  for (const sheet of wb.sheets) {
    if (!sheet.part || sheet.type !== 'worksheet') continue;
    const rels = await readRelationships(pkg, sheet.part);
    for (const r of rels.items.filter((x) => /\/table$/.test(x.type) && !x.external)) {
      const part = pkg.resolve(r.target);
      if (!part) continue;
      const t = await pkg.text(part);
      const doc = parseXml(t.text, part);
      const root = doc.root;
      const cols = root.child('tableColumns');
      const table = {
        part,
        sheet: sheet.name,
        name: root.attr('name'),
        displayName: root.attr('displayName') || root.attr('name'),
        ref: root.attr('ref'),
        headerRowCount: root.attr('headerRowCount') === null ? 1 : Number(root.attr('headerRowCount')),
        totalsRowCount: Number(root.attr('totalsRowCount') || 0),
        tableType: root.attr('tableType') || 'worksheet',
        columns: cols ? cols.childrenNamed('tableColumn').map((c) => c.attr('name')) : [],
        connectionId: null
      };
      if (table.tableType === 'queryTable') {
        const trels = await readRelationships(pkg, part);
        const q = trels.items.find((x) => /\/queryTable$/.test(x.type) && !x.external);
        if (q && pkg.has(q.target)) {
          const qt = await pkg.text(pkg.resolve(q.target));
          table.connectionId = parseXml(qt.text, q.target).root.attr('connectionId');
        }
      }
      wb.tables.push(table);
    }
  }

  const connRel = wbRels.items.find((r) => /\/connections$/.test(r.type) && !r.external);
  const connPart = connRel ? pkg.resolve(connRel.target) : pkg.resolve('xl/connections.xml');
  if (connPart) {
    const t = await pkg.text(connPart);
    const parsed = parseConnections(t.text);
    wb.connections = { ...parsed, part: connPart, text: t };
  }

  await loadMashup(wb);
  await loadVba(wb, wbRels);
  return wb;
}

async function loadMashup(wb) {
  const pkg = wb.pkg;
  const items = pkg.names().filter((n) => /^customXml\/item\d+\.xml$/i.test(n));
  for (const part of items) {
    const t = await pkg.text(part);
    if (!t.text.includes('DataMashup')) continue;
    let doc;
    try {
      doc = parseXml(t.text, part);
    } catch {
      continue;
    }
    if (doc.root.local !== 'DataMashup' || doc.root.ns !== NS_DATAMASHUP) continue;
    if (wb.mashup) {
      wb.warnings.push({ code: 'pq.multiple', part });
      continue;
    }
    const body = doc.root.text();
    const firstBreak = body.search(/[\r\n]/);
    const lineLength = firstBreak >= 0 ? body.slice(0, firstBreak).length : 0;
    let model;
    try {
      model = parseDataMashup(base64Decode(body), wb.limits);
    } catch (e) {
      if (e instanceof QuoinError) {
        wb.mashup = { part, error: e.code, detail: e.message };
        return;
      }
      wb.mashup = { part, error: 'pq.base64', detail: String(e && e.message) };
      return;
    }
    const section = await readSection(model);
    const split = splitSection(section.text);
    const meta = parseMetadata(model.metadata.xml);
    wb.mashup = { part, text: t, doc, lineLength, model, section, split, meta, error: null };
    for (const w of model.warnings) wb.warnings.push({ code: w, part });
    buildQueries(wb);
    return;
  }
  if (wb.connections.list.some((c) => c.mashup)) wb.warnings.push({ code: 'pq.legacyAddin' });
}

function buildQueries(wb) {
  const { split, section, meta } = wb.mashup;
  const groupsById = new Map(meta.groups.map((g) => [g.id, g]));
  wb.groups = meta.groups;
  const tableByConn = new Map(wb.tables.filter((t) => t.connectionId).map((t) => [t.connectionId, t]));
  const conns = wb.connections.list.filter((c) => c.mashup);
  const used = new Set();
  for (const m of split.members) {
    if (!m.shared) continue;
    const entries = meta.items.get(m.name);
    const conn = conns.find((c) => c.location === m.name) || conns.find((c) => c.location && c.location.toLowerCase() === m.name.toLowerCase()) || null;
    if (conn) used.add(conn);
    const fill = entryNumber(entries, 'FillEnabled') === 1;
    const model = entryNumber(entries, 'FillToDataModelEnabled') === 1 || entryNumber(entries, 'LoadedToAnalysisServices') === 1;
    const table = conn ? tableByConn.get(conn.id) : null;
    let load = { kind: 'connection' };
    if (fill && conn && table) load = { kind: 'table', sheet: table.sheet, ref: table.ref, tableName: table.displayName, alsoModel: model };
    else if (model) load = { kind: 'model' };
    const gid = entryString(entries, 'QueryGroupID');
    const raw = section.text.slice(m.exprStart, m.exprEnd);
    wb.queries.push({
      name: m.name,
      member: m,
      load,
      group: gid && groupsById.has(gid) ? groupsById.get(gid) : null,
      connection: conn,
      original: toViewText(raw),
      hasAttributes: !!m.attributes
    });
  }
  const formulaItems = [...meta.items.keys()].length;
  if (formulaItems !== split.members.filter((m) => m.shared).length) wb.warnings.push({ code: 'pq.countMismatch' });
  wb.orphanConnections = conns.filter((c) => !used.has(c)).map((c) => c.name);
  if (split.errors.length) wb.warnings.push({ code: 'pq.sectionParse', detail: split.errors[0].message });
}

async function loadVba(wb, wbRels) {
  const pkg = wb.pkg;
  const rel = wbRels.items.find((r) => /\/vbaProject$/.test(r.type) && !r.external);
  const part = rel ? pkg.resolve(rel.target) : pkg.resolve('xl/vbaProject.bin');
  const signed = pkg.names().some((n) => /vbaProjectSignature(Agile|V3)?\.bin$/i.test(n));
  if (!part) {
    wb.vba = null;
    return;
  }
  const bytes = await pkg.bytes(part);
  try {
    wb.vba = { part, bytes, signed, project: readVbaProject(bytes, wb.limits), error: null };
  } catch (e) {
    wb.vba = { part, bytes, signed, project: null, error: e instanceof QuoinError ? e.code : 'vba.unreadable' };
  }
}

export { NS_DATAMASHUP, resolveTarget, u32 };
