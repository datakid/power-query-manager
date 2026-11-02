import { QuoinError } from '../errors.js';
import { compress } from './ovba-compress.js';
import { decompress } from './ovba-decompress.js';
import { serializeDir } from './dir-stream.js';
import { encodeText } from './codepages.js';
import { joinModuleSource } from './module-source.js';
import { writeCfb } from './cfb-write.js';
import { readVbaProject } from './vba-project.js';
import { equalBytes } from '../bytes.js';

export const MINIMAL_VBA_PROJECT = new Uint8Array([0xCC, 0x61, 0xFF, 0xFF, 0x00, 0x00, 0x00]);

export function composeModuleText(mod, editedView) {
  return joinModuleSource(mod.model, editedView);
}

export function writeVbaProject(project, edits) {
  if (!project.writable) throw new QuoinError('vba.write', 'this project cannot be written');
  const encoded = new Map();
  for (const [name, view] of edits) {
    const mod = project.modules.find((m) => m.name === name);
    if (!mod) throw new QuoinError('vba.write', `unknown module ${name}`, name);
    const text = composeModuleText(mod, view);
    const bytes = encodeText(project.codePage, text, mod.sourceBytes);
    const compressed = compress(bytes);
    if (!equalBytes(decompress(compressed), bytes)) throw new QuoinError('vba.compress', 'module did not survive compression', name);
    encoded.set(name, compressed);
  }
  const records = project.records.map((r) => ({ ...r }));
  const root = structuredCloneNode(project.cfb.root);
  const vba = root.children.find((c) => c.name.toLowerCase() === 'vba');
  for (const mod of project.modules) {
    const stream = vba.children.find((c) => c.name.toLowerCase() === mod.streamName.toLowerCase());
    stream.data = encoded.get(mod.name) || mod.compressedFrom;
    records[mod.offsetRecord] = { ...records[mod.offsetRecord], data: new Uint8Array(4) };
  }
  const dirNode = vba.children.find((c) => c.name.toLowerCase() === 'dir');
  dirNode.data = compress(serializeDir(records));
  const pc = vba.children.find((c) => c.name === '_VBA_PROJECT');
  if (pc) pc.data = MINIMAL_VBA_PROJECT;
  vba.children = vba.children.filter((c) => !/^__SRP_/i.test(c.name));
  return writeCfb(root);
}

function structuredCloneNode(n) {
  return { ...n, children: n.children ? n.children.map(structuredCloneNode) : undefined };
}

export function verifyVbaProject(bytes, expected) {
  const back = readVbaProject(bytes);
  for (const [name, view] of expected) {
    const mod = back.modules.find((m) => m.name === name);
    if (!mod || !mod.model) throw new QuoinError('check.vba', 'module missing after write', name);
    if (mod.model.visible !== view) throw new QuoinError('check.vba', 'module text changed during write', name);
  }
  return back;
}
