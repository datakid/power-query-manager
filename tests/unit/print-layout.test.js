import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, bandColumns, pageGeometry, PAPERS } from '../../src/core/print/layout.js';

const base = { rowHeight: 50, headerHeight: 100, pageHeight: 2000, titleHeight: 100, pageFooterHeight: 100, repeatTop: 0, repeatBottom: 0 };
const per = (o) => paginate({ rowCount: 0, ...base, ...o }).rowsPerPage;

test('T-P-01: fit mode computes whole rows from the available height', () => {
  const r = paginate({ rowCount: 100, ...base });
  assert.equal(r.mode, 'fit');
  assert.equal(r.available, 2000 - 100 - 100 - 100);
  assert.equal(r.rowsPerPage, 34);
  assert.equal(r.pageCount, 3);
});

test('T-P-01: the boundary cases 0, 1, per-1, per, per+1 and 10,000 rows', () => {
  const p = per({});
  const counts = (n) => paginate({ rowCount: n, ...base }).pages.map((x) => x.rows);
  assert.deepEqual(counts(0), [0]);
  assert.deepEqual(counts(1), [1]);
  assert.deepEqual(counts(p - 1), [p - 1]);
  assert.deepEqual(counts(p), [p]);
  assert.deepEqual(counts(p + 1), [p, 1]);
  const big = paginate({ rowCount: 10000, ...base });
  assert.equal(big.pages.reduce((a, x) => a + x.rows, 0), 10000);
  assert.equal(big.pageCount, Math.ceil(10000 / p));
  assert.equal(big.pages[big.pageCount - 1].lastRow, 9999);
});

test('T-P-01: pages are contiguous, never padded and the last one is short', () => {
  const r = paginate({ rowCount: 77, ...base, rowsPerPage: 25 });
  assert.deepEqual(r.pages.map((x) => [x.firstRow, x.lastRow, x.rows]), [[0, 24, 25], [25, 49, 25], [50, 74, 25], [75, 76, 2]]);
  assert.deepEqual(r.pages.map((x) => x.number), [1, 2, 3, 4]);
});

test('T-P-01: a number given by the user wins and marks the mode as fixed', () => {
  const r = paginate({ rowCount: 1000, ...base, rowsPerPage: 25 });
  assert.equal(r.mode, 'fixed');
  assert.equal(r.pageCount, 40);
  assert.equal(r.pages[6].firstRow, 150);
  assert.equal(r.tooSmall, false);
});

test('T-P-01: repeated rows come out of the row budget and are echoed on every page', () => {
  const r = paginate({ rowCount: 100, ...base, repeatTop: 2, repeatBottom: 1 });
  assert.equal(r.rowsPerPage, 34 - 3);
  assert.ok(r.pages.every((p) => p.repeatTop === 2 && p.repeatBottom === 1));
});

test('T-P-01: a page too small for one row clamps to one row and reports it', () => {
  const r = paginate({ rowCount: 3, ...base, pageHeight: 200 });
  assert.equal(r.rowsPerPage, 1);
  assert.equal(r.tooSmall, true);
  assert.equal(r.pageCount, 3);
});

test('T-P-01: row counts are whole numbers and zero rows still print one page', () => {
  const r = paginate({ rowCount: 0, ...base });
  assert.equal(r.pageCount, 1);
  assert.deepEqual(r.pages[0], { index: 0, number: 1, firstRow: 0, lastRow: -1, rows: 0, repeatTop: 0, repeatBottom: 0 });
  const odd = paginate({ rowCount: 10, ...base, rowHeight: 33.7 });
  assert.ok(Number.isInteger(odd.rowsPerPage));
});

test('T-P-05: the repeated-row budget changes the page count by the right amount', () => {
  const none = paginate({ rowCount: 1000, ...base });
  const top = paginate({ rowCount: 1000, ...base, repeatTop: 5, repeatBottom: 5 });
  assert.equal(none.rowsPerPage - top.rowsPerPage, 10);
  assert.ok(top.pageCount >= none.pageCount);
});

test('page geometry swaps for landscape and subtracts margins', () => {
  const p = pageGeometry({ paper: 'a4', orientation: 'portrait', margins: 'normal' });
  assert.deepEqual([p.width, p.height], [PAPERS.a4.w, PAPERS.a4.h]);
  const l = pageGeometry({ paper: 'a4', orientation: 'landscape', margins: 'narrow' });
  assert.deepEqual([l.width, l.height], [PAPERS.a4.h, PAPERS.a4.w]);
  assert.equal(l.usableWidth, 2970 - 120);
  assert.equal(pageGeometry({ paper: 'nope', orientation: 'x', margins: 'nope' }).width, 2100);
});

const cols = (...w) => w.map((width, i) => ({ name: `c${i}`, width }));

test('T-P-02: zero columns gives one band with only the index column', () => {
  const b = bandColumns({ columns: [], pageWidth: 1000, indexWidth: 100 });
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].columns, []);
});

test('T-P-02: everything that fits stays in one band', () => {
  const b = bandColumns({ columns: cols(200, 200, 200), pageWidth: 1000, indexWidth: 100 });
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].columns, [0, 1, 2]);
  assert.equal(b[0].width, 700);
});

test('T-P-02: an exact fit stays together and one unit more splits', () => {
  assert.equal(bandColumns({ columns: cols(300, 300, 300), pageWidth: 1000, indexWidth: 100 }).length, 1);
  assert.equal(bandColumns({ columns: cols(300, 300, 301), pageWidth: 1000, indexWidth: 100 }).length, 2);
});

test('T-P-02: sticky columns repeat in every band and order follows the columns', () => {
  const b = bandColumns({ columns: cols(150, 300, 300, 300, 300), pageWidth: 1000, indexWidth: 100, stickyCount: 1 });
  assert.deepEqual(b.map((x) => x.columns), [[0, 1, 2], [0, 3, 4]]);
  assert.deepEqual(b.map((x) => x.own), [[1, 2], [3, 4]]);
});

test('T-P-02: a column wider than the page gets a band of its own and is marked', () => {
  const b = bandColumns({ columns: cols(200, 5000, 200), pageWidth: 1000, indexWidth: 100 });
  assert.deepEqual(b.map((x) => x.own), [[0], [1], [2]]);
  assert.deepEqual(b.map((x) => x.overflow), [false, true, false]);
});

test('T-P-02: more sticky columns than the page can hold are dropped instead of printing nothing', () => {
  const b = bandColumns({ columns: cols(600, 600, 100), pageWidth: 1000, indexWidth: 100, stickyCount: 2 });
  assert.ok(b.every((x) => x.own.length >= 1));
  assert.equal(b.flatMap((x) => x.own).length, 3);
  const all = bandColumns({ columns: cols(100, 100), pageWidth: 1000, indexWidth: 100, stickyCount: 9 });
  assert.equal(all.length, 1);
});

test('T-P-02: the minimum column width is applied and no column is ever split', () => {
  const b = bandColumns({ columns: cols(10, 10, 10), pageWidth: 400, indexWidth: 100, minColumnWidth: 150 });
  assert.deepEqual(b.map((x) => x.own), [[0, 1], [2]]);
  const seen = b.flatMap((x) => x.own);
  assert.deepEqual(seen, [0, 1, 2]);
});
