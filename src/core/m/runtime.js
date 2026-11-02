import { MError } from './values.js';

export class QuoinStop extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'QuoinStop';
    this.code = code;
    this.detail = detail === undefined ? null : detail;
  }
}

export class NeedBinding extends QuoinStop {
  constructor(kind, key) {
    super('m.needBinding', { kind, key });
    this.kind = kind;
    this.key = key;
  }
}

export const RT = {
  culture: null,
  now: null,
  snapshot: null,
  bindings: new Map(),
  limits: null,
  flags: new Set(),
  deadline: 0,
  counter: 0,
  depth: 0,
  seed: 1,
  useUpstream: false,
  evalMember: null,
  members: null,
  sections: null
};

export function tick() {
  RT.counter++;
  if ((RT.counter & 0x1FFF) === 0 && RT.deadline && Date.now() > RT.deadline) throw new QuoinStop('m.timeout');
}

export function checkRows(n) {
  if (RT.limits && n > RT.limits.maxRows) throw new QuoinStop('m.rows', { rows: n });
}

export function random() {
  RT.flags.add('non-deterministic');
  let t = (RT.seed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export { MError };
