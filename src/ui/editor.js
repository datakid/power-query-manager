import { h, clear } from './dom.js';
import { highlightLines, matchBracket, splitLinesWithOffsets } from './highlight.js';
import { S } from './strings.js';

const OVERSCAN = 30;

function compose(text, pieces, decos) {
  const marks = new Set([0, text.length]);
  for (const p of [...pieces, ...decos]) {
    marks.add(Math.max(0, Math.min(p.start, text.length)));
    marks.add(Math.max(0, Math.min(p.end, text.length)));
  }
  const cuts = [...marks].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (a === b) continue;
    const classes = [];
    for (const p of pieces) if (p.start <= a && p.end >= b) classes.push(p.cls);
    for (const d of decos) if (d.start <= a && d.end >= b) classes.push(d.cls);
    out.push({ text: text.slice(a, b), cls: classes.join(' ') });
  }
  return out;
}

export class Editor {
  constructor(host, { language = 'm', label = '', readOnly = false, onChange = null, forceFallbackUndo = false } = {}) {
    this.language = language;
    this.onChange = onChange;
    this.error = null;
    this.findState = { open: false, query: '', matchCase: false, matches: [], current: -1 };
    this.fallback = forceFallbackUndo || typeof document.execCommand !== 'function';
    this.forceFallback = forceFallbackUndo;
    this.history = [];
    this.future = [];
    this.lines = [];
    this.offsets = [];
    this.bracket = null;
    this.gutterInner = h('div');
    this.gutter = h('div', { class: 'gutter', 'aria-hidden': 'true' }, this.gutterInner);
    this.code = h('code');
    this.pre = h('pre', { 'aria-hidden': 'true' }, this.code);
    this.textarea = h('textarea', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': label, 'aria-multiline': 'true' });
    this.textarea.readOnly = readOnly;
    this.tooltip = null;
    this.findbar = this.buildFindbar();
    this.area = h('div', { class: 'code-area' }, this.pre, this.textarea, this.findbar);
    this.root = h('div', { class: 'editor-wrap' }, this.gutter, this.area);
    host.append(this.root);
    this.errorDesc = h('div', { class: 'sr-only', id: `err-${Math.random().toString(36).slice(2)}` });
    this.root.append(this.errorDesc);
    this.bind();
    this.measure();
  }

  buildFindbar() {
    this.findInput = h('input', { type: 'text', 'aria-label': S.find, autocomplete: 'off' });
    this.findCount = h('span', { class: 'item-meta', 'aria-live': 'polite' });
    this.matchCaseBox = h('input', { type: 'checkbox', id: `mc-${Math.random().toString(36).slice(2)}` });
    const bar = h(
      'div',
      { class: 'findbar', hidden: true, role: 'search' },
      this.findInput,
      h('button', { class: 'btn', type: 'button', 'aria-label': S.findPrev, onclick: () => this.stepFind(-1) }, '↑'),
      h('button', { class: 'btn', type: 'button', 'aria-label': S.findNext, onclick: () => this.stepFind(1) }, '↓'),
      h('label', { class: 'check', for: this.matchCaseBox.id }, this.matchCaseBox, S.matchCase),
      this.findCount
    );
    this.findInput.addEventListener('input', () => {
      this.findState.query = this.findInput.value;
      this.recomputeFind(true);
    });
    this.matchCaseBox.addEventListener('change', () => {
      this.findState.matchCase = this.matchCaseBox.checked;
      this.recomputeFind(true);
    });
    this.findInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.stepFind(ev.shiftKey ? -1 : 1);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        this.closeFind();
      }
    });
    return bar;
  }

  measure() {
    const cs = getComputedStyle(this.textarea);
    const lh = parseFloat(cs.lineHeight);
    this.lineHeight = Number.isFinite(lh) && lh > 0 ? lh : 22;
    this.padTop = parseFloat(cs.paddingTop) || 12;
    this.padLeft = parseFloat(cs.paddingLeft) || 16;
    const probe = h('span', null, 'M'.repeat(10));
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    this.area.append(probe);
    this.charWidth = probe.getBoundingClientRect().width / 10 || 8;
    probe.remove();
  }

  bind() {
    const ta = this.textarea;
    ta.addEventListener('input', () => {
      if (this.fallback) this.pushHistory();
      this.afterEdit();
    });
    ta.addEventListener('scroll', () => this.paint());
    ta.addEventListener('keydown', (ev) => this.onKey(ev));
    ta.addEventListener('keyup', () => this.updateBracket());
    ta.addEventListener('click', () => this.updateBracket());
    ta.addEventListener('mousemove', (ev) => this.onHover(ev));
    ta.addEventListener('mouseleave', () => this.hideTooltip());
    new ResizeObserver(() => this.paint()).observe(this.area);
  }

  pushHistory() {
    const ta = this.textarea;
    const last = this.history[this.history.length - 1];
    const snap = { value: ta.value, start: ta.selectionStart, end: ta.selectionEnd };
    if (!last || last.value !== snap.value) this.history.push(snap);
    if (this.history.length > 500) this.history.shift();
    this.future = [];
  }

  restore(snap) {
    this.textarea.value = snap.value;
    this.textarea.setSelectionRange(snap.start, snap.end);
    this.afterEdit();
  }

  undoFallback() {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop());
    this.restore(this.history[this.history.length - 1]);
  }

  redoFallback() {
    if (!this.future.length) return;
    const snap = this.future.pop();
    this.history.push(snap);
    this.restore(snap);
  }

  insertText(text) {
    const ta = this.textarea;
    if (!this.fallback && document.execCommand('insertText', false, text)) return;
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    this.pushHistory();
    this.afterEdit();
  }

  replaceRange(start, end, text, selStart, selEnd) {
    const ta = this.textarea;
    ta.setSelectionRange(start, end);
    if (this.fallback || !document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, start, end, 'end');
      if (this.fallback) this.pushHistory();
      this.afterEdit();
    }
    ta.setSelectionRange(selStart, selEnd);
  }

  onKey(ev) {
    const ta = this.textarea;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'f') {
      ev.preventDefault();
      this.openFind();
      return;
    }
    if (this.fallback && mod && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) this.redoFallback();
      else this.undoFallback();
      return;
    }
    if (this.fallback && mod && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      this.redoFallback();
      return;
    }
    if (ta.readOnly) return;
    if (ev.key === 'Tab' && !mod && !ev.altKey) {
      ev.preventDefault();
      this.indent(ev.shiftKey);
    } else if (ev.key === 'Enter' && !mod && !ev.shiftKey) {
      ev.preventDefault();
      const before = ta.value.slice(0, ta.selectionStart);
      const lineStart = before.lastIndexOf('\n') + 1;
      const indent = /^[ \t]*/.exec(before.slice(lineStart))[0];
      this.insertText(`\n${indent}`);
    }
  }

  indent(outdent) {
    const ta = this.textarea;
    const { value, selectionStart: s, selectionEnd: e } = ta;
    const multi = value.slice(s, e).includes('\n');
    if (!multi && !outdent) {
      this.insertText('    ');
      return;
    }
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = value.indexOf('\n', e);
    if (lineEnd < 0) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    let firstDelta = 0;
    let total = 0;
    const next = lines.map((line, i) => {
      if (!outdent) {
        total += 4;
        if (i === 0) firstDelta = 4;
        return `    ${line}`;
      }
      const m = /^( {1,4}|\t)/.exec(line);
      const cut = m ? m[0].length : 0;
      total -= cut;
      if (i === 0) firstDelta = -cut;
      return line.slice(cut);
    });
    this.replaceRange(lineStart, lineEnd, next.join('\n'), Math.max(lineStart, s + firstDelta), e + total);
  }

  setText(text) {
    this.textarea.value = text;
    this.history = [{ value: text, start: 0, end: 0 }];
    this.future = [];
    this.textarea.scrollTop = 0;
    this.textarea.scrollLeft = 0;
    this.afterEdit(false);
    if (this.findState.open) this.recomputeFind(false);
  }

  getText() {
    return this.textarea.value;
  }

  setLabel(label) {
    this.textarea.setAttribute('aria-label', label);
  }

  setLanguage(language) {
    this.language = language;
    this.afterEdit(false);
  }

  setReadOnly(flag) {
    this.textarea.readOnly = flag;
  }

  focus() {
    this.textarea.focus();
  }

  setError(err) {
    this.error = err;
    this.errorDesc.textContent = err ? S.lineCol(err.message, err.line, err.col) : '';
    if (err) this.textarea.setAttribute('aria-describedby', this.errorDesc.id);
    else this.textarea.removeAttribute('aria-describedby');
    this.paint();
  }

  afterEdit(notify = true) {
    const text = this.textarea.value;
    this.offsets = splitLinesWithOffsets(text);
    this.lines = highlightLines(text, this.language);
    if (this.findState.open) this.recomputeFind(false);
    this.updateBracket(false);
    this.paint();
    if (notify && this.onChange) this.onChange(text);
  }

  updateBracket(repaint = true) {
    const ta = this.textarea;
    const next = ta.selectionStart === ta.selectionEnd ? matchBracket(ta.value, ta.selectionStart, this.language) : null;
    const same = (this.bracket || []).join() === (next || []).join();
    this.bracket = next;
    if (repaint && !same) this.paint();
  }

  decorationsFor(li) {
    const { start, end } = this.offsets[li];
    const decos = [];
    const push = (a, b, cls) => {
      const s = Math.max(a, start);
      const e = Math.min(b, end);
      if (e > s) decos.push({ start: s - start, end: e - start, cls });
      else if (a === b && a >= start && a <= end && cls === 'tok-err') decos.push({ start: Math.max(0, a - start - 1), end: a - start, cls });
    };
    if (this.error) {
      const eStart = this.error.start;
      const eEnd = Math.max(this.error.end, eStart + 1);
      push(eStart, eEnd, 'tok-err');
    }
    if (this.bracket) for (const b of this.bracket) push(b, b + 1, 'tok-match');
    this.findState.matches.forEach((m, i) => push(m, m + this.findState.query.length, i === this.findState.current ? 'tok-find-current' : 'tok-find'));
    return decos;
  }

  paint() {
    const ta = this.textarea;
    const total = this.offsets.length;
    const top = ta.scrollTop;
    const first = Math.max(0, Math.floor(top / this.lineHeight) - OVERSCAN);
    const last = Math.min(total - 1, Math.ceil((top + ta.clientHeight) / this.lineHeight) + OVERSCAN);
    clear(this.code);
    const text = ta.value;
    for (let li = first; li <= last; li++) {
      const { start, end } = this.offsets[li];
      const segs = compose(text.slice(start, end), this.lines[li] || [], this.decorationsFor(li));
      const row = h('span', { class: 'ln' });
      row.style.display = 'block';
      row.style.minHeight = `${this.lineHeight}px`;
      for (const s of segs) row.append(s.cls ? h('span', { class: s.cls }, s.text) : document.createTextNode(s.text));
      this.code.append(row);
    }
    this.code.style.display = 'block';
    this.code.style.transform = `translate(${this.padLeft - ta.scrollLeft}px, ${this.padTop + first * this.lineHeight - top}px)`;
    this.pre.style.padding = '0';
    clear(this.gutterInner);
    const nums = [];
    const errLine = this.error ? this.error.line - 1 : -1;
    for (let li = first; li <= last; li++) nums.push(li === errLine ? h('div', { class: 'gutter-err' }, `● ${li + 1}`) : h('div', null, String(li + 1)));
    for (const n of nums) {
      n.style.height = `${this.lineHeight}px`;
      this.gutterInner.append(n);
    }
    this.gutterInner.style.transform = `translateY(${first * this.lineHeight - top}px)`;
    const width = Math.max(2, String(total).length + 2);
    this.gutter.style.minWidth = `${width}ch`;
  }

  positionAt(ev) {
    const rect = this.textarea.getBoundingClientRect();
    const y = ev.clientY - rect.top + this.textarea.scrollTop - this.padTop;
    const x = ev.clientX - rect.left + this.textarea.scrollLeft - this.padLeft;
    const li = Math.max(0, Math.min(this.offsets.length - 1, Math.floor(y / this.lineHeight)));
    const col = Math.max(0, Math.round(x / this.charWidth - 0.5));
    return this.offsets[li].start + Math.min(col, this.offsets[li].end - this.offsets[li].start);
  }

  onHover(ev) {
    if (!this.error) {
      this.hideTooltip();
      return;
    }
    const pos = this.positionAt(ev);
    const e = this.error;
    if (pos >= e.start && pos <= Math.max(e.end, e.start + 1)) this.showTooltip(ev, S.lineCol(e.message, e.line, e.col));
    else this.hideTooltip();
  }

  showTooltip(ev, text) {
    if (!this.tooltip) {
      this.tooltip = h('div', { class: 'tooltip', role: 'tooltip' });
      document.body.append(this.tooltip);
    }
    this.tooltip.textContent = text;
    this.tooltip.style.left = `${Math.min(ev.clientX + 12, window.innerWidth - 380)}px`;
    this.tooltip.style.top = `${ev.clientY + 16}px`;
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  openFind() {
    this.findState.open = true;
    this.findbar.hidden = false;
    const sel = this.textarea.value.slice(this.textarea.selectionStart, this.textarea.selectionEnd);
    if (sel && !sel.includes('\n')) {
      this.findInput.value = sel;
      this.findState.query = sel;
    }
    this.recomputeFind(true);
    this.findInput.focus();
    this.findInput.select();
  }

  closeFind() {
    this.findState.open = false;
    this.findbar.hidden = true;
    this.findState.matches = [];
    this.findState.current = -1;
    this.paint();
    this.textarea.focus();
  }

  recomputeFind(jump) {
    const { query, matchCase } = this.findState;
    const matches = [];
    if (query) {
      const hay = matchCase ? this.textarea.value : this.textarea.value.toLowerCase();
      const needle = matchCase ? query : query.toLowerCase();
      let at = hay.indexOf(needle);
      while (at >= 0 && matches.length < 5000) {
        matches.push(at);
        at = hay.indexOf(needle, at + Math.max(1, needle.length));
      }
    }
    this.findState.matches = matches;
    this.findState.current = matches.length ? Math.min(Math.max(this.findState.current, 0), matches.length - 1) : -1;
    this.findCount.textContent = query ? (matches.length ? S.matchCount(this.findState.current + 1, matches.length) : S.noMatches) : '';
    if (jump && matches.length) this.revealMatch();
    this.paint();
  }

  stepFind(dir) {
    const n = this.findState.matches.length;
    if (!n) return;
    this.findState.current = (this.findState.current + dir + n) % n;
    this.findCount.textContent = S.matchCount(this.findState.current + 1, n);
    this.revealMatch();
    this.paint();
  }

  revealMatch() {
    const at = this.findState.matches[this.findState.current];
    if (at === undefined) return;
    const ta = this.textarea;
    const li = this.offsets.findIndex((o) => at >= o.start && at <= o.end);
    const y = li * this.lineHeight;
    if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - this.lineHeight * 2) ta.scrollTop = Math.max(0, y - ta.clientHeight / 2);
    const col = at - this.offsets[li].start;
    const x = col * this.charWidth;
    if (x < ta.scrollLeft || x > ta.scrollLeft + ta.clientWidth - 40) ta.scrollLeft = Math.max(0, x - ta.clientWidth / 2);
  }

  goto(line, col) {
    const li = Math.max(0, Math.min(this.offsets.length - 1, line - 1));
    const pos = Math.min(this.offsets[li].start + Math.max(0, col - 1), this.offsets[li].end);
    this.textarea.focus();
    this.textarea.setSelectionRange(pos, pos);
    this.textarea.scrollTop = Math.max(0, li * this.lineHeight - this.textarea.clientHeight / 2);
  }
}
