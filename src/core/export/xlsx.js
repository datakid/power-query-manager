import { writeZip } from '../zip-write.js';
import { utf8Encode } from '../bytes.js';
import { kindOf } from '../m/values.js';
import { cellValue, serialOf, exportText } from './cells.js';
import { indexToCol } from '../cells.js';
import { escapeText } from '../xml.js';
import { getCulture } from '../m/culture.js';

const MAX_ROWS = 1048576;
const MAX_COLS = 16384;

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Result" sheetId="1" r:id="rId1"/></sheets></workbook>';
const WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/><numFmt numFmtId="165" formatCode="[h]:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="21" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

const STYLE_BY_KIND = { date: 1, datetime: 2, datetimezone: 2, time: 3, duration: 4 };

function textCell(ref, text, style) {
  const s = style ? ` s="${style}"` : '';
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t${space}>${escapeText(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''))}</t></is></c>`;
}

export async function tableToXlsx(table, culture = 'en-US') {
  const c = getCulture(culture);
  const cols = Math.min(table.columns.length, MAX_COLS);
  const rows = Math.min(table.rowCount, MAX_ROWS - 1);
  const parts = [];
  parts.push(`<row r="1">${table.columns.slice(0, cols).map((n, i) => textCell(`${indexToCol(i)}1`, n, 5)).join('')}</row>`);
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let ci = 0; ci < cols; ci++) {
      const ref = `${indexToCol(ci)}${r + 2}`;
      const cv = cellValue(table.cols[ci][r]);
      if (!cv.ok) {
        cells.push(`<c r="${ref}" t="e"><v>#VALUE!</v></c>`);
        continue;
      }
      const v = cv.v;
      const k = kindOf(v);
      if (k === 'null') continue;
      if (k === 'number') {
        if (Number.isFinite(v)) cells.push(`<c r="${ref}"><v>${v}</v></c>`);
        else cells.push(`<c r="${ref}" t="e"><v>${Number.isNaN(v) ? '#NUM!' : '#NUM!'}</v></c>`);
      } else if (k === 'logical') cells.push(`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`);
      else if (STYLE_BY_KIND[k]) {
        const serial = k === 'duration' ? Number(v.ticks) / 864000000000 : serialOf(v);
        cells.push(`<c r="${ref}" s="${STYLE_BY_KIND[k]}"><v>${serial}</v></c>`);
      } else cells.push(textCell(ref, exportText(v, c)));
    }
    parts.push(`<row r="${r + 2}">${cells.join('')}</row>`);
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${parts.join('')}</sheetData></worksheet>`;
  const enc = (name, text) => ({ name, data: utf8Encode(text) });
  return writeZip([
    enc('[Content_Types].xml', CONTENT_TYPES),
    enc('_rels/.rels', ROOT_RELS),
    enc('xl/workbook.xml', WORKBOOK),
    enc('xl/_rels/workbook.xml.rels', WORKBOOK_RELS),
    enc('xl/styles.xml', STYLES),
    enc('xl/worksheets/sheet1.xml', sheet)
  ]);
}
