import test from 'node:test';
import assert from 'node:assert/strict';
import { typeLabel, cellDisplay } from '../../src/ui/grid.js';
import { S } from '../../src/ui/strings.js';

const PRIMITIVES = ['any', 'none', 'null', 'logical', 'number', 'time', 'date', 'datetime', 'datetimezone', 'duration', 'text', 'binary', 'type', 'list', 'record', 'table', 'function'];

test('T-B-19: typeLabel takes the four short labels from strings.js', () => {
  assert.equal(typeLabel({ type: 'text' }), S.typeText);
  assert.equal(typeLabel({ type: 'number' }), S.typeNumber);
  assert.equal(typeLabel({ type: 'logical' }), S.typeLogical);
  assert.equal(typeLabel({ type: 'number', facet: 'int64' }), S.typeInteger);
  assert.equal(typeLabel({ type: 'nullable text' }), S.typeText);
});

test('T-B-19: every other M primitive type falls through to its own name', () => {
  const labelled = new Set(['text', 'number', 'logical']);
  for (const t of PRIMITIVES) {
    if (labelled.has(t)) continue;
    assert.equal(typeLabel({ type: t }), t);
    assert.equal(typeLabel({ type: `nullable ${t}` }), t);
  }
  assert.equal(typeLabel({}), 'any');
});

test('T-B-19: cell text for booleans and line breaks comes from strings.js', () => {
  const fmt = new Intl.NumberFormat('en-US');
  assert.equal(cellDisplay(true, fmt).text, S.booleanTrue);
  assert.equal(cellDisplay(false, fmt).text, S.booleanFalse);
  assert.equal(cellDisplay('a\nb', fmt).text, `a${S.newlineGlyph}b`);
  assert.equal(cellDisplay('a\r\nb', fmt).text, `a${S.newlineGlyph}b`);
});
