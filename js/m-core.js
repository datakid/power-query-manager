(function () {
  const M = window.M || (window.M = {});

  const KEYWORDS = new Set(['and', 'as', 'each', 'else', 'error', 'false', 'if', 'in', 'is', 'let', 'meta', 'not', 'null', 'or', 'otherwise', 'section', 'shared', 'then', 'true', 'try', 'type', 'catch']);
  const PRIMS = new Set(['any', 'anynonnull', 'binary', 'date', 'datetime', 'datetimezone', 'duration', 'function', 'list', 'logical', 'none', 'null', 'number', 'record', 'table', 'text', 'time', 'type']);

  class SyntaxErr extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; this.isSyntax = true; }
  }

  function lineCol(src, pos) {
    let line = 1, col = 1;
    for (let i = 0; i < pos && i < src.length; i++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
    }
    return { line, col };
  }

  const ESC = { cr: '\r', lf: '\n', tab: '\t', '#': '#' };

  function decodeEsc(inner) {
    const parts = inner.split(',');
    let out = '';
    for (const raw of parts) {
      const p = raw.trim();
      if (ESC[p.toLowerCase()] !== undefined && p !== '') out += ESC[p.toLowerCase()];
      else if (/^[0-9a-fA-F]{4}$/.test(p) || /^[0-9a-fA-F]{8}$/.test(p)) out += String.fromCodePoint(parseInt(p, 16));
      else return null;
    }
    return out;
  }

  const isIdStart = c => /[A-Za-z_\u00C0-\uFFFF]/.test(c);
  const isIdPart = c => /[A-Za-z0-9_\u00C0-\uFFFF]/.test(c);

  function readText(src, i) {
    const n = src.length, s = i;
    let v = '';
    i++;
    for (;;) {
      if (i >= n) throw new SyntaxErr('Text is missing its closing quote', s);
      const ch = src[i];
      if (ch === '"') {
        if (src[i + 1] === '"') { v += '"'; i += 2; continue; }
        i++;
        break;
      }
      if (ch === '#' && src[i + 1] === '(') {
        const j = src.indexOf(')', i);
        if (j > 0) {
          const dec = decodeEsc(src.slice(i + 2, j));
          if (dec != null) { v += dec; i = j + 1; continue; }
        }
      }
      v += ch;
      i++;
    }
    return { v, end: i };
  }

  function lex(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\u00A0' || c === '\uFEFF' || c === '\f' || c === '\v') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
      const s = i;
      if (c === '"') {
        const r = readText(src, i);
        toks.push({ t: 'str', v: r.v, s, e: r.end });
        i = r.end;
        continue;
      }
      if (c === '#') {
        if (src[i + 1] === '"') {
          const r = readText(src, i + 1);
          toks.push({ t: 'id', v: r.v, s, e: r.end, quoted: true });
          i = r.end;
          continue;
        }
        let j = i + 1;
        while (j < n && isIdPart(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j), s, e: j });
        i = j;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || '') && src[i - 1] !== '.')) {
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          let j = i + 2;
          while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
          toks.push({ t: 'num', v: parseInt(src.slice(i + 2, j), 16), s, e: j });
          i = j;
          continue;
        }
        let j = i;
        while (j < n && /[0-9]/.test(src[j])) j++;
        if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        if ((src[j] === 'e' || src[j] === 'E') && /[0-9+\-]/.test(src[j + 1] || '')) {
          j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
        toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), s, e: j });
        i = j;
        continue;
      }
      if (isIdStart(c)) {
        let j = i + 1;
        for (;;) {
          while (j < n && isIdPart(src[j])) j++;
          if (src[j] === '.' && j + 1 < n && isIdStart(src[j + 1])) { j++; continue; }
          break;
        }
        const w = src.slice(i, j);
        toks.push({ t: KEYWORDS.has(w) ? 'kw' : 'id', v: w, s, e: j });
        i = j;
        continue;
      }
      const three = src.substr(i, 3), two = src.substr(i, 2);
      if (three === '...') { toks.push({ t: 'op', v: '...', s, e: i + 3 }); i += 3; continue; }
      if (two === '<=' || two === '>=' || two === '<>' || two === '=>' || two === '..' || two === '??') { toks.push({ t: 'op', v: two, s, e: i + 2 }); i += 2; continue; }
      if ('=<>+-*/&()[]{},;?@!'.includes(c)) { toks.push({ t: 'op', v: c, s, e: i + 1 }); i++; continue; }
      throw new SyntaxErr('Unexpected character “' + c + '”', s);
    }
    toks.push({ t: 'eof', v: null, s: n, e: n });
    return toks;
  }

  class Parser {
    constructor(src, toks) { this.src = src; this.toks = toks || lex(src); this.p = 0; }
    get tok() { return this.toks[this.p]; }
    peek(k) { return this.toks[Math.min(this.p + (k || 1), this.toks.length - 1)]; }
    isOp(v, t) { t = t || this.tok; return t.t === 'op' && t.v === v; }
    isKw(v, t) { t = t || this.tok; return t.t === 'kw' && t.v === v; }
    next() { const t = this.tok; if (this.p < this.toks.length - 1) this.p++; return t; }
    accept(v) { if (this.isOp(v)) { this.next(); return true; } return false; }
    acceptKw(v) { if (this.isKw(v)) { this.next(); return true; } return false; }
    fail(msg, t) { t = t || this.tok; throw new SyntaxErr(msg, t.s); }
    describe(t) { return t.t === 'eof' ? 'end of query' : '“' + this.src.slice(t.s, t.e) + '”'; }
    expect(v) { if (!this.accept(v)) this.fail('Expected “' + v + '” but found ' + this.describe(this.tok)); }
    expectKw(v) { if (!this.acceptKw(v)) this.fail('Expected “' + v + '” but found ' + this.describe(this.tok)); }

    parseDocument() {
      const e = this.expr();
      if (this.tok.t !== 'eof') this.fail('Unexpected ' + this.describe(this.tok));
      return e;
    }

    name() {
      const t = this.tok;
      if (t.t === 'id') { this.next(); return t.v; }
      this.fail('Expected a name but found ' + this.describe(t));
    }

    genId() {
      const first = this.tok;
      if (first.t === 'id' && first.quoted) { this.next(); return first.v; }
      let last = null;
      while (this.tok.t === 'id' || this.tok.t === 'kw' || this.tok.t === 'num') { last = this.next(); }
      if (!last) this.fail('Expected a field name but found ' + this.describe(this.tok));
      return this.src.slice(first.s, last.e).replace(/\s+/g, ' ');
    }

    expr() {
      const t = this.tok;
      if (t.t === 'kw') {
        if (t.v === 'let') return this.parseLet();
        if (t.v === 'if') {
          this.next();
          const c = this.expr();
          this.expectKw('then');
          const a = this.expr();
          this.expectKw('else');
          const b = this.expr();
          return { k: 'if', c, a, b, s: t.s };
        }
        if (t.v === 'each') { this.next(); return { k: 'each', body: this.expr(), s: t.s }; }
        if (t.v === 'try') {
          this.next();
          const e = this.expr();
          if (this.acceptKw('otherwise')) return { k: 'try', e, other: this.expr(), s: t.s };
          if (this.acceptKw('catch')) {
            this.expect('(');
            let pn = null;
            if (this.tok.t === 'id') pn = this.name();
            this.expect(')');
            this.expect('=>');
            return { k: 'try', e, catchName: pn, catchBody: this.expr(), s: t.s };
          }
          return { k: 'try', e, s: t.s };
        }
        if (t.v === 'error') { this.next(); return { k: 'error', e: this.expr(), s: t.s }; }
      }
      if (this.isOp('(')) {
        const f = this.tryFunction();
        if (f) return f;
      }
      return this.coalesce();
    }

    parseLet() {
      const s = this.tok.s;
      this.expectKw('let');
      const binds = [];
      for (;;) {
        const nt = this.tok;
        const nm = this.name();
        this.expect('=');
        const vs = this.tok.s;
        const e = this.expr();
        binds.push({ name: nm, e, s: nt.s, vs, ve: this.toks[this.p - 1].e });
        if (this.accept(',')) continue;
        break;
      }
      this.expectKw('in');
      return { k: 'let', binds, body: this.expr(), s };
    }

    tryFunction() {
      const save = this.p;
      let params;
      try {
        this.expect('(');
        params = [];
        if (!this.isOp(')')) {
          for (;;) {
            let optional = false;
            if (this.tok.t === 'id' && this.tok.v === 'optional' && this.peek().t === 'id') { this.next(); optional = true; }
            const nm = this.name();
            if (this.acceptKw('as')) this.parseType();
            params.push({ name: nm, optional });
            if (this.accept(',')) continue;
            break;
          }
        }
        this.expect(')');
        if (this.acceptKw('as')) this.parseType();
        if (!this.isOp('=>')) throw new SyntaxErr('', 0);
        this.next();
      } catch (e) {
        this.p = save;
        return null;
      }
      return { k: 'fn', params, body: this.expr(), s: this.toks[save].s };
    }

    coalesce() {
      const l = this.logicalOr();
      if (this.accept('??')) return { k: 'coalesce', l, r: this.coalesce() };
      return l;
    }

    logicalOr() {
      let l = this.logicalAnd();
      while (this.isKw('or')) { const s = this.next().s; l = { k: 'or', l, r: this.logicalAnd(), s }; }
      return l;
    }

    logicalAnd() {
      let l = this.isExpr();
      while (this.isKw('and')) { const s = this.next().s; l = { k: 'and', l, r: this.isExpr(), s }; }
      return l;
    }

    isExpr() {
      let l = this.asExpr();
      while (this.isKw('is')) { const s = this.next().s; l = { k: 'is', e: l, type: this.parseType(), s }; }
      return l;
    }

    asExpr() {
      let l = this.equality();
      while (this.isKw('as')) { const s = this.next().s; l = { k: 'as', e: l, type: this.parseType(), s }; }
      return l;
    }

    equality() {
      let l = this.relational();
      while (this.isOp('=') || this.isOp('<>')) { const t = this.next(); l = { k: 'bin', op: t.v, l, r: this.relational(), s: t.s }; }
      return l;
    }

    relational() {
      let l = this.additive();
      while (this.isOp('<') || this.isOp('>') || this.isOp('<=') || this.isOp('>=')) { const t = this.next(); l = { k: 'bin', op: t.v, l, r: this.additive(), s: t.s }; }
      return l;
    }

    additive() {
      let l = this.multiplicative();
      while (this.isOp('+') || this.isOp('-') || this.isOp('&')) { const t = this.next(); l = { k: 'bin', op: t.v, l, r: this.multiplicative(), s: t.s }; }
      return l;
    }

    multiplicative() {
      let l = this.metaExpr();
      while (this.isOp('*') || this.isOp('/')) { const t = this.next(); l = { k: 'bin', op: t.v, l, r: this.metaExpr(), s: t.s }; }
      return l;
    }

    metaExpr() {
      let l = this.unary();
      while (this.isKw('meta')) { this.next(); l = { k: 'meta', e: l, m: this.unary() }; }
      return l;
    }

    unary() {
      const t = this.tok;
      if (this.isOp('+') || this.isOp('-')) { this.next(); return { k: 'unary', op: t.v, e: this.unary(), s: t.s }; }
      if (this.isKw('not')) { this.next(); return { k: 'unary', op: 'not', e: this.unary(), s: t.s }; }
      if (this.isKw('type')) { this.next(); return { k: 'typeval', type: this.parseType(), s: t.s }; }
      return this.postfix(this.primary());
    }

    postfix(e) {
      for (;;) {
        if (this.isOp('[')) { e = this.bracket(e); continue; }
        if (this.isOp('{')) {
          const s = this.next().s;
          const idx = this.expr();
          this.expect('}');
          const opt = this.accept('?');
          e = { k: 'item', target: e, index: idx, opt, s };
          continue;
        }
        if (this.isOp('(')) {
          const s = this.next().s;
          const args = [];
          if (!this.isOp(')')) {
            for (;;) {
              args.push(this.expr());
              if (this.accept(',')) continue;
              break;
            }
          }
          this.expect(')');
          e = { k: 'call', fn: e, args, s };
          continue;
        }
        return e;
      }
    }

    bracket(target) {
      const s = this.tok.s;
      this.expect('[');
      if (this.isOp(']')) {
        this.next();
        if (target) this.fail('Expected a field name');
        return { k: 'record', fields: [], s };
      }
      if (this.isOp('[')) {
        const names = [];
        for (;;) {
          this.expect('[');
          names.push(this.genId());
          this.expect(']');
          if (this.accept(',')) continue;
          break;
        }
        this.expect(']');
        const opt = this.accept('?');
        return { k: 'proj', target, names, opt, s };
      }
      const nm = this.genId();
      if (!target && this.isOp('=')) {
        const fields = [];
        this.next();
        fields.push({ name: nm, e: this.expr() });
        while (this.accept(',')) {
          const n2 = this.genId();
          this.expect('=');
          fields.push({ name: n2, e: this.expr() });
        }
        this.expect(']');
        return { k: 'record', fields, s };
      }
      this.expect(']');
      const opt = this.accept('?');
      return { k: 'field', target, name: nm, opt, s };
    }

    primary() {
      const t = this.tok;
      if (t.t === 'num') { this.next(); return { k: 'lit', v: t.v, s: t.s }; }
      if (t.t === 'str') { this.next(); return { k: 'lit', v: t.v, s: t.s }; }
      if (t.t === 'kw') {
        if (t.v === 'null') { this.next(); return { k: 'lit', v: null, s: t.s }; }
        if (t.v === 'true') { this.next(); return { k: 'lit', v: true, s: t.s }; }
        if (t.v === 'false') { this.next(); return { k: 'lit', v: false, s: t.s }; }
        if (['let', 'if', 'each', 'try', 'error'].includes(t.v)) return this.expr();
      }
      if (t.t === 'id') { this.next(); return { k: 'id', name: t.v, s: t.s }; }
      if (this.isOp('@')) { this.next(); const nt = this.tok; return { k: 'id', name: this.name(), s: nt.s }; }
      if (this.isOp('(')) {
        const f = this.tryFunction();
        if (f) return f;
        this.next();
        const e = this.expr();
        this.expect(')');
        return e;
      }
      if (this.isOp('[')) return this.bracket(null);
      if (this.isOp('{')) {
        this.next();
        const items = [];
        if (!this.isOp('}')) {
          for (;;) {
            const a = this.expr();
            if (this.accept('..')) items.push({ from: a, to: this.expr() });
            else items.push({ e: a });
            if (this.accept(',')) continue;
            break;
          }
        }
        this.expect('}');
        return { k: 'list', items, s: t.s };
      }
      if (this.isOp('...')) { this.next(); return { k: 'notimpl', s: t.s }; }
      this.fail('Unexpected ' + this.describe(t));
    }

    parseType() {
      const t = this.tok;
      if (t.t === 'id' && t.v === 'nullable') { this.next(); return { k: 'tnullable', inner: this.parseType() }; }
      if (t.t === 'id' && t.v === 'table' && this.isOp('[', this.peek())) { this.next(); return { k: 'ttable', fields: this.recordTypeFields() }; }
      if (t.t === 'id' && t.v === 'table' && this.peek().t === 'id' && !this.isKw('as', this.peek())) {
        this.next();
        return { k: 'ttable', fromType: this.parseType() };
      }
      if (t.t === 'id' && t.v === 'function' && this.isOp('(', this.peek())) {
        this.next();
        this.expect('(');
        let depth = 1;
        while (depth > 0 && this.tok.t !== 'eof') {
          if (this.isOp('(')) depth++;
          if (this.isOp(')')) depth--;
          this.next();
        }
        if (this.acceptKw('as')) this.parseType();
        return { k: 'tprim', name: 'function' };
      }
      if (this.isOp('[')) return { k: 'trecord', fields: this.recordTypeFields() };
      if (this.isOp('{')) { this.next(); const item = this.parseType(); this.expect('}'); return { k: 'tlist', item }; }
      if ((t.t === 'id' || t.t === 'kw') && PRIMS.has(t.v)) { this.next(); return { k: 'tprim', name: t.v }; }
      if (this.isOp('(')) { this.next(); const inner = this.parseType(); this.expect(')'); return inner; }
      return { k: 'texpr', e: this.postfix(this.primary()) };
    }

    recordTypeFields() {
      this.expect('[');
      const fields = [];
      let open = false;
      if (!this.isOp(']')) {
        for (;;) {
          if (this.accept('...')) { open = true; break; }
          let optional = false;
          if (this.tok.t === 'id' && this.tok.v === 'optional' && this.peek().t !== 'op') { this.next(); optional = true; }
          const nm = this.genId();
          let type = { k: 'tprim', name: 'any' };
          if (this.accept('=')) type = this.parseType();
          fields.push({ name: nm, type, optional });
          if (this.accept(',')) continue;
          break;
        }
      }
      this.expect(']');
      fields.open = open;
      return fields;
    }
  }

  function parse(src) {
    return new Parser(src).parseDocument();
  }

  function splitSection(src) {
    const toks = lex(src);
    let p = 0;
    const res = { name: 'Section1', members: [], headerEnd: 0 };
    if (toks[0] && toks[0].t === 'kw' && toks[0].v === 'section') {
      p = 1;
      if (toks[p].t === 'id') { res.name = toks[p].v; p++; }
      if (toks[p].t === 'op' && toks[p].v === ';') { res.headerEnd = toks[p].e; p++; }
    }
    while (toks[p].t !== 'eof') {
      const memberStart = toks[p].s;
      if (toks[p].t === 'op' && toks[p].v === '[') {
        let depth = 0;
        do {
          if (toks[p].t === 'op' && toks[p].v === '[') depth++;
          if (toks[p].t === 'op' && toks[p].v === ']') depth--;
          p++;
        } while (depth > 0 && toks[p].t !== 'eof');
      }
      let shared = false;
      if (toks[p].t === 'kw' && toks[p].v === 'shared') { shared = true; p++; }
      const nt = toks[p];
      if (nt.t !== 'id') throw new SyntaxErr('Expected a query name', nt.s);
      p++;
      if (!(toks[p].t === 'op' && toks[p].v === '=')) throw new SyntaxErr('Expected “=” after query name', toks[p].s);
      p++;
      const exprStartTok = p;
      let depth = 0;
      while (toks[p].t !== 'eof') {
        const t = toks[p];
        if (t.t === 'op' && (t.v === '(' || t.v === '[' || t.v === '{')) depth++;
        if (t.t === 'op' && (t.v === ')' || t.v === ']' || t.v === '}')) depth--;
        if (t.t === 'op' && t.v === ';' && depth <= 0) break;
        p++;
      }
      const lastTok = toks[p - 1];
      const exprStart = toks[exprStartTok].s;
      const exprEnd = p > exprStartTok ? lastTok.e : exprStart;
      let leadEnd = exprStart;
      res.members.push({
        name: nt.v,
        quoted: !!nt.quoted,
        shared,
        memberStart,
        nameStart: nt.s,
        nameEnd: nt.e,
        exprStart: leadEnd,
        exprEnd,
        endPos: toks[p].t === 'eof' ? src.length : toks[p].e,
        text: src.slice(exprStart, exprEnd)
      });
      if (toks[p].t === 'op' && toks[p].v === ';') p++;
    }
    return res;
  }

  function quoteName(name) {
    if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name) && !KEYWORDS.has(name)) return name;
    return '#"' + name.replace(/"/g, '""') + '"';
  }

  M.lex = lex;
  M.parse = parse;
  M.Parser = Parser;
  M.SyntaxErr = SyntaxErr;
  M.lineCol = lineCol;
  M.splitSection = splitSection;
  M.quoteName = quoteName;
  M.KEYWORDS = KEYWORDS;
})();
