import { CommandRegistry } from './commands.js';

const inField = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);

export function buildRegistry(app) {
  const r = new CommandRegistry();
  const needsFile = (a) => (a.ws ? true : 'Open a workbook first.');
  r.register({ id: 'openFile', keys: ['Mod+O'], surfaces: ['T3'], run: (a) => a.input.click() });
  r.register({ id: 'run', keys: ['Mod+Enter'], surfaces: ['T1'], enabled: needsFile, run: (a) => (a.ws ? a.ws.run() : false) });
  r.register({ id: 'cancel', keys: ['Escape'], surfaces: ['T1'], enabled: (a) => (a.ws && a.ws.runner.running ? true : 'Nothing is running.'), run: (a) => (a.ws ? a.ws.cancel() : false) });
  r.register({ id: 'download', keys: ['Mod+S'], surfaces: ['T1'], enabled: needsFile, run: (a) => a.ws && a.openDownload() });
  r.register({ id: 'export', keys: ['Mod+Shift+E'], surfaces: ['T3'], enabled: needsFile, run: (a) => a.ws && a.openExport() });
  r.register({ id: 'prevItem', keys: ['Alt+ArrowUp'], surfaces: ['T2'], enabled: needsFile, run: (a) => a.ws && a.ws.step(-1) });
  r.register({ id: 'nextItem', keys: ['Alt+ArrowDown'], surfaces: ['T2'], enabled: needsFile, run: (a) => a.ws && a.ws.step(1) });
  r.register({ id: 'print', keys: ['Mod+P'], surfaces: ['T1'], enabled: needsFile, run: (a) => a.ws && a.openPrint() });
  r.register({ id: 'palette', keys: ['Mod+K', 'Mod+Shift+P'], surfaces: ['T1'], run: (a) => a.openPalette() });
  r.register({ id: 'shortcuts', keys: ['?'], surfaces: ['T3'], when: () => !inField(), run: (a) => a.openShortcuts() });
  r.register({ id: 'settings', keys: [], surfaces: ['T3'], run: (a) => a.openSettings() });
  return r;
}
