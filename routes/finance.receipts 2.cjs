const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');
const { prisma } = require('../utils/prisma.cjs');

router.use(requireAuth);
router.use(requireFinanceRole);

function toOrderBy(order) {
  const def = { receivedAt: 'desc' };
  if (!order || typeof order !== 'string') return def;
  const [key, dirRaw] = String(order).split('.');
  const dir = (dirRaw || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const map = { receivedDate: 'receivedAt', receivedAt: 'receivedAt', createdAt: 'createdAt' };
  const k = map[key] || 'receivedAt';
  return { [k]: dir };
}

// GET /api/finance/receipts — list PO deliveries as receipts
router.get('/finance/receipts', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { poId, projectId, date, q, limit = '25', offset = '0', orderBy = 'receivedAt.desc' } = req.query;
    const where = { tenantId };
    if (poId) where.poId = Number(poId);
    if (date) where.receivedAt = { gte: new Date(String(date)) };
    // Project filter via PO relation
    const include = { po: true };
    if (projectId) {
      where.po = { ...(where.po || {}), projectId: Number(projectId) };
    }

    const [rows, total] = await Promise.all([
      prisma.delivery.findMany({ where, include, skip: Number(offset), take: Math.min(Number(limit) || 25, 100), orderBy: toOrderBy(String(orderBy)) }),
      prisma.delivery.count({ where }),
    ]);

    // Shape items for FE
    const items = rows.map((r) => ({
      id: r.id,
      receivedDate: r.receivedAt,
      note: r.note || null,
      purchaseOrderId: r.poId,
      purchaseOrder: r.po ? { id: r.po.id, poNumber: r.po.code || r.po.id } : null,
      project: r.po?.project ? { id: r.po.project.id, name: r.po.project.name } : undefined,
    }));

    // Optional q filter on note (post-filter to avoid complex Prisma condition)
    const qStr = q ? String(q).toLowerCase() : '';
    const filtered = qStr ? items.filter((it) => (it.note || '').toLowerCase().includes(qStr)) : items;

    res.json({ items: filtered, total: qStr ? filtered.length : total });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list receipts' });
  }
});

module.exports = router;

