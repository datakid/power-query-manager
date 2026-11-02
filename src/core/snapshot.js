import { listCurrentWorkbookSources, readSource, readUsedGrid } from './cells.js';

export async function buildSnapshot(wb) {
  const sources = [];
  const queryTables = new Set(wb.queries.filter((q) => q.load.kind === 'table').map((q) => `${q.load.sheet}|${q.load.tableName}`));
  for (const s of listCurrentWorkbookSources(wb)) {
    const data = await readSource(wb, s);
    const queryLoaded = s.kind === 'table' && queryTables.has(`${s.table.sheet}|${s.table.displayName}`);
    sources.push({ name: s.name, kind: s.kind, columns: data.columns, rows: data.rows, queryLoaded });
  }
  return { date1904: wb.date1904, sources };
}

export async function buildBindingWorkbook(wb) {
  const items = [];
  for (const sheet of wb.sheets) {
    if (sheet.type !== 'worksheet' || !sheet.part) continue;
    const grid = await readUsedGrid(wb, sheet.name);
    const width = grid.length ? grid[0].length : 0;
    items.push({ name: sheet.name, item: sheet.name, kind: 'Sheet', hidden: sheet.state !== 'visible', columns: Array.from({ length: width }, (_, i) => `Column${i + 1}`), rows: grid });
  }
  for (const s of listCurrentWorkbookSources(wb)) {
    const data = await readSource(wb, s);
    items.push({ name: s.name, item: s.name, kind: s.kind === 'table' ? 'Table' : 'DefinedName', hidden: false, columns: data.columns, rows: data.rows });
  }
  return { items, date1904: wb.date1904 };
}
