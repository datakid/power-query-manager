import './misc.js';
import './number.js';
import './text.js';
import './datetime.js';
import './list.js';
import './table.js';
import './source.js';
import { LIB, COVERAGE } from './core.js';

export { LIB, COVERAGE };

export function coverageList() {
  return [...COVERAGE.entries()].map(([name, status]) => ({ name, status })).sort((a, b) => a.name.localeCompare(b.name));
}
