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

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Payment Certificate Template
function paymentCertificateHtml(input) {
  const { afp, project, contract, tenantName } = input;
  const certDate = formatDate(afp.paymentCertificateGeneratedAt || new Date());
  const dueDate = formatDate(afp.dueDate);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(tenantName)} · Payment Certificate ${escapeHtml(String(afp.certNumber || afp.id))}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; }
  h1 { font-size: 22px; margin:0 0 4px; font-weight: 600; }
  h2 { font-size: 14px; margin:18px 0 8px; font-weight: 600; }
  .meta { display:flex; justify-content:space-between; gap:16px; margin:20px 0; }
  .card { border:1px solid #ddd; border-radius:8px; padding:14px; background:#fafafa; }
  .info-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee; }
  .info-row:last-child { border-bottom:none; }
  .label { color:#666; font-size:12px; font-weight:500; }
  .value { font-weight:600; font-size:13px; }
  table { width:100%; border-collapse:collapse; font-size:13px; margin:12px 0; }
  th, td { border-bottom:1px solid #eee; padding:10px 8px; vertical-align:top; }
  th { text-align:left; background:#f5f5f5; font-weight:600; }
  .num { text-align:right; white-space:nowrap; font-variant-numeric: tabular-nums; }
  .total-row { font-weight:700; font-size:14px; background:#fafafa; }
  .small { color:#666; font-size:11px; }
  .footer { margin-top:24px; padding-top:16px; border-top:2px solid #ddd; font-size:11px; color:#444; }
  .notice { background:#fff3cd; border:1px solid #ffc107; border-radius:6px; padding:12px; margin:16px 0; }
  .notice-title { font-weight:600; margin-bottom:4px; }
</style>
</head>
<body>
  <h1>PAYMENT CERTIFICATE</h1>
  <div class="small">Certificate No: ${escapeHtml(String(afp.certNumber || afp.id))} · Issued: ${certDate}</div>

  <div class="meta">
    <div class="card" style="flex:1">
      <h2>Project</h2>
      <div><strong>${escapeHtml(project?.name || '')}</strong></div>
      ${project?.code ? `<div class="small">Code: ${escapeHtml(project.code)}</div>` : ''}
    </div>
    <div class="card" style="flex:1">
      <h2>Contract</h2>
      <div><strong>${escapeHtml(contract?.title || contract?.contractNumber || '')}</strong></div>
      ${contract?.contractor ? `<div class="small">Contractor: ${escapeHtml(contract.contractor)}</div>` : ''}
    </div>
  </div>

  <div class="card">
    <h2>Payment Details</h2>
    <div class="info-row">
      <span class="label">Application No.</span>
      <span class="value">${escapeHtml(String(afp.appNumber || afp.id))}</span>
    </div>
    <div class="info-row">
      <span class="label">Period Ending</span>
      <span class="value">${formatDate(afp.periodEnd)}</span>
    </div>
    <div class="info-row">
      <span class="label">Due Date</span>
      <span class="value">${dueDate}</span>
    </div>
  </div>

  <h2>Valuation Breakdown</h2>
  <table>
    <tbody>
      <tr>
        <td>Gross Valuation (to date)</td>
        <td class="num">${money(afp.grossVal)}</td>
      </tr>
      <tr>
        <td>Less Retention (${Number(afp.retentionPct || 0)}%)</td>
        <td class="num">${money(afp.retention)}</td>
      </tr>
      <tr>
        <td>Less Previous Payments</td>
        <td class="num">${money(afp.prevPaid)}</td>
      </tr>
      <tr class="total-row">
        <td>Amount Due This Certificate</td>
        <td class="num">${money(afp.netDue)}</td>
      </tr>
    </tbody>
  </table>

  ${afp.qsNotes ? `<div class="card"><strong>Notes</strong><div style="margin-top:8px">${escapeHtml(afp.qsNotes)}</div></div>` : ''}

  <div class="notice">
    <div class="notice-title">Construction Act Notice</div>
    <div class="small">This is a payment certificate issued under the Construction Act 1996 (as amended).
    Payment is due by ${dueDate}. If the paying party intends to pay less than the certified amount,
    a Pay Less Notice must be issued at least 5 days before the final date for payment.</div>
  </div>

  <div class="footer">
    <div>Certified by ${escapeHtml(tenantName)}</div>
    <div class="small">Generated: ${certDate}</div>
  </div>
</body>
</html>`;
}

// Payment Notice Template
function paymentNoticeHtml(input) {
  const { afp, project, contract, tenantName } = input;
  const noticeDate = formatDate(afp.paymentNoticeSentAt || new Date());
  const dueDate = formatDate(afp.dueDate);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(tenantName)} · Payment Notice</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; }
  h1 { font-size: 22px; margin:0 0 4px; font-weight: 600; }
  h2 { font-size: 14px; margin:18px 0 8px; font-weight: 600; }
  .card { border:1px solid #ddd; border-radius:8px; padding:14px; background:#fafafa; margin:12px 0; }
  .info-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee; }
  .info-row:last-child { border-bottom:none; }
  .label { color:#666; font-size:12px; font-weight:500; }
  .value { font-weight:600; font-size:13px; }
  .amount-box { background:#e3f2fd; border:2px solid #2196f3; border-radius:8px; padding:16px; text-align:center; margin:20px 0; }
  .amount-box-label { font-size:12px; color:#666; margin-bottom:4px; }
  .amount-box-value { font-size:28px; font-weight:700; color:#1976d2; }
  .small { color:#666; font-size:11px; }
  .footer { margin-top:24px; padding-top:16px; border-top:2px solid #ddd; font-size:11px; color:#444; }
  .notice { background:#e8f5e9; border:1px solid #4caf50; border-radius:6px; padding:12px; margin:16px 0; }
  .notice-title { font-weight:600; margin-bottom:4px; color:#2e7d32; }
</style>
</head>
<body>
  <h1>PAYMENT NOTICE</h1>
  <div class="small">Notice Date: ${noticeDate}</div>

  <div class="card">
    <h2>Project & Contract</h2>
    <div class="info-row">
      <span class="label">Project</span>
      <span class="value">${escapeHtml(project?.name || '')}</span>
    </div>
    <div class="info-row">
      <span class="label">Contract</span>
      <span class="value">${escapeHtml(contract?.title || contract?.contractNumber || '')}</span>
    </div>
    <div class="info-row">
      <span class="label">Application No.</span>
      <span class="value">${escapeHtml(String(afp.appNumber || afp.id))}</span>
    </div>
    <div class="info-row">
      <span class="label">Period Ending</span>
      <span class="value">${formatDate(afp.periodEnd)}</span>
    </div>
  </div>

  <div class="amount-box">
    <div class="amount-box-label">AMOUNT TO BE PAID</div>
    <div class="amount-box-value">${money(afp.paymentNoticeAmount || afp.netDue)}</div>
    <div class="small" style="margin-top:8px">Due Date: ${dueDate}</div>
  </div>

  <div class="notice">
    <div class="notice-title">Construction Act Notice</div>
    <div class="small">This is a formal payment notice issued under Section 110A of the Construction Act 1996 (as amended).
    It specifies the sum that the paying party considers due and the basis of calculation.
    Payment must be made by the final date for payment stated above.</div>
  </div>

  <div class="footer">
    <div>Issued by ${escapeHtml(tenantName)}</div>
    <div class="small">Generated: ${noticeDate}</div>
  </div>
</body>
</html>`;
}

// Pay Less Notice Template
function payLessNoticeHtml(input) {
  const { afp, project, contract, tenantName, payLessAmount, payLessReason } = input;
  const noticeDate = formatDate(afp.payLessNoticeSentAt || new Date());
  const dueDate = formatDate(afp.dueDate);
  const originalAmount = afp.paymentNoticeAmount || afp.netDue || 0;
  const deduction = Number(originalAmount) - Number(payLessAmount);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(tenantName)} · Pay Less Notice</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; }
  h1 { font-size: 22px; margin:0 0 4px; font-weight: 600; color:#d32f2f; }
  h2 { font-size: 14px; margin:18px 0 8px; font-weight: 600; }
  .card { border:1px solid #ddd; border-radius:8px; padding:14px; background:#fafafa; margin:12px 0; }
  .info-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee; }
  .info-row:last-child { border-bottom:none; }
  .label { color:#666; font-size:12px; font-weight:500; }
  .value { font-weight:600; font-size:13px; }
  table { width:100%; border-collapse:collapse; font-size:13px; margin:12px 0; }
  td { padding:10px 8px; border-bottom:1px solid #eee; }
  .num { text-align:right; white-space:nowrap; font-variant-numeric: tabular-nums; }
  .total-row { font-weight:700; font-size:14px; background:#ffebee; }
  .amount-box { background:#ffebee; border:2px solid #d32f2f; border-radius:8px; padding:16px; text-align:center; margin:20px 0; }
  .amount-box-label { font-size:12px; color:#666; margin-bottom:4px; }
  .amount-box-value { font-size:28px; font-weight:700; color:#c62828; }
  .small { color:#666; font-size:11px; }
  .footer { margin-top:24px; padding-top:16px; border-top:2px solid #ddd; font-size:11px; color:#444; }
  .notice { background:#fff3e0; border:1px solid #ff9800; border-radius:6px; padding:12px; margin:16px 0; }
  .notice-title { font-weight:600; margin-bottom:4px; color:#e65100; }
  .reason-box { background:#fff; border:1px solid #ddd; border-radius:6px; padding:12px; margin:12px 0; }
</style>
</head>
<body>
  <h1>PAY LESS NOTICE</h1>
  <div class="small">Notice Date: ${noticeDate}</div>

  <div class="card">
    <h2>Project & Contract</h2>
    <div class="info-row">
      <span class="label">Project</span>
      <span class="value">${escapeHtml(project?.name || '')}</span>
    </div>
    <div class="info-row">
      <span class="label">Contract</span>
      <span class="value">${escapeHtml(contract?.title || contract?.contractNumber || '')}</span>
    </div>
    <div class="info-row">
      <span class="label">Application No.</span>
      <span class="value">${escapeHtml(String(afp.appNumber || afp.id))}</span>
    </div>
    <div class="info-row">
      <span class="label">Period Ending</span>
      <span class="value">${formatDate(afp.periodEnd)}</span>
    </div>
  </div>

  <h2>Payment Adjustment</h2>
  <table>
    <tbody>
      <tr>
        <td>Original Payment Notice Amount</td>
        <td class="num">${money(originalAmount)}</td>
      </tr>
      <tr>
        <td>Deduction</td>
        <td class="num">(${money(deduction)})</td>
      </tr>
      <tr class="total-row">
        <td>Revised Amount to be Paid</td>
        <td class="num">${money(payLessAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="amount-box">
    <div class="amount-box-label">REVISED PAYMENT AMOUNT</div>
    <div class="amount-box-value">${money(payLessAmount)}</div>
    <div class="small" style="margin-top:8px">Due Date: ${dueDate}</div>
  </div>

  <h2>Reason for Pay Less Notice</h2>
  <div class="reason-box">
    ${escapeHtml(payLessReason || 'No reason provided')}
  </div>

  <div class="notice">
    <div class="notice-title">Construction Act Notice</div>
    <div class="small">This is a Pay Less Notice issued under Section 111 of the Construction Act 1996 (as amended).
    It notifies the payee that the paying party intends to pay less than the notified sum,
    and sets out the basis of calculation. This notice has been issued at least 5 days before the final date for payment.</div>
  </div>

  <div class="footer">
    <div>Issued by ${escapeHtml(tenantName)}</div>
    <div class="small">Generated: ${noticeDate}</div>
  </div>
</body>
</html>`;
}

module.exports = {
  paymentCertificateHtml,
  paymentNoticeHtml,
  payLessNoticeHtml,
};
