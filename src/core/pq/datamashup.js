import { QuoinError } from '../errors.js';
import { u32, le32, concat, decodeTextBytes, encodeTextBytes, utf8Decode } from '../bytes.js';
import { readZip } from '../zip-read.js';
import { writeZip, rawFromEntry } from '../zip-write.js';
import { DEFAULT_LIMITS } from '../limits.js';

export const SECTION_PART = 'Formulas/Section1.m';

export function parseDataMashup(bytes, limits = DEFAULT_LIMITS) {
  const warnings = [];
  const take = (offset, length, label) => {
    if (offset + length > bytes.length) throw new QuoinError('pq.length', `${label} exceeds the buffer`, 'DataMashup');
  };
  take(0, 8, 'header');
  const version = u32(bytes, 0);
  if (version !== 0) warnings.push('pq.version');
  let o = 4;
  const sections = [];
  for (const label of ['package', 'permissions', 'metadata', 'bindings']) {
    take(o, 4, `${label} length`);
    const n = u32(bytes, o);
    o += 4;
    take(o, n, label);
    sections.push(bytes.subarray(o, o + n));
    o += n;
  }
  if (o !== bytes.length) warnings.push('pq.trailing');
  const [packageBytes, permissionBytes, metadataBytes, bindingBytes] = sections;
  let packageParts = null;
  try {
    packageParts = readZip(packageBytes, limits);
  } catch (e) {
    if (e instanceof QuoinError) throw new QuoinError('pq.package', e.message, 'DataMashup');
    throw e;
  }
  let metadataXml = '';
  let metadataVersion = 0;
  let metadataContent = new Uint8Array(0);
  if (metadataBytes.length >= 8) {
    metadataVersion = u32(metadataBytes, 0);
    const xmlLength = u32(metadataBytes, 4);
    if (8 + xmlLength + 4 <= metadataBytes.length) {
      metadataXml = decodeTextBytes(metadataBytes.subarray(8, 8 + xmlLength)).text;
      const contentLength = u32(metadataBytes, 8 + xmlLength);
      if (8 + xmlLength + 4 + contentLength <= metadataBytes.length) {
        metadataContent = metadataBytes.subarray(12 + xmlLength, 12 + xmlLength + contentLength);
      } else warnings.push('pq.metadata');
    } else warnings.push('pq.metadata');
    if (metadataVersion !== 0) warnings.push('pq.version');
  } else warnings.push('pq.metadata');
  return {
    version,
    packageParts,
    packageBytes,
    permissionsXml: permissionBytes.length ? decodeTextBytes(permissionBytes).text : '',
    metadata: { version: metadataVersion, xml: metadataXml, content: metadataContent },
    permissionBindings: bindingBytes,
    raw: { permissions: permissionBytes, metadata: metadataBytes },
    warnings
  };
}

export async function readSection(model) {
  const entry = model.packageParts.get(SECTION_PART);
  if (!entry) throw new QuoinError('pq.section', 'Formulas/Section1.m is missing', 'DataMashup');
  const bytes = await entry.read();
  const decoded = decodeTextBytes(bytes);
  return { text: decoded.text, bom: decoded.bom, bytes };
}

export async function buildDataMashup(model, sectionUpdate) {
  let packageBytes = model.packageBytes;
  if (sectionUpdate) {
    const entries = [];
    for (const e of model.packageParts.entries) {
      if (e.name.toLowerCase() === SECTION_PART.toLowerCase()) {
        entries.push({ name: e.name, data: encodeTextBytes(sectionUpdate.text, 'utf-8', sectionUpdate.bom) });
      } else {
        entries.push({ name: e.name, raw: rawFromEntry(e) });
      }
    }
    packageBytes = await writeZip(entries);
  }
  return concat([
    le32(model.version),
    le32(packageBytes.length),
    packageBytes,
    le32(model.raw.permissions.length),
    model.raw.permissions,
    le32(model.raw.metadata.length),
    model.raw.metadata,
    le32(model.permissionBindings.length),
    model.permissionBindings
  ]);
}

export function sectionTextFromBytes(bytes) {
  return utf8Decode(bytes);
}
