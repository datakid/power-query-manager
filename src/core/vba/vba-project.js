import { QuoinError } from '../errors.js';
import { readCfb, findNode } from './cfb-read.js';
import { decompress } from './ovba-decompress.js';
import { parseDir, interpretDir } from './dir-stream.js';
import { decodeBytes, isSupportedCodePage } from './codepages.js';
import { parseProjectStream, classifyModule, protectionState } from './project-stream.js';
import { splitModuleSource } from './module-source.js';
import { DEFAULT_LIMITS } from '../limits.js';

export function readVbaProject(bytes, limits = DEFAULT_LIMITS) {
  const cfb = readCfb(bytes, limits);
  const dirNode = findNode(cfb.root, 'VBA/dir');
  if (!dirNode || !dirNode.data) throw new QuoinError('vba.dir', 'the VBA/dir stream is missing');
  let dirBytes;
  try {
    dirBytes = decompress(dirNode.data);
  } catch (e) {
    throw new QuoinError('vba.dir', e.message);
  }
  const parsed = parseDir(dirBytes);
  const anomalies = [...parsed.anomalies];
  const preliminary = interpretDir(parsed.records, (b) => decodeBytes(1252, b));
  const codePage = preliminary.codePage || 1252;
  const decode = (b) => decodeBytes(codePage, b);
  const info = interpretDir(parsed.records, decode);
  const projectNode = findNode(cfb.root, 'PROJECT');
  const projectInfo = projectNode && projectNode.data ? parseProjectStream(projectNode.data, codePage) : null;
  if (!projectInfo) anomalies.push('vba.projectStream');
  const supported = isSupportedCodePage(codePage);
  const prot = projectInfo ? protectionState(projectInfo) : { known: false, state: null };
  const locked = !prot.known || (prot.state & 0x4) !== 0 || (prot.state & 0x1) !== 0;
  const modules = [];
  for (const m of info.modules) {
    const name = m.nameUnicode || m.name;
    const streamName = m.streamNameUnicode || (m.streamNameBytes ? decode(m.streamNameBytes) : name);
    const node = findNode(cfb.root, `VBA/${streamName}`);
    const mod = {
      name,
      streamName,
      kind: projectInfo ? classifyModule(name, projectInfo, m.type) : m.type === 'procedural' ? 'standard' : 'class',
      dirType: m.type,
      offset: m.offset,
      offsetRecord: m.offsetRecord,
      readOnlyFlag: m.readOnly,
      error: null,
      sourceBytes: null,
      compressedFrom: null,
      text: '',
      model: null
    };
    if (!node || !node.data) {
      mod.error = 'vba.stream';
    } else if (m.offset === null || m.offset > node.data.length) {
      mod.error = 'vba.offset';
    } else {
      mod.compressedFrom = node.data.subarray(m.offset);
      try {
        mod.sourceBytes = decompress(mod.compressedFrom);
        mod.text = decode(mod.sourceBytes);
        mod.model = splitModuleSource(mod.text);
      } catch (e) {
        mod.error = e.code || 'vba.module';
      }
    }
    modules.push(mod);
  }
  if (info.moduleCount !== null && info.moduleCount !== info.modules.length) anomalies.push('vba.moduleCount');
  const writable = anomalies.length === 0 && supported && !locked && modules.every((m) => !m.error);
  return {
    cfb,
    records: parsed.records,
    codePage,
    codePageSupported: supported,
    projectName: info.name,
    references: info.references,
    projectInfo,
    modules,
    locked,
    protection: prot,
    anomalies,
    writable
  };
}
