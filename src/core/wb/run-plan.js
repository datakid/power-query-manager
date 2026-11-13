import { downstreamOf, topoOrder } from './deps.js';

export const RUN_MODES = ['run', 'run-to-here', 'run-selected', 'run-downstream', 'run-stale', 'run-all'];

function functionsOf(index) {
  return new Set(index.members.filter((m) => m.isFunction).map((m) => m.name));
}

function batch(index, names, stopAtFirstError) {
  const known = new Set(index.members.map((m) => m.name));
  const fns = functionsOf(index);
  const wanted = [...new Set(names)].filter((n) => known.has(n));
  const skipped = wanted.filter((n) => fns.has(n));
  const runnable = wanted.filter((n) => !fns.has(n));
  return { kind: 'many', names: topoOrder(index, runnable), skipped, stopAtFirstError: !!stopAtFirstError };
}

export function planRun(index, mode, { current = null, step = null, selection = [], statuses = new Map(), stopAtFirstError = false } = {}) {
  const known = new Set(index.members.map((m) => m.name));
  const fns = functionsOf(index);
  switch (mode) {
    case 'run':
    case 'run-to-here':
      if (!current || !known.has(current)) return { kind: 'none', reason: 'no-query', names: [], skipped: [] };
      if (fns.has(current)) return { kind: 'none', reason: 'function', names: [], skipped: [current] };
      return { kind: 'steps', name: current, upTo: mode === 'run-to-here' ? step : null, names: [current], skipped: [] };
    case 'run-selected':
      return batch(index, selection, stopAtFirstError);
    case 'run-downstream': {
      if (!current || !known.has(current)) return { kind: 'none', reason: 'no-query', names: [], skipped: [] };
      return batch(index, [current, ...downstreamOf(index, [current])], stopAtFirstError);
    }
    case 'run-stale':
      return batch(index, index.members.filter((m) => statuses.get(m.name) === 'stale').map((m) => m.name), stopAtFirstError);
    case 'run-all':
      return batch(index, index.members.map((m) => m.name), stopAtFirstError);
    default:
      return { kind: 'none', reason: 'mode', names: [], skipped: [] };
  }
}
