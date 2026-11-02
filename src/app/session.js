import { openWorkbook } from '../core/workbook.js';
import { buildWorkbook } from '../core/save.js';
import { buildSnapshot, buildBindingWorkbook } from '../core/snapshot.js';
import { checkSection, parseSection } from '../core/m/engine.js';
import { rebuildSection } from '../core/pq/section.js';
import { composeModuleText } from '../core/vba/writeback.js';
import { sanitizeFileName } from '../core/export/files.js';
import { QuoinError } from '../core/errors.js';

const trimEnds = (s) => s.replace(/^\s+/, '').replace(/\s+$/, '');

export class Session {
  constructor() {
    this.wb = null;
    this.queryEdits = new Map();
    this.moduleEdits = new Map();
    this.bindings = new Map();
    this.snapshotCache = null;
    this.size = 0;
  }

  async open(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = await openWorkbook(bytes, file.name);
    this.wb = wb;
    this.size = bytes.length;
    this.queryEdits = new Map();
    this.moduleEdits = new Map();
    this.snapshotCache = null;
    return wb;
  }

  get queries() {
    return this.wb ? this.wb.queries : [];
  }

  get modules() {
    return this.wb && this.wb.vba && this.wb.vba.project ? this.wb.vba.project.modules : [];
  }

  query(name) {
    return this.queries.find((q) => q.name === name) || null;
  }

  module(name) {
    return this.modules.find((m) => m.name === name) || null;
  }

  originalText(item) {
    if (item.type === 'query') return this.query(item.name).original;
    const m = this.module(item.name);
    return m && m.model ? m.model.visible : '';
  }

  textOf(item) {
    const edits = item.type === 'query' ? this.queryEdits : this.moduleEdits;
    return edits.has(item.name) ? edits.get(item.name) : this.originalText(item);
  }

  setText(item, text) {
    const edits = item.type === 'query' ? this.queryEdits : this.moduleEdits;
    const norm = item.type === 'query' ? trimEnds(text) : text;
    if (norm === this.originalText(item)) edits.delete(item.name);
    else edits.set(item.name, text);
  }

  isEdited(item) {
    return (item.type === 'query' ? this.queryEdits : this.moduleEdits).has(item.name);
  }

  revert(item) {
    (item.type === 'query' ? this.queryEdits : this.moduleEdits).delete(item.name);
  }

  get editCount() {
    return this.queryEdits.size + this.moduleEdits.size;
  }

  queryEditable() {
    const m = this.wb && this.wb.mashup;
    if (!m || m.error) return { editable: false, reason: 'pq.format' };
    if (m.model.warnings.length || m.split.errors.length) return { editable: false, reason: 'pq.format' };
    return { editable: true };
  }

  moduleEditable(name) {
    const v = this.wb && this.wb.vba;
    if (!v || !v.project) return { editable: false, reason: 'vba.unreadable' };
    const p = v.project;
    if (p.locked) return { editable: false, reason: 'vba.locked' };
    if (!p.writable) return { editable: false, reason: 'vba.unreadable' };
    const m = this.module(name);
    if (!m || m.error) return { editable: false, reason: 'vba.unreadable' };
    return { editable: true };
  }

  currentSectionText() {
    const mashup = this.wb.mashup;
    const edits = new Map();
    for (const [name, text] of this.queryEdits) edits.set(name, trimEnds(text));
    return rebuildSection(mashup.section.text, mashup.split.members.filter((m) => edits.has(m.name)), edits);
  }

  async snapshot() {
    if (!this.snapshotCache) this.snapshotCache = await buildSnapshot(this.wb);
    return this.snapshotCache;
  }

  async addBinding(key, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let workbook = null;
    if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      try {
        workbook = await buildBindingWorkbook(await openWorkbook(bytes, file.name));
      } catch {
        workbook = null;
      }
    }
    const binding = { name: file.name, bytes, workbook };
    this.bindings.set(key, binding);
    return binding;
  }

  async download({ refreshOnLoad, acknowledgeSignature, faultInject }) {
    return buildWorkbook(this.wb, {
      queryEdits: this.queryEdits,
      vbaEdits: this.moduleEdits,
      refreshOnLoad,
      acknowledgeSignature,
      faultInject,
      checkSection
    });
  }

  suggestedName() {
    const base = (this.wb.fileName || 'workbook').replace(/\.[^.]*$/, '');
    const ext = this.wb.vba ? 'xlsm' : this.wb.format === 'xlsm' || this.wb.format === 'xltm' ? this.wb.format : this.wb.format;
    return sanitizeFileName(`${base} (edited).${ext}`, `.${ext}`);
  }

  composeModule(name) {
    const m = this.module(name);
    return composeModuleText(m, this.textOf({ type: 'module', name }));
  }

  parseCurrent() {
    return parseSection(this.currentSectionText());
  }
}

export { QuoinError };
