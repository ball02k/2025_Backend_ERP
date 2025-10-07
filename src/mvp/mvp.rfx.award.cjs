const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function sumPricing(pricing = []) {
  // Prefer explicit total, else qty*rate (avoid mixing ?? and || without grouping)
  return pricing.reduce((a, p) => {
    const hasTotal = p && p.total !== undefined && p.total !== null;
    const v = hasTotal ? Number(p.total) : (Number(p?.qty || 0) * Number(p?.rate || 0));
    return a + (Number.isFinite(v) ? v : 0);
  }, 0);
}

// POST /mvp/rfx/:rfxId/award { submissionId?, supplierId?, email?, createContract?, endDate?, managedByUserId? }
router.post('/mvp/rfx/:rfxId/award', async (req, res, next) => {
  try {
    const tenantId = req.tenantId; const rfxId = Number(req.params.rfxId);
    const { submissionId, supplierId, email = {}, createContract, endDate, managedByUserId } = req.body || {};

    const rfx = await prisma.request.findFirst({ where: { id: rfxId } });
    if (!rfx) return res.status(404).json({ error: 'RFx not found' });

    let sub = null;
    if (submissionId) sub = await prisma.rFxSubmission.findFirst({ where: { id: Number(submissionId) } });
    if (!sub && supplierId) sub = await prisma.rFxSubmission.findFirst({ where: { tenantId, rfxId, supplierId: Number(supplierId) } });
    if (!sub) {
      // pick lowest total among submissions
      const subs = await prisma.rFxSubmission.findMany({ where: { tenantId, rfxId } });
      if (!subs.length) return res.status(400).json({ error: 'No submissions found' });
      subs.sort((a, b) => sumPricing(a.pricing) - sumPricing(b.pricing));
      sub = subs[0];
    }

    let contract = null;
    const total = sumPricing(sub.pricing);
    if (createContract) {
      const title = rfx?.title ? `Contract for ${rfx.title}` : 'Contract (MVP Award)';
      contract = await prisma.contract.create({
        data: {
          projectId: rfx.projectId,
          packageId: rfx.packageId || null,
          supplierId: sub.supplierId,
          title,
          contractNumber: `CNT-${rfxId}-${Date.now()}`,
          value: total,
          originalValue: total,
          status: 'Pending',
          managedByUserId: managedByUserId ? Number(managedByUserId) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });
    }

    // Flip RFx status to awarded
    await prisma.request.update({ where: { id: rfxId }, data: { status: 'awarded' } }).catch(() => {});

    // Trigger recompute hooks if present
    try { const { recomputeProjectFinancials } = require('../../routes/hooks.recompute.cjs'); await recomputeProjectFinancials(tenantId, rfx.projectId); } catch (_) {}

    // Optionally send email
    if (email?.to) {
      try {
        const net = require('net'); const host = process.env.SMTP_HOST; const from = process.env.SMTP_FROM || 'noreply@example.com';
        if (host) {
          await new Promise((resolve, reject) => {
            const s = net.createConnection({ host, port: 25 }, () => {
              const cmds = [`HELO localhost\r\n`, `MAIL FROM:<${from}>\r\n`, `RCPT TO:<${email.to}>\r\n`, `DATA\r\n`, `Subject: ${email.subject || 'Award Notice'}\r\nFrom: ${from}\r\nTo: ${email.to}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${email.body || ''}\r\n.\r\n`, `QUIT\r\n`];
              let i = 0; s.on('data', () => { if (i < cmds.length) s.write(cmds[i++]); else { s.end(); resolve(); } });
            });
            s.on('error', reject);
          });
        }
      } catch (_) {}
    }

    res.json({ ok: true, contractId: contract?.id || null, awardedSupplierId: sub.supplierId, total });
  } catch (e) { next(e); }
});

module.exports = router;
