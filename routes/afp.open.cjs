const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma } = require('../utils/prisma.cjs');

// Open GET list for AFP without feature gating; keep auth + tenant scoping
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    const projectId = Number(req.query.projectId);
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId required' });

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, name: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const itemsRaw = await prisma.applicationForPayment.findMany({
      where: { tenantId, projectId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        projectId: true,
        contractId: true,
        supplierId: true,
        applicationNumber: true,
        applicationNo: true,
        reference: true,
        status: true,
        paymentNoticeAmount: true,
        certifiedThisPeriod: true,
        certifiedNetValue: true,
        certifiedAmount: true,
        claimedThisPeriod: true,
        claimedNetValue: true,
        netClaimed: true,
        amountPaid: true,
        applicationDate: true,
        periodStart: true,
        periodEnd: true,
        updatedAt: true,
        contract: {
          select: {
            id: true,
            contractRef: true,
            title: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const toStrYymm = (d) => {
      try { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; } catch { return null; }
    };
    const items = (itemsRaw || []).map((r) => {
      const value =
        r.paymentNoticeAmount ??
        r.certifiedThisPeriod ??
        r.certifiedNetValue ??
        r.certifiedAmount ??
        r.claimedThisPeriod ??
        r.claimedNetValue ??
        r.netClaimed ??
        null;

      return {
        id: r.id,
        projectId: project.id,
        contractId: r.contractId,
        supplierId: r.supplierId,
        applicationNo: r.applicationNo || (r.applicationNumber ? `PA-${r.applicationNumber}` : null),
        period: toStrYymm(r.periodStart || r.applicationDate),
        status: r.status,
        value: value != null ? Number(value) : null,
        amountPaid: r.amountPaid != null ? Number(r.amountPaid) : 0,
        updatedAt: r.updatedAt,
        links: [
          { type: 'project', id: project.id, href: `/projects/${project.id}`, label: project.name || `Project ${project.id}` },
          ...(r.contract ? [{
            type: 'contract',
            id: r.contract.id,
            href: `/contracts/${r.contract.id}`,
            label: r.contract.contractRef || r.contract.title || `Contract ${r.contract.id}`,
          }] : []),
          ...(r.supplier ? [{
            type: 'supplier',
            id: r.supplier.id,
            href: `/suppliers/${r.supplier.id}`,
            label: r.supplier.name || `Supplier ${r.supplier.id}`,
          }] : []),
        ],
      };
    });
    const enriched = items;
    return res.json({ items: enriched });
  } catch (err) { next(err); }
});

module.exports = router;
