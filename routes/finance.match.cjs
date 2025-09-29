const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');
const { prisma } = require('../utils/prisma.cjs');

router.use(requireAuth);
router.use(requireFinanceRole);


// Try to find a matching PO for an invoice (proposal only, non-persistent)
router.post('/finance/match/attempt', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { invoiceId } = req.body || {};
    const inv = await prisma.invoice.findFirst({ where: { id: Number(invoiceId), tenantId } });
    if (!inv) return res.status(404).json({ error: 'INVOICE_NOT_FOUND' });

    // Heuristic: supplier match + gross within tolerance
    const tolAbs = 5;
    const tolPct = 0.005; // 0.5%
    const candidates = await prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        ...(inv.supplierId ? { supplierId: inv.supplierId } : {}),
        status: { notIn: ['Closed', 'Cancelled'] },
      },
      take: 20,
    });
    const scored = candidates.map((po) => {
      const poTotal = Number(po.total || 0);
      const invTotal = Number(inv.gross || 0);
      const variance = Math.abs(poTotal - invTotal);
      const within = variance <= tolAbs || (poTotal > 0 && variance / poTotal <= tolPct);
      return { po, variance, within };
    }).sort((a, b) => a.variance - b.variance);
    const within = scored.filter((s) => s.within);
    const auto = within.length === 1 ? within[0] : null;
    // Persist a proposed match record for visibility
    if (auto) {
      await prisma.financeMatch.create({
        data: {
          tenantId,
          type: 'po_invoice',
          status: 'proposed',
          reason: 'auto_candidate',
          poId: auto.po.id,
          invoiceId: inv.id,
          varianceTotal: auto.variance,
        },
      });
    }
    res.json({ invoiceId: inv.id, candidates: scored.map(s => ({ id: s.po.id, code: s.po.code, variance: s.variance, within: s.within })), autoMatched: !!auto, matchedId: auto ? auto.po.id : null });
  } catch (e) {
    res.status(500).json({ error: 'Failed to attempt match' });
  }
});

// Accept a proposal (no persistent link available in current schema; set invoice status as a proxy)
router.post('/finance/match/:poId/accept', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const poId = Number(req.params.poId);
    const { invoiceId } = req.body || {};
    const inv = await prisma.invoice.findFirst({ where: { id: Number(invoiceId), tenantId } });
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId } });
    if (!inv || !po) return res.status(404).json({ error: 'NOT_FOUND' });
    // Create match row and mark invoice as matched
    await prisma.financeMatch.create({
      data: {
        tenantId,
        type: 'po_invoice',
        status: 'accepted',
        reason: 'manual_accept',
        poId: po.id,
        invoiceId: inv.id,
      },
    });
    const updated = await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'Approved', matchStatus: 'matched', matchedPoId: po.id } });
    res.json({ ok: true, invoice: updated, po: { id: po.id, code: po.code } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to accept match' });
  }
});

module.exports = router;
