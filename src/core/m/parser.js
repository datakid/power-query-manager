import { lex, significant } from './lexer.js';
import { T, MType, FACETS, nullable } from './values.js';

export class MParseError extends Error {
  constructor(message, start, end, line, col) {
    super(message);
    this.name = 'MParseError';
    this.start = start;
    this.end = end;
    this.line = line;
    this.col = col;
  }
}

const PRIMITIVES = new Set(['any', 'anynonnull', 'binary', 'date', 'datetime', 'datetimezone', 'duration', 'function', 'list', 'logical', 'none', 'number', 'record', 'table', 'text', 'time']);
const RELATIONAL = new Set(['<', '>', '<=', '>=']);
const NAME_TOKEN = new Set(['ident', 'keyword', 'number', 'qident']);

export function parseExpressionText(text, baseOffset = 0, fullText = null) {
  const all = lex(text);
  const tokens = significant(all);
  const parser = new Parser(tokens, text, baseOffset, fullText);
  return parser.parseAll();
}

class Parser {
  constructor(tokens, text, baseOffset, fullText) {
    this.tokens = tokens;
    this.text = text;
    this.pos = 0;
    this.base = baseOffset;
    this.full = fullText;
  }

  get tok() {
    return this.tokens[this.pos];
  }

  peek(n = 1) {
    return this.tokens[this.pos + n];
  }

  isOp(v, t = this.tok) {
    return !!t && t.kind === 'op' && t.value === v;
  }

  isKw(v, t = this.tok) {
    return !!t && t.kind === 'keyword' && t.value === v;
  }

  isIdent(v, t = this.tok) {
    return !!t && t.kind === 'ident' && t.value === v;
  }

  fail(message, t = this.tok) {
    const token = t || this.tokens[this.tokens.length - 1];
    let start = token ? token.start : this.text.length;
    let end = token ? token.end : this.text.length;
    if (!t && this.pos >= this.tokens.length) {
      start = this.text.length;
      end = this.text.length;
    }
    const abs = start + this.base;
    const source = this.full || this.text;
    const before = source.slice(0, abs);
    const line = (before.match(/\r\n|[\r\n\u2028\u2029\u0085]/g) || []).length + 1;
    const lastBreak = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
    const col = abs - (lastBreak + 1) + 1;
    throw new MParseError(message, abs, end + this.base, line, col);
  }

  expectOp(v, message) {
    if (!this.isOp(v)) this.fail(message || `Expected "${v}".`);
    return this.tokens[this.pos++];
  }

  expectKw(v, message) {
    if (!this.isKw(v)) this.fail(message || `Expected "${v}".`);
    return this.tokens[this.pos++];
  }

  node(t, props, start) {
    const prev = this.tokens[this.pos - 1];
    return { t, start: start + this.base, end: (prev ? prev.end : start) + this.base, ...props };
  }

  parseAll() {
    if (!this.tokens.length) this.fail('Expected an expression.', null);
    for (const tk of this.tokens) {
      if (tk.kind === 'error') {
        const what = tk.unterminated === 'string' ? 'The text literal is not closed.' : tk.unterminated === 'comment' ? 'The comment is not closed.' : tk.unterminated === 'identifier' ? 'The quoted identifier is not closed.' : `Unexpected character "${tk.value[0]}".`;
        this.fail(what, tk);
      }
    }
    const e = this.parseExpression();
    if (this.pos < this.tokens.length) this.fail(`Unexpected "${this.tok.kind === 'string' ? '"…"' : this.tok.raw || this.tok.value}".`);
    return e;
  }

  parseExpression() {
    const t = this.tok;
    if (!t) this.fail('Expected an expression.', null);
    if (t.kind === 'keyword') {
      if (t.value === 'each') return this.parseEach();
      if (t.value === 'let') return this.parseLet();
      if (t.value === 'if') return this.parseIf();
      if (t.value === 'error') return this.parseErrorExpr();
      if (t.value === 'try') return this.parseTry();
    }
    if (this.isOp('(')) {
      const fn = this.tryParseFunction();
      if (fn) return fn;
    }
    return this.parseOr();
  }

  parseEach() {
    const start = this.tok.start;
    this.pos++;
    const body = this.parseExpression();
    return this.node('Each', { body }, start);
  }

  parseLet() {
    const start = this.tok.start;
    this.pos++;
    const bindings = [];
    for (;;) {
      const t = this.tok;
      if (!t || (t.kind !== 'ident' && t.kind !== 'qident' && !(t.kind === 'keyword' && this.isOp('=', this.peek())))) {
        this.fail(bindings.length ? 'Expected a variable name.' : 'Expected a variable name after "let".');
      }
      this.pos++;
      this.expectOp('=', `Expected "=" after ${t.kind === 'qident' ? `#"${t.value}"` : t.value}.`);
      const expr = this.parseExpression();
      bindings.push({ name: t.value, expr, start: t.start + this.base });
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      break;
    }
    if (!this.isKw('in')) this.fail('Expected "in" after let bindings.');
    this.pos++;
    const body = this.parseExpression();
    return this.node('Let', { bindings, body }, start);
  }

  parseIf() {
    const start = this.tok.start;
    this.pos++;
    const cond = this.parseExpression();
    this.expectKw('then', 'Expected "then" after the if condition.');
    const yes = this.parseExpression();
    this.expectKw('else', 'Expected "else" after the then branch.');
    const no = this.parseExpression();
    return this.node('If', { cond, yes, no }, start);
  }

  parseErrorExpr() {
    const start = this.tok.start;
    this.pos++;
    const expr = this.parseExpression();
    return this.node('ErrorRaise', { expr }, start);
  }

  parseTry() {
    const start = this.tok.start;
    this.pos++;
    const body = this.parseExpression();
    let otherwise = null;
    let handler = null;
    if (this.isKw('otherwise')) {
      this.pos++;
      otherwise = this.parseExpression();
    } else if (this.isKw('catch')) {
      this.pos++;
      handler = this.parseExpression();
    }
    return this.node('Try', { body, otherwise, handler }, start);
  }

  tryParseFunction() {
    const save = this.pos;
    const start = this.tok.start;
    try {
      this.pos++;
      const params = [];
      if (!this.isOp(')')) {
        for (;;) {
          let optional = false;
          if (this.isIdent('optional')) {
            optional = true;
            this.pos++;
          }
          const nt = this.tok;
          if (!nt || (nt.kind !== 'ident' && nt.kind !== 'qident')) throw new Error('not a function');
          this.pos++;
          let type = null;
          if (this.isKw('as')) {
            this.pos++;
            type = this.parseNullablePrimitive();
          }
          params.push({ name: nt.value, optional, type });
          if (this.isOp(',')) {
            this.pos++;
            continue;
          }
          break;
        }
      }
      if (!this.isOp(')')) throw new Error('not a function');
      this.pos++;
      let returnType = null;
      if (this.isKw('as')) {
        this.pos++;
        returnType = this.parseNullablePrimitive();
      }
      if (!this.isOp('=>')) throw new Error('not a function');
      this.pos++;
    } catch (e) {
      if (e instanceof MParseError || e.message === 'not a function') {
        this.pos = save;
        return null;
      }
      throw e;
    }
    const callParams = [];
    const savedPos = this.pos;
    this.pos = save + 1;
    if (!this.isOp(')')) {
      for (;;) {
        let optional = false;
        if (this.isIdent('optional')) {
          optional = true;
          this.pos++;
        }
        const nt = this.tok;
        this.pos++;
        let type = null;
        if (this.isKw('as')) {
          this.pos++;
          type = this.parseNullablePrimitive();
        }
        callParams.push({ name: nt.value, optional, type });
        if (this.isOp(',')) {
          this.pos++;
          continue;
        }
        break;
      }
    }
    this.pos++;
    let returnType = null;
    if (this.isKw('as')) {
      this.pos++;
      returnType = this.parseNullablePrimitive();
    }
    this.pos = savedPos;
    const body = this.parseExpression();
    return this.node('Function', { params: callParams, returnType, body }, start);
  }

  parseNullablePrimitive() {
    const t = this.tok;
    if (!t) this.fail('Expected a type.', null);
    if (this.isIdent('nullable')) {
      this.pos++;
      return nullable(this.parsePrimitiveType());
    }
    return this.parsePrimitiveType();
  }

  parsePrimitiveType() {
    const t = this.tok;
    if (!t) this.fail('Expected a type.', null);
    if (t.kind === 'ident' && PRIMITIVES.has(t.value)) {
      this.pos++;
      const base = T[t.value];
      return base;
    }
    if (this.isKw('null')) {
      this.pos++;
      return T.null;
    }
    if (this.isKw('type')) {
      this.pos++;
      return T.type;
    }
    this.fail('Expected a type name.');
    return null;
  }

  parseOr() {
    let l = this.parseAnd();
    while (this.isKw('or')) {
      const s = l.start - this.base;
      this.pos++;
      const r = this.parseAnd();
      l = this.node('Binary', { op: 'or', l, r }, s);
    }
    return l;
  }

  parseAnd() {
    let l = this.parseIs();
    while (this.isKw('and')) {
      const s = l.start - this.base;
      this.pos++;
      const r = this.parseIs();
      l = this.node('Binary', { op: 'and', l, r }, s);
    }
    return l;
  }

  parseIs() {
    let l = this.parseAs();
    while (this.isKw('is')) {
      const s = l.start - this.base;
      this.pos++;
      const type = this.parseNullablePrimitive();
      l = this.node('Is', { expr: l, type }, s);
    }
    return l;
  }

  parseAs() {
    let l = this.parseEquality();
    while (this.isKw('as')) {
      const s = l.start - this.base;
      this.pos++;
      const type = this.parseNullablePrimitive();
      l = this.node('As', { expr: l, type }, s);
    }
    return l;
  }

  parseEquality() {
    let l = this.parseRelational();
    while (this.isOp('=') || this.isOp('<>')) {
      const s = l.start - this.base;
      const op = this.tok.value;
      this.pos++;
      const r = this.parseRelational();
      l = this.node('Binary', { op, l, r }, s);
    }
    return l;
  }

  parseRelational() {
    let l = this.parseAdditive();
    while (this.tok && this.tok.kind === 'op' && RELATIONAL.has(this.tok.value)) {
      const s = l.start - this.base;
      const op = this.tok.value;
      this.pos++;
      const r = this.parseAdditive();
      l = this.node('Binary', { op, l, r }, s);
    }
    return l;
  }

  parseAdditive() {
    let l = this.parseMultiplicative();
    while (this.isOp('+') || this.isOp('-') || this.isOp('&')) {
      const s = l.start - this.base;
      const op = this.tok.value;
      this.pos++;
      const r = this.parseMultiplicative();
      l = this.node('Binary', { op, l, r }, s);
    }
    return l;
  }

  parseMultiplicative() {
    let l = this.parseMeta();
    while (this.isOp('*') || this.isOp('/')) {
      const s = l.start - this.base;
      const op = this.tok.value;
      this.pos++;
      const r = this.parseMeta();
      l = this.node('Binary', { op, l, r }, s);
    }
    return l;
  }

  parseMeta() {
    let l = this.parseUnary();
    while (this.isKw('meta')) {
      const s = l.start - this.base;
      this.pos++;
      const r = this.parseUnary();
      l = this.node('Meta', { l, r }, s);
    }
    return l;
  }

  parseUnary() {
    const t = this.tok;
    if (!t) this.fail('Expected an expression.', null);
    if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
      this.pos++;
      const e = this.parseUnary();
      return this.node('Unary', { op: t.value, expr: e }, t.start);
    }
    if (t.kind === 'keyword' && t.value === 'not') {
      this.pos++;
      const e = this.parseUnary();
      return this.node('Unary', { op: 'not', expr: e }, t.start);
    }
    if (t.kind === 'keyword' && t.value === 'type') {
      this.pos++;
      const spec = this.parseTypeSpec();
      return this.node('TypeExpr', { spec }, t.start);
    }
    return this.parsePostfix();
  }

  parseTypeSpec() {
    const t = this.tok;
    if (!t) this.fail('Expected a type.', null);
    if (this.isIdent('nullable')) {
      this.pos++;
      const inner = this.parseTypeSpec();
      return { tk: 'nullable', inner };
    }
    if (this.isOp('{')) {
      this.pos++;
      const item = this.parseTypeSpec();
      this.expectOp('}', 'Expected "}" to close the list type.');
      return { tk: 'list', item };
    }
    if (this.isOp('[')) return this.parseRecordTypeSpec('record');
    if (this.isIdent('table') && this.isOp('[', this.peek())) {
      this.pos++;
      return this.parseRecordTypeSpec('table');
    }
    if (this.isIdent('function') && this.isOp('(', this.peek())) {
      this.pos++;
      this.pos++;
      const params = [];
      if (!this.isOp(')')) {
        for (;;) {
          let optional = false;
          if (this.isIdent('optional')) {
            optional = true;
            this.pos++;
          }
          const nt = this.tok;
          if (!nt || (nt.kind !== 'ident' && nt.kind !== 'qident')) this.fail('Expected a parameter name.');
          this.pos++;
          let type = T.any;
          if (this.isKw('as')) {
            this.pos++;
            type = this.parseNullablePrimitive();
          }
          params.push({ name: nt.value, optional, type });
          if (this.isOp(',')) {
            this.pos++;
            continue;
          }
          break;
        }
      }
      this.expectOp(')', 'Expected ")" to close the parameter list.');
      let ret = T.any;
      if (this.isKw('as')) {
        this.pos++;
        ret = this.parseNullablePrimitive();
      }
      return { tk: 'function', params, ret };
    }
    if ((t.kind === 'ident' && PRIMITIVES.has(t.value)) || this.isKw('null') || this.isKw('type')) return { tk: 'type', type: this.parsePrimitiveType() };
    const expr = this.parsePostfix();
    return { tk: 'expr', expr };
  }

  parseRecordTypeSpec(kind) {
    this.expectOp('[');
    const fields = [];
    let open = false;
    while (!this.isOp(']')) {
      if (this.isOp('...')) {
        this.pos++;
        open = true;
        break;
      }
      let optional = false;
      if (this.isIdent('optional')) {
        optional = true;
        this.pos++;
      }
      const name = this.parseGeneralizedName('=');
      let type = { tk: 'type', type: T.any };
      if (this.isOp('=')) {
        this.pos++;
        type = this.parseTypeSpec();
      }
      fields.push({ name, optional, type });
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      break;
    }
    this.expectOp(']', 'Expected "]" to close the type.');
    return { tk: kind, fields, open };
  }

  parseGeneralizedName(stop) {
    const first = this.tok;
    if (!first || !NAME_TOKEN.has(first.kind)) this.fail('Expected a field name.');
    const parts = [];
    while (this.tok && NAME_TOKEN.has(this.tok.kind)) {
      parts.push(this.tok);
      this.pos++;
    }
    if (parts.length === 1 && parts[0].kind === 'qident') return parts[0].value;
    if (parts.some((p) => p.kind === 'qident')) this.fail('A quoted field name cannot be combined with other words.', parts[0]);
    const last = parts[parts.length - 1];
    void stop;
    return this.text.slice(parts[0].start, last.end);
  }

  looksLikeFieldSelector() {
    let i = this.pos + 1;
    let seen = false;
    while (this.tokens[i] && NAME_TOKEN.has(this.tokens[i].kind)) {
      i++;
      seen = true;
    }
    return seen && this.isOp(']', this.tokens[i]);
  }

  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.tok;
      if (!t) break;
      const s = e.start - this.base;
      if (this.isOp('(')) {
        this.pos++;
        const args = [];
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.parseExpression());
            if (this.isOp(',')) {
              this.pos++;
              continue;
            }
            break;
          }
        }
        if (!this.isOp(')')) this.fail('Expected ")" to close the argument list.');
        this.pos++;
        e = this.node('Invoke', { fn: e, args }, s);
      } else if (this.isOp('{')) {
        this.pos++;
        const index = this.parseExpression();
        this.expectOp('}', 'Expected "}" to close the item access.');
        let optional = false;
        if (this.isOp('?')) {
          this.pos++;
          optional = true;
        }
        e = this.node('Item', { target: e, index, optional }, s);
      } else if (this.isOp('[')) {
        e = this.parseFieldSelector(e, s);
      } else break;
    }
    return e;
  }

  parseFieldSelector(target, s) {
    this.expectOp('[');
    if (this.isOp('[')) {
      this.pos--;
      const names = [];
      this.pos++;
      for (;;) {
        this.expectOp('[', 'Expected "[" in the field list.');
        names.push(this.parseGeneralizedName(']'));
        this.expectOp(']', 'Expected "]" after the field name.');
        if (this.isOp(',')) {
          this.pos++;
          continue;
        }
        break;
      }
      this.expectOp(']', 'Expected "]" to close the field list.');
      let optional = false;
      if (this.isOp('?')) {
        this.pos++;
        optional = true;
      }
      return this.node('Project', { target, names, optional }, s);
    }
    const name = this.parseGeneralizedName(']');
    this.expectOp(']', 'Expected "]" after the field name.');
    let optional = false;
    if (this.isOp('?')) {
      this.pos++;
      optional = true;
    }
    return this.node('Field', { target, name, optional }, s);
  }

  parsePrimary() {
    const t = this.tok;
    if (!t) this.fail('Expected an expression.', null);
    const start = t.start;
    switch (t.kind) {
      case 'number':
        this.pos++;
        return this.node('Literal', { value: t.value, vtype: 'number' }, start);
      case 'string':
        this.pos++;
        return this.node('Literal', { value: t.value, vtype: 'text' }, start);
      case 'ident':
      case 'qident': {
        this.pos++;
        if (this.isOp('!') && this.peek() && (this.peek().kind === 'ident' || this.peek().kind === 'qident')) {
          this.pos++;
          const member = this.tok;
          this.pos++;
          return this.node('SectionAccess', { section: t.value, name: member.value }, start);
        }
        return this.node('Identifier', { name: t.value, inclusive: false }, start);
      }
      case 'keyword':
        return this.parseKeywordPrimary(t);
      case 'op':
        return this.parseOpPrimary(t);
      default:
        return this.fail(`Unexpected "${t.value}".`);
    }
  }

  parseKeywordPrimary(t) {
    const start = t.start;
    switch (t.value) {
      case 'true':
      case 'false':
        this.pos++;
        return this.node('Literal', { value: t.value === 'true', vtype: 'logical' }, start);
      case 'null':
        this.pos++;
        return this.node('Literal', { value: null, vtype: 'null' }, start);
      case '#nan':
        this.pos++;
        return this.node('Literal', { value: NaN, vtype: 'number' }, start);
      case '#infinity':
        this.pos++;
        return this.node('Literal', { value: Infinity, vtype: 'number' }, start);
      case '#binary':
      case '#date':
      case '#datetime':
      case '#datetimezone':
      case '#duration':
      case '#table':
      case '#time':
      case '#shared':
      case '#sections':
        this.pos++;
        return this.node('Identifier', { name: t.value, inclusive: false }, start);
      case 'each':
      case 'let':
      case 'if':
      case 'error':
      case 'try':
        return this.parseExpression();
      case 'type': {
        this.pos++;
        const spec = this.parseTypeSpec();
        return this.node('TypeExpr', { spec }, start);
      }
      case 'in':
      case 'then':
      case 'else':
      case 'otherwise':
      case 'catch':
        return this.fail('Expected an expression.');
      default:
        return this.fail(`Unexpected "${t.value}".`);
    }
  }

  parseOpPrimary(t) {
    const start = t.start;
    if (t.value === '(') {
      const fn = this.tryParseFunction();
      if (fn) return fn;
      this.pos++;
      const e = this.parseExpression();
      this.expectOp(')', 'Expected ")" to close the parenthesis.');
      return this.node('Paren', { expr: e }, start);
    }
    if (t.value === '@') {
      this.pos++;
      const nt = this.tok;
      if (!nt || (nt.kind !== 'ident' && nt.kind !== 'qident')) this.fail('Expected a name after "@".');
      this.pos++;
      return this.node('Identifier', { name: nt.value, inclusive: true }, start);
    }
    if (t.value === '{') return this.parseList();
    if (t.value === '[') return this.parseRecordOrImplicit();
    if (t.value === '...') {
      this.pos++;
      return this.node('NotImplemented', {}, start);
    }
    return this.fail(`Unexpected "${t.value}".`);
  }

  parseList() {
    const start = this.tok.start;
    this.pos++;
    const items = [];
    while (!this.isOp('}')) {
      const a = this.parseExpression();
      if (this.isOp('..')) {
        this.pos++;
        const b = this.parseExpression();
        items.push({ range: true, from: a, to: b });
      } else items.push({ range: false, expr: a });
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      break;
    }
    if (!this.isOp('}')) this.fail('Expected "}" to close the list.');
    this.pos++;
    return this.node('List', { items }, start);
  }

  parseRecordOrImplicit() {
    const start = this.tok.start;
    if (this.isOp('[', this.peek())) {
      const e = this.parseFieldSelector(null, start);
      return e;
    }
    if (this.looksLikeFieldSelector()) {
      const e = this.parseFieldSelector(null, start);
      return e;
    }
    this.pos++;
    const fields = [];
    while (!this.isOp(']')) {
      const fs = this.tok ? this.tok.start : start;
      const name = this.parseGeneralizedName('=');
      this.expectOp('=', `Expected "=" after the field name ${name}.`);
      const expr = this.parseExpression();
      fields.push({ name, expr, start: fs + this.base });
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      break;
    }
    if (!this.isOp(']')) this.fail('Expected "]" to close the record.');
    this.pos++;
    return this.node('Record', { fields }, start);
  }
}

export function tryParse(text) {
  try {
    return { ast: parseExpressionText(text), error: null };
  } catch (e) {
    if (e instanceof MParseError) return { ast: null, error: e };
    throw e;
  }
}

export { FACETS, MType };
