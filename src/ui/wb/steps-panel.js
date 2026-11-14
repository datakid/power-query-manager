import { h, clear } from '../dom.js';
import { S, fmt } from '../strings.js';
import { menu } from '../dialogs.js';
import { matches } from '../../app/commands.js';

const KEYS = { rename: 'F2', del: 'Delete', bypass: 'b', up: 'Alt+Shift+ArrowUp', down: 'Alt+Shift+ArrowDown', runTo: 'Mod+F10', dup: 'Mod+D' };

export class StepsPanel {
  constructor(host, actions) {
    this.actions = actions;
    this.title = h('span', { class: 'panel-title' }, S.stepsPanel.title);
    this.count = h('span', { class: 'count-pill' }, '0');
    this.runBtn = h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => actions.runSteps() }, S.stepsPanel.runSteps);
    this.head = h('div', { class: 'panel-head' }, this.title, this.count, h('span', { class: 'spacer' }), this.runBtn);
    this.list = h('ol', { class: 'steps-list', role: 'list', 'aria-label': S.stepsPanel.aria });
    this.note = h('p', { class: 'panel-note item-meta', hidden: true });
    this.live = h('div', { class: 'sr-only steps-live', 'aria-live': 'polite', 'aria-atomic': 'true' });
    host.append(this.head, this.note, this.list, this.live);
    this.model = null;
    this.results = new Map();
    this.caret = null;
    this.focusName = null;
    this.list.addEventListener('keydown', (ev) => this.onKey(ev));
  }

  announce(text) {
    this.live.textContent = '';
    this.live.textContent = text;
  }

  setResults(results) {
    this.results = results || new Map();
  }

  render(model, caretName = null) {
    this.model = model;
    this.caret = caretName;
    clear(this.list);
    const shape = model ? model.shape : 'invalid';
    this.runBtn.hidden = shape !== 'let';
    this.count.textContent = String(model && model.steps ? model.steps.length : 0);
    const note = shape === 'function' || shape === 'function-let' ? S.stepsPanel.fn : shape === 'invalid' ? S.stepsPanel.invalid : shape === 'expression' ? S.stepsPanel.notEditable : null;
    this.note.hidden = !note;
    this.note.textContent = note || '';
    if (shape !== 'let' && shape !== 'function-let') return;
    if (!model.steps.length) {
      this.note.hidden = false;
      this.note.textContent = S.stepsPanel.empty;
      return;
    }
    const editable = shape === 'let';
    let prevRows = null;
    model.steps.forEach((st, i) => {
      const r = this.results.get(st.name);
      const bead = h('span', { class: `bead bead-${r ? r.status : 'never'}`, role: 'img', 'aria-label': S.stepsPanel.status[r ? r.status : 'never'] });
      const delta = r && r.status === 'ok' && r.rowCount !== undefined ? (prevRows !== null && prevRows !== r.rowCount ? S.stepsPanel.delta(r.rowCount - prevRows) : S.stepsPanel.rows(r.rowCount)) : null;
      if (r && r.status === 'ok' && r.rowCount !== undefined) prevRows = r.rowCount;
      const warn = st.forward.length ? h('span', { class: 'step-warn', title: S.stepsPanel.forward(st.forward[0]) }, '!') : null;
      const row = h('button', { class: `step-row${st.bypassed ? ' is-bypassed' : ''}${st.name === caretName ? ' is-current' : ''}`, type: 'button', 'data-index': String(i), tabindex: st.name === (this.focusName || caretName || model.steps[0].name) ? '0' : '-1', 'aria-current': st.name === caretName ? 'true' : null, onclick: () => this.actions.go(st) },
        bead,
        h('span', { class: 'step-name' }, st.name),
        st.bypassed ? h('span', { class: 'step-tag' }, S.stepsPanel.bypassed) : null,
        h('span', { class: 'step-kind' }, S.stepKind[st.kind] || S.stepKind.custom),
        delta ? h('span', { class: 'step-delta item-meta' }, delta) : null,
        warn);
      const more = editable ? h('button', { class: 'btn btn-quiet step-more', type: 'button', 'aria-label': `${S.stepsPanel.menu} ${st.name}`, 'aria-haspopup': 'menu', onclick: (ev) => this.openMenu(ev.currentTarget, st) }, '\u22ef') : null;
      this.list.append(h('li', { class: 'step-item' }, row, more));
    });
  }

  rows() {
    return [...this.list.querySelectorAll('.step-row')];
  }

  focusStep(name) {
    this.focusName = name;
    const row = this.rows().find((r) => r.querySelector('.step-name').textContent === name);
    for (const r of this.rows()) r.tabIndex = r === row ? 0 : -1;
    if (row) row.focus();
  }

  stepAt(row) {
    return this.model.steps[Number(row.dataset.index)];
  }

  onKey(ev) {
    const row = ev.target.closest && ev.target.closest('.step-row');
    if (!row || !this.model) return;
    const st = this.stepAt(row);
    const rows = this.rows();
    const at = rows.indexOf(row);
    if (matches(ev, KEYS.up)) {
      ev.preventDefault();
      this.actions.move(st, st.index - 1);
    } else if (matches(ev, KEYS.down)) {
      ev.preventDefault();
      this.actions.move(st, st.index + 1);
    } else if (ev.key === 'ArrowDown' && !ev.altKey) {
      ev.preventDefault();
      if (rows[at + 1]) this.focusStep(this.stepAt(rows[at + 1]).name);
    } else if (ev.key === 'ArrowUp' && !ev.altKey) {
      ev.preventDefault();
      if (rows[at - 1]) this.focusStep(this.stepAt(rows[at - 1]).name);
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      this.focusStep(this.stepAt(rows[0]).name);
    } else if (ev.key === 'End') {
      ev.preventDefault();
      this.focusStep(this.stepAt(rows[rows.length - 1]).name);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      this.actions.go(st);
    } else if (matches(ev, KEYS.rename)) {
      ev.preventDefault();
      this.startRename(row, st);
    } else if (matches(ev, KEYS.del)) {
      ev.preventDefault();
      this.actions.del(st);
    } else if (ev.key.toLowerCase() === 'b' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      this.actions.bypass(st);
    } else if (matches(ev, KEYS.dup)) {
      ev.preventDefault();
      this.actions.duplicate(st);
    } else if (matches(ev, KEYS.runTo)) {
      ev.preventDefault();
      this.actions.runTo(st);
    }
  }

  startRename(row, st) {
    const input = h('input', { class: 'step-rename', type: 'text', value: st.name, 'aria-label': S.stepsPanel.renameLabel });
    row.hidden = true;
    row.after(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.remove();
      row.hidden = false;
      if (commit && value && value !== st.name) this.actions.rename(st, value);
      else row.focus();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  openMenu(anchor, st) {
    const n = this.model.steps.length;
    const entries = [
      { label: S.stepsPanel.moveUp, run: () => this.actions.move(st, st.index - 1), disabled: st.index === 0 },
      { label: S.stepsPanel.moveDown, run: () => this.actions.move(st, st.index + 1), disabled: st.index === n - 1 },
      { label: S.stepsPanel.rename, run: () => this.startRename(this.rows()[st.index], st) },
      { label: S.stepsPanel.duplicate, run: () => this.actions.duplicate(st) },
      { label: st.bypassed ? S.stepsPanel.restore : S.stepsPanel.bypass, run: () => this.actions.bypass(st), disabled: st.index === 0 },
      { label: S.stepsPanel.runTo, run: () => this.actions.runTo(st) },
      { label: S.stepsPanel.del, run: () => this.actions.del(st), disabled: n === 1 }
    ];
    menu(anchor, entries, () => anchor.focus());
  }
}

export { fmt };
