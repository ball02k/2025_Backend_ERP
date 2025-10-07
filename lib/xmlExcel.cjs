function esc(s = "") {
  return String(s).replace(/[<>&'\"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[c]));
}
function workbookOpen() {
  return `<?xml version="1.0"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
   xmlns:o="urn:schemas-microsoft-com:office:office"
   xmlns:x="urn:schemas-microsoft-com:office:excel"
   xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
}
function workbookClose() { return `</Workbook>`; }
function cell(v, type) {
  if (v && typeof v === 'object' && v.f) return `<Cell><Data ss:Type="Number"></Data><ss:Formula>${esc(v.f)}</ss:Formula></Cell>`;
  const isNum = type === 'Number' || typeof v === 'number';
  return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v ?? '')}</Data></Cell>`;
}
function row(cells) { return `<Row>${(cells || []).map((c) => cell(c)).join('')}</Row>`; }
function sheet(name, rows) {
  return `<Worksheet ss:Name="${esc(name)}"><Table>${(rows || []).map((r) => row(r)).join('')}</Table></Worksheet>`;
}
module.exports = { esc, workbookOpen, workbookClose, sheet, row, cell };
