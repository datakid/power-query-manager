const IMPLICIT = new Set(['_']);

function child(scope, names) {
  return { names: new Set(names), parent: scope };
}

function bound(scope, name) {
  for (let s = scope; s; s = s.parent) if (s.names.has(name)) return true;
  return false;
}

export function freeRefs(root, base = null) {
  const out = [];
  const visit = (node, scope) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, scope);
      return;
    }
    switch (node.t) {
      case 'Identifier':
        if (!IMPLICIT.has(node.name) && !bound(scope, node.name)) out.push({ name: node.name, start: node.start, end: node.end, inclusive: !!node.inclusive, kind: 'identifier' });
        return;
      case 'SectionAccess':
        out.push({ name: node.name, start: node.start, end: node.end, section: node.section, kind: 'section' });
        return;
      case 'Let': {
        const inner = child(scope, node.bindings.map((b) => b.name));
        for (const b of node.bindings) visit(b.expr, inner);
        visit(node.body, inner);
        return;
      }
      case 'Function': {
        const inner = child(scope, node.params.map((p) => p.name));
        visit(node.body, inner);
        return;
      }
      case 'Record': {
        const inner = child(scope, node.fields.map((f) => f.name));
        for (const f of node.fields) visit(f.expr, inner);
        return;
      }
      default:
        for (const key of Object.keys(node)) {
          if (key === 't' || key === 'start' || key === 'end') continue;
          const v = node[key];
          if (v && typeof v === 'object') visit(v, scope);
        }
    }
  };
  visit(root, base ? child(null, base) : null);
  return out;
}
