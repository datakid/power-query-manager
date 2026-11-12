import { DEFAULT_LIMITS } from '../limits.js';

export function cellsOf(value) {
  if (value && Array.isArray(value.columns) && typeof value.rowCount === 'number') return Math.max(1, value.rowCount * Math.max(1, value.columns.length));
  return 1;
}

export class ResultStore {
  constructor({ maxResults = DEFAULT_LIMITS.maxStoredResults, maxCells = DEFAULT_LIMITS.maxStoredCells } = {}) {
    this.maxResults = maxResults;
    this.maxCells = maxCells;
    this.entries = new Map();
    this.tick = 0;
    this.nextId = 1;
    this.nextGroup = 1;
  }

  newGroup() {
    return `g${this.nextGroup++}`;
  }

  get size() {
    return this.entries.size;
  }

  get totalCells() {
    let n = 0;
    for (const e of this.entries.values()) n += e.cells;
    return n;
  }

  ids() {
    return [...this.entries.keys()];
  }

  add({ value, culture = null, member = null, step = null, group = null, cells = null }) {
    const id = `r${this.nextId++}`;
    const entry = { id, value, culture, member, step, group: group || this.newGroup(), cells: cells === null ? cellsOf(value) : cells, pinned: false, lastUsed: ++this.tick };
    this.entries.set(id, entry);
    const evicted = this.enforce(entry.group);
    return { id, evicted };
  }

  get(id) {
    const e = this.entries.get(id);
    if (e) e.lastUsed = ++this.tick;
    return e;
  }

  peek(id) {
    return this.entries.get(id);
  }

  has(id) {
    return this.entries.has(id);
  }

  pin(id, pinned = true) {
    const e = this.entries.get(id);
    if (!e) return false;
    e.pinned = pinned;
    return true;
  }

  release(id) {
    return this.entries.delete(id);
  }

  clear() {
    const ids = this.ids();
    this.entries.clear();
    return ids;
  }

  over() {
    return this.entries.size > this.maxResults || this.totalCells > this.maxCells;
  }

  enforce(protectedGroup) {
    const evicted = [];
    const drop = (ids) => {
      for (const id of ids) {
        this.entries.delete(id);
        evicted.push(id);
      }
    };
    while (this.over()) {
      const groups = new Map();
      for (const e of this.entries.values()) {
        if (e.group === protectedGroup || e.pinned) continue;
        const g = groups.get(e.group) || { last: 0, ids: [] };
        g.last = Math.max(g.last, e.lastUsed);
        g.ids.push(e.id);
        groups.set(e.group, g);
      }
      if (!groups.size) break;
      const [, victim] = [...groups].sort((a, b) => a[1].last - b[1].last)[0];
      drop(victim.ids);
    }
    while (this.over()) {
      const pinned = [...this.entries.values()].filter((e) => e.pinned && e.group !== protectedGroup).sort((a, b) => a.lastUsed - b.lastUsed);
      if (!pinned.length) break;
      drop([pinned[0].id]);
    }
    return evicted;
  }
}
