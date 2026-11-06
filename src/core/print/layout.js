export const PAPERS = {
  a4: { w: 2100, h: 2970 },
  a3: { w: 2970, h: 4200 },
  letter: { w: 2159, h: 2794 },
  legal: { w: 2159, h: 3556 },
  tabloid: { w: 2794, h: 4318 },
  executive: { w: 1842, h: 2667 }
};

export const MARGINS = {
  normal: { top: 120, right: 100, bottom: 120, left: 100 },
  narrow: { top: 60, right: 60, bottom: 60, left: 60 },
  wide: { top: 200, right: 200, bottom: 200, left: 200 }
};

export function pageGeometry({ paper, orientation, margins }) {
  const p = PAPERS[paper] || PAPERS.a4;
  const m = MARGINS[margins] || MARGINS.normal;
  const landscape = orientation === 'landscape';
  const width = landscape ? p.h : p.w;
  const height = landscape ? p.w : p.h;
  return { width, height, margin: m, usableWidth: width - m.left - m.right, usableHeight: height - m.top - m.bottom };
}

export function paginate({ rowCount, rowHeight, headerHeight = 0, footerHeight = 0, repeatTop = 0, repeatBottom = 0, pageHeight, titleHeight = 0, pageFooterHeight = 0, rowsPerPage = null }) {
  const count = Math.max(0, Math.floor(rowCount));
  const rowH = Math.max(1, Math.floor(rowHeight));
  const available = pageHeight - titleHeight - pageFooterHeight - headerHeight - footerHeight - (repeatTop + repeatBottom) * rowH;
  const fits = Math.floor(available / rowH);
  const fixed = Number.isFinite(rowsPerPage) && rowsPerPage >= 1;
  const perPage = fixed ? Math.floor(rowsPerPage) : Math.max(1, fits);
  const tooSmall = fits < 1;
  const pages = [];
  if (count === 0) pages.push({ index: 0, number: 1, firstRow: 0, lastRow: -1, rows: 0, repeatTop, repeatBottom });
  else {
    for (let first = 0, i = 0; first < count; first += perPage, i++) {
      const rows = Math.min(perPage, count - first);
      pages.push({ index: i, number: i + 1, firstRow: first, lastRow: first + rows - 1, rows, repeatTop, repeatBottom });
    }
  }
  return { pages, pageCount: pages.length, rowsPerPage: perPage, mode: fixed ? 'fixed' : 'fit', tooSmall: !fixed && tooSmall, available };
}

export function bandColumns({ columns, pageWidth, indexWidth, stickyCount = 0, minColumnWidth = 0 }) {
  const widths = columns.map((c) => Math.max(minColumnWidth, Math.floor(c.width)));
  const total = columns.length;
  let sticky = Math.max(0, Math.min(total, Math.floor(stickyCount)));
  let fixed = indexWidth + widths.slice(0, sticky).reduce((a, b) => a + b, 0);
  if (sticky > 0 && fixed + Math.max(1, minColumnWidth) > pageWidth) {
    sticky = 0;
    fixed = indexWidth;
  }
  const bands = [];
  const free = pageWidth - fixed;
  let current = null;
  const open = () => {
    current = { index: bands.length, columns: Array.from({ length: sticky }, (_, i) => i), own: [], width: fixed, overflow: false };
    bands.push(current);
  };
  if (total === 0) {
    open();
    return bands;
  }
  if (sticky === total) {
    open();
    return bands;
  }
  for (let c = sticky; c < total; c++) {
    const w = widths[c];
    if (w > free) {
      if (current && current.own.length) current = null;
      open();
      current.columns.push(c);
      current.own.push(c);
      current.width = fixed + w;
      current.overflow = true;
      current = null;
      continue;
    }
    if (!current || current.overflow || current.width + w > pageWidth) open();
    current.columns.push(c);
    current.own.push(c);
    current.width += w;
  }
  return bands;
}
