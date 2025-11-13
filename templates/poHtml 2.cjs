function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(n, currency = 'GBP') {
  const num = Number(n || 0);
  return num.toLocaleString('en-GB', { style: 'currency', currency });
}

function poHtmlTemplate(input) {
  const { po, tenantName } = input;
  const issued = po.orderDate ? new Date(po.orderDate).toLocaleDateString('en-GB') : '';
  const rows = (po.lines || [])
    .map((l, idx) => `
      <tr>
        <td>${l.lineNo ?? idx + 1}</td>
        <td>${escapeHtml(l.item || l.description || '')}</td>
        <td class="num">${escapeHtml(l.unit || '')}</td>
        <td class="num">${Number(l.qty || 0)}</td>
        <td class="num">${Number(l.unitCost || l.rate || 0)}</td>
        <td class="num">${money(l.lineTotal)}</td>
      </tr>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(tenantName)} · PO ${escapeHtml(po.code || po.poNumber || String(po.id))}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; }
  h1 { font-size: 20px; margin:0 0 4px; }
  h2 { font-size: 14px; margin:18px 0 6px; }
  .meta { display:flex; justify-content:space-between; gap:16px; }
  .card { border:1px solid #ddd; border-radius:8px; padding:12px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { border-bottom:1px solid #eee; padding:6px 8px; vertical-align:top; }
  th { text-align:left; background:#fafafa; }
  .num { text-align:right; white-space:nowrap; }
  .small { color:#666; font-size:11px; }
  .footer { margin-top:18px; font-size:11px; color:#444; }
  .summary { width:240px }
  .flex1 { flex:1 }
  .w220 { width:220px }
  .w240 { width:240px }
  .nowrap { white-space:nowrap }
</style>
</head>
<body>
  <h1>Purchase Order ${escapeHtml(po.code || po.poNumber || String(po.id))}</h1>
  <div class="small">Issued: ${issued}</div>

  <div class="meta">
    <div class="card flex1">
      <h2>Project</h2>
      <div><strong>${escapeHtml(po.project?.name ?? '')}</strong></div>
    </div>
    <div class="card flex1">
      <h2>Supplier</h2>
      <div><strong>${escapeHtml(po.supplier || po.supplier?.name || '')}</strong></div>
    </div>
    <div class="card w240">
      <h2>Summary</h2>
      <div>Total: <span class="num">${money(po.total)}</span></div>
    </div>
  </div>

  <h2>Lines</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Description</th><th class="num">Unit</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6" class="small">No lines</td></tr>`}</tbody>
  </table>

  ${po.notes ? `<div class="card footer"><strong>Notes</strong><div>${escapeHtml(po.notes)}</div></div>` : ''}

  <div class="footer">Issued by ${escapeHtml(tenantName)}</div>
</body>
</html>`;
}

module.exports = { poHtmlTemplate };

