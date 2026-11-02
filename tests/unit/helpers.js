import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runOnce } from '../../src/core/m/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, '..', '..');
export const fixture = (name) => new Uint8Array(readFileSync(join(root, 'tests', 'fixtures', 'external', name)));
export const generated = (name) => new Uint8Array(readFileSync(join(root, 'tests', 'fixtures', 'workbooks', name)));

export function plain(v) {
  if (v === null || typeof v !== 'object') return v;
  switch (v.k) {
    case 'number':
      return v.special;
    case 'date':
    case 'time':
    case 'datetime':
    case 'datetimezone':
    case 'duration':
      return `${v.k}:${v.text}`;
    case 'binary':
      return `binary:${v.length}`;
    case 'list':
      return v.items.map(plain);
    case 'record':
      return Object.fromEntries(v.names.map((n, i) => [n, plain(v.values[i])]));
    case 'table':
      return { columns: v.columns.map((c) => c.name), rows: v.rows.map((r) => r.map(plain)) };
    case 'error':
      return { error: v.reason, message: v.message };
    case 'function':
    case 'type':
      return v.text;
    default:
      return v;
  }
}

export const baseOptions = { culture: 'en-US', now: '2026-10-30T12:00:00Z', localOffsetMin: 0, limits: {}, previewRows: 1000 };

export function runM(body, extra = {}) {
  const r = runOnce({ ...baseOptions, ...extra, sectionText: `section Section1;\r\n\r\nshared Q = ${body};`, queryName: 'Q' });
  return r;
}

export function evalM(body, extra) {
  const r = runM(body, extra);
  if (r.status === 'ok') return r.result.kind === 'function' ? 'function' : plain(r.result.value);
  if (r.status === 'error') return { error: r.error.reason, message: r.error.message };
  if (r.status === 'parse-error') return { parseError: r.error.message };
  return { status: r.status, code: r.code };
}
