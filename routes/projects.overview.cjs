const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { safeJson } = require('../lib/serialize.cjs');

router.get('/projects/:projectId/overview', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const [bl, cs, vs, inv, fc, rfiOpen, qaOpen, hsOpen, carbonMonth, latestRfis, latestVars, recentPos, overdueTasks] = await Promise.all([
      prisma.budgetLine.findMany({ where: { tenantId, projectId }, select: { planned: true } }),
      prisma.contract.findMany({ where: { tenantId, projectId }, select: { value: true } }),
      prisma.variation.findMany({ where: { tenantId, projectId, status: 'approved', type: 'CONTRACT_VARIATION' }, select: { amount: true } }),
      prisma.invoice.findMany({ where: { tenantId, projectId }, select: { amount: true } }),
      prisma.forecast.findMany({ where: { tenantId, projectId }, select: { amount: true } }),
      prisma.rfi?.count ? prisma.rfi.count({ where: { tenantId, projectId, status: { equals: 'open', mode: 'insensitive' } } }) : Promise.resolve(0),
      prisma.qaRecord?.count ? prisma.qaRecord.count({ where: { tenantId, projectId, status: { equals: 'open', mode: 'insensitive' } } }) : Promise.resolve(0),
      prisma.hsEvent?.count ? prisma.hsEvent.count({ where: { tenantId, projectId, status: { equals: 'open', mode: 'insensitive' } } }) : Promise.resolve(0),
      prisma.carbonEntry?.aggregate ? prisma.carbonEntry.aggregate({ _sum: { calculatedKgCO2e: true }, where: { tenantId, projectId, activityDate: { gte: monthStart } } }) : Promise.resolve({ _sum: { calculatedKgCO2e: 0 } }),
      prisma.rfi?.findMany ? prisma.rfi.findMany({ where: { tenantId, projectId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id:true, subject:true, status:true, rfiNumber:true } }) : Promise.resolve([]),
      prisma.variation.findMany({ where: { tenantId, projectId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id:true, title:true, status:true } }),
      prisma.purchaseOrder?.findMany ? prisma.purchaseOrder.findMany({ where: { tenantId, projectId }, orderBy: { orderDate: 'desc' }, take: 5, select: { id:true, code:true, status:true } }) : Promise.resolve([]),
      prisma.task.findMany({ where: { tenantId, projectId, status: { equals: 'overdue', mode: 'insensitive' } }, orderBy: { dueDate: 'asc' }, take: 5, select: { id:true, title:true, dueDate:true } })
    ]);
    const baseline = bl.reduce((a, x) => a + Number(x.planned || 0), 0);
    const committed = cs.reduce((a, x) => a + Number(x.value || 0), 0);
    const adjusted = vs.reduce((a, x) => a + Number(x.amount || 0), 0);
    const estimate = committed + adjusted;
    const actual = inv.reduce((a, x) => a + Number(x.amount || 0), 0);
    const forecast = fc.reduce((a, x) => a + Number(x.amount || 0), 0);
    const [contracts, openVars, approvedVars] = await Promise.all([
      prisma.contract.count({ where: { projectId } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'submitted' } }),
      prisma.variation.count({ where: { tenantId, projectId, status: 'approved' } }),
    ]);
    const data = {
      projectId,
      totals: {
        baseline,
        committed,
        adjusted,
        estimate,
        actual,
        forecast,
        varianceVsBaseline: estimate - baseline,
        varianceVsEstimate: actual - estimate,
      },
      widgets: {
        cvr: { budget: baseline, committed, actual, marginPct: (estimate>0? ((estimate - (actual)) / estimate) * 100 : 0) },
        rfi: { open: Number(rfiOpen || 0) },
        qa: { open: Number(qaOpen || 0) },
        hs: { open: Number(hsOpen || 0) },
        carbon: { monthKgCO2e: Number(carbonMonth?._sum?.calculatedKgCO2e || 0) },
        overdueTasks,
      },
      tables: {
        rfis: latestRfis,
        variations: latestVars,
        pos: (recentPos || []).map(p => ({ id: p.id, number: p.code, status: p.status })),
      },
      derived: {
        budgetTotal: baseline,
        tendersAwardedValue: committed,
        variationsImpact: adjusted,
      },
      finance: {
        committed,
        actual,
        forecast,
      },
      counts: {
        contracts,
        variationsOpen: openVars,
        variationsApproved: approvedVars,
      },
      updatedAt: new Date().toISOString(),
    };
    res.json(safeJson(data));
  } catch (e) { next(e); }
});

// GET /api/projects/:projectId/dashboard — per-project live cards
router.get('/projects/:projectId/dashboard', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const today = new Date();
    const [budgetAgg, committedAgg, actualAgg, rfiOpen, tendersOpen, overdueInv] = await Promise.all([
      prisma.budgetLine.aggregate({ _sum: { amount: true }, where: { tenantId, projectId } }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.contract.aggregate({ _sum: { value: true }, where: { projectId, project: { tenantId } } }).catch(() => ({ _sum: { value: 0 } })),
      prisma.invoice.aggregate({ _sum: { gross: true }, where: { tenantId, projectId } }).catch(() => ({ _sum: { gross: 0 } })),
      prisma.rfi?.count?.({ where: { tenantId, projectId, status: { equals: 'open', mode: 'insensitive' } } }).catch(() => 0),
      prisma.tender?.count?.({ where: { tenantId, projectId, status: { in: ['draft','open'] } } }).catch(() => 0),
      prisma.invoice?.count?.({ where: { tenantId, projectId, dueDate: { lt: today }, status: { in: ['Open','Pending','open','pending'] } } }).catch(() => 0),
    ]);
    const budget = Number(budgetAgg?._sum?.amount || 0);
    const committed = Number(committedAgg?._sum?.value || 0);
    const actual = Number(actualAgg?._sum?.gross || 0);
    const value = committed; // simple proxy for project value here
    const margin = value - actual;
    const marginPct = value > 0 ? (margin / value) * 100 : 0;
    res.json({
      projectId,
      cvr: { budget, committed, actual, marginPct },
      rfis: { open: Number(rfiOpen || 0) },
      tenders: { open: Number(tendersOpen || 0) },
      invoices: { overdue: Number(overdueInv || 0) },
      asOf: today.toISOString(),
    });
  } catch (e) { next(e); }
});

module.exports = router;
