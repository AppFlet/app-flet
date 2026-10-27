'use strict';
// Arma un archivo .xlsx (Excel) sin librerías y sin internet.
(function (root) {
  const enc = new TextEncoder();
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function sheetXML(rows) {
    const out = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
      const ref = col(ci) + (ri + 1);
      if (v === null || v === undefined || v === '') return '';
      if (v && typeof v === 'object' && v.f) return '<c r="' + ref + '" s="2"><f>' + xe(v.f) + '</f><v>' + (Number(v.v) || 0) + '</v></c>';
      if (typeof v === 'number') return '<c r="' + ref + '" s="' + (ri === 0 ? 1 : 2) + '"><v>' + v + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr" s="' + (ri === 0 ? 1 : 0) + '"><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
    }).join('') + '</row>').join('');
    const n = (rows[0] || []).length;
    const cols = '<cols>' + Array.from({ length: n }, (_, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (i === 0 || i === 1 ? 20 : 16) + '" customWidth="1"/>').join('') + '</cols>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + cols + '<sheetData>' + out + '</sheetData></worksheet>';
  }

  function zipStore(files) {
    const parts = [], cen = []; let off = 0;
    const u16 = (n) => [n & 255, (n >>> 8) & 255], u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const head = [0x50, 0x4B, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0x21, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0];
      parts.push(new Uint8Array(head), name, data);
      cen.push(new Uint8Array([0x50, 0x4B, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0x21, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), name);
      off += head.length + name.length + data.length;
    }
    const csize = cen.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([0x50, 0x4B, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(off), 0, 0]);
    const all = parts.concat(cen, [end]); const tot = all.reduce((a, b) => a + b.length, 0);
    const res = new Uint8Array(tot); let p = 0; for (const a of all) { res.set(a, p); p += a.length; }
    return res;
  }

  // sheets: [{ name, rows: [[...], ...] }]  (la primera fila es el título)
  function makeXlsx(sheets) {
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const files = [
      { name: '[Content_Types].xml', data: H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
      { name: '_rels/.rels', data: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: H + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => '<sheet name="' + xe(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: H + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3F0EE"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ].concat(sheets.map((s, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXML(s.rows) })));
    return zipStore(files);
  }
  const api = { makeXlsx, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.R284X = api;
})(typeof window !== 'undefined' ? window : globalThis);
