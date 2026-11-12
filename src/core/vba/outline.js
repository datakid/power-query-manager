const PROC_START = /^(?:(Public|Private|Friend)\s+)?(?:(Static)\s+)?(Sub|Function|Property\s+(?:Get|Let|Set))\s+([A-Za-z_][\w]*)\s*(?:\((.*)\))?\s*(?:As\s+([\w.]+(?:\s*\(\s*\))?))?\s*$/i;
const PROC_END = /^End\s+(Sub|Function|Property)\b/i;
const DECLARE = /^(?:(Public|Private)\s+)?Declare\s+(?:PtrSafe\s+)?(?:Sub|Function)\s+([A-Za-z_]\w*)/i;
const EVENT = /^(?:(Public|Private)\s+)?Event\s+([A-Za-z_]\w*)/i;
const BLOCK = /^(?:(Public|Private)\s+)?(Type|Enum)\s+([A-Za-z_]\w*)\s*$/i;
const BLOCK_END = /^End\s+(Type|Enum)\b/i;
const CONST = /^(?:(Public|Private|Global)\s+)?Const\s+(.+)$/i;
const VAR = /^(Public|Private|Global|Dim|Static)\s+(?:WithEvents\s+)?(.+)$/i;
const OPTION = /^Option\s+(Explicit|Compare\s+(?:Text|Binary|Database)|Base\s+[01]|Private\s+Module)\b/i;
const ENTRY_KINDS = new Set(['sub']);

function mask(line) {
  let out = '';
  let inStr = false;
  let comment = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          i++;
          continue;
        }
        inStr = false;
        out += '"';
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += '"';
      continue;
    }
    if (c === "'") {
      comment = true;
      break;
    }
    out += c;
  }
  const trimmed = out.trim();
  if (!comment && /^Rem(\s|$)/i.test(trimmed)) return { code: '', comment: true, open: false };
  return { code: out, comment, open: inStr };
}

function logicalLines(text) {
  const physical = text.split(/\r\n|\r|\n/);
  const out = [];
  const problems = [];
  let i = 0;
  while (i < physical.length) {
    const startLine = i + 1;
    let joined = '';
    let first = true;
    let col = 1;
    for (;;) {
      const raw = physical[i];
      const m = mask(raw);
      if (m.open) problems.push({ line: i + 1, col: raw.indexOf('"') + 1, code: 'unterminated-string' });
      if (first) {
        col = raw.search(/\S/) + 1 || 1;
        first = false;
      }
      const cont = !m.comment && /\s_\s*$/.test(m.code) && i + 1 < physical.length;
      joined += cont ? m.code.replace(/\s_\s*$/, ' ') : m.code;
      i++;
      if (!cont) break;
    }
    out.push({ text: joined, line: startLine, endLine: i, col });
  }
  return { lines: out, problems };
}

function splitStatements(code) {
  const protectedCode = code.replace(/:=/g, '\u0001');
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of protectedCode) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ':' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.replace(/\u0001/g, ':=').trim()).filter(Boolean);
}

function splitTop(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length);
}

function parseParams(text) {
  if (!text || !text.trim()) return [];
  return splitTop(text).map((p) => {
    let rest = p;
    let optional = false;
    let byRef = true;
    let paramArray = false;
    for (;;) {
      const m = /^(Optional|ByVal|ByRef|ParamArray)\s+/i.exec(rest);
      if (!m) break;
      const k = m[1].toLowerCase();
      if (k === 'optional') optional = true;
      else if (k === 'byval') byRef = false;
      else if (k === 'byref') byRef = true;
      else paramArray = true;
      rest = rest.slice(m[0].length);
    }
    const nm = /^([A-Za-z_]\w*)\s*(?:\(\s*\))?\s*(?:As\s+([\w.]+))?\s*(?:=.*)?$/i.exec(rest);
    return { name: nm ? nm[1] : rest.split(/\s/)[0], byRef, optional: optional || paramArray, paramArray, type: nm && nm[2] ? nm[2] : null };
  });
}

function names(list) {
  return splitTop(list).map((item) => {
    const m = /^([A-Za-z_]\w*)/.exec(item);
    return m ? m[1] : null;
  }).filter(Boolean);
}

const scopeOf = (word) => {
  const w = (word || '').toLowerCase();
  if (w === 'private' || w === 'dim' || w === '') return 'private';
  if (w === 'friend') return 'friend';
  return 'public';
};

export function outlineModule(visibleText, { moduleKind = 'standard' } = {}) {
  const { lines, problems } = logicalLines(visibleText);
  const options = { explicit: false, compare: null, base: null, private: false };
  const declarations = [];
  const procedures = [];
  let proc = null;
  let block = null;
  const handler = moduleKind !== 'standard';
  for (const L of lines) {
    for (const stmt of splitStatements(L.text)) {
      if (block) {
        const be = BLOCK_END.exec(stmt);
        if (be) {
          if (be[1].toLowerCase() !== block.kind) problems.push({ line: L.line, col: L.col, code: 'mismatched-end' });
          block = null;
        }
        continue;
      }
      if (proc) {
        const pe = PROC_END.exec(stmt);
        if (pe) {
          const want = proc.kind.startsWith('property') ? 'property' : proc.kind;
          if (pe[1].toLowerCase() !== want) problems.push({ line: L.line, col: L.col, code: 'mismatched-end' });
          proc.endLine = L.endLine;
          procedures.push(proc);
          proc = null;
          continue;
        }
        if (PROC_START.test(stmt) && !DECLARE.test(stmt)) {
          problems.push({ line: proc.startLine, col: 1, code: 'unterminated-procedure' });
          proc.endLine = L.line - 1;
          procedures.push(proc);
          proc = null;
        } else continue;
      }
      if (PROC_END.test(stmt)) {
        problems.push({ line: L.line, col: L.col, code: 'stray-end' });
        continue;
      }
      let m = OPTION.exec(stmt);
      if (m) {
        const w = m[1].toLowerCase();
        if (w === 'explicit') options.explicit = true;
        else if (w.startsWith('compare')) options.compare = w.split(/\s+/)[1];
        else if (w.startsWith('base')) options.base = Number(w.split(/\s+/)[1]);
        else options.private = true;
        continue;
      }
      if ((m = DECLARE.exec(stmt))) {
        declarations.push({ kind: 'declare', name: m[2], scope: scopeOf(m[1] || 'public'), line: L.line });
        continue;
      }
      if ((m = EVENT.exec(stmt))) {
        declarations.push({ kind: 'event', name: m[2], scope: scopeOf(m[1] || 'public'), line: L.line });
        continue;
      }
      if ((m = BLOCK.exec(stmt))) {
        declarations.push({ kind: m[2].toLowerCase(), name: m[3], scope: scopeOf(m[1] || 'public'), line: L.line });
        block = { kind: m[2].toLowerCase(), line: L.line };
        continue;
      }
      if ((m = PROC_START.exec(stmt))) {
        const kind = m[3].toLowerCase().replace(/\s+/g, '-');
        const params = parseParams(m[5]);
        const name = m[4];
        const scope = scopeOf(m[1] || 'public');
        const ev = handler && /^[A-Za-z]\w*_[A-Za-z]\w*$/.test(name) ? name.slice(0, name.indexOf('_')) : null;
        proc = {
          name,
          kind,
          scope,
          isStatic: !!m[2],
          params,
          returns: m[6] ? m[6].replace(/\s+/g, '') : null,
          startLine: L.line,
          endLine: L.endLine,
          bodyStartLine: L.endLine + 1,
          isEntryPoint: moduleKind === 'standard' && ENTRY_KINDS.has(kind) && scope === 'public' && params.every((p) => p.optional),
          isEventHandler: !!ev,
          eventOf: ev
        };
        continue;
      }
      if ((m = CONST.exec(stmt))) {
        for (const n of names(m[2])) declarations.push({ kind: 'const', name: n, scope: scopeOf(m[1] || 'private'), line: L.line });
        continue;
      }
      if ((m = VAR.exec(stmt))) {
        for (const n of names(m[2])) declarations.push({ kind: 'dim', name: n, scope: scopeOf(m[1]), line: L.line });
      }
    }
  }
  if (proc) {
    problems.push({ line: proc.startLine, col: 1, code: 'unterminated-procedure' });
    proc.endLine = lines.length ? lines[lines.length - 1].endLine : proc.startLine;
    procedures.push(proc);
  }
  if (block) problems.push({ line: block.line, col: 1, code: 'unterminated-block' });
  problems.sort((a, b) => a.line - b.line || a.col - b.col);
  return { options, declarations, procedures, problems };
}
