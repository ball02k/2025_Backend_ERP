const express = require('express');
const router = express.Router();

// Expect: attachUser + requireAuth already applied in index.cjs or here if needed
module.exports = (prisma, { requireAuth }) => {
  router.get('/home/overview', requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenantId || 'demo';

      // --- Basic time windows (adjust as needed) ---
      const today = new Date();
      const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
      const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate() - 90);

      // --- 1) Active projects & totals ---
      const projects = await prisma.project.findMany({
        where: {
          tenantId,
          OR: [
            { status: { equals: 'active', mode: 'insensitive' } },
            { status: { equals: 'in_progress', mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, status: true, type: true, budget: true, actualSpend: true, endDate: true }
      });

      const totals = projects.reduce((acc, p) => {
        const b = Number(p.budget || 0);
        const a = Number(p.actualSpend || 0);
        acc.totalBudget += b;
        acc.totalActual += a;
        return acc;
      }, { totalBudget: 0, totalActual: 0 });

      const budgetVsSpend = {
        totalBudget: totals.totalBudget,
        totalActual: totals.totalActual,
        variance: totals.totalBudget - totals.totalActual
      };

      // --- 2) QS / CVR margin snapshot (value minus costs) ---
      // value = valuations + approved variations (minus retentions etc. simplified)
      // costs = actual + committed
      let cvrAgg;
      try {
        // Use parameterized raw query to avoid driver errors and injection risk
        cvrAgg = await prisma.$queryRaw`
        SELECT 
          COALESCE(SUM(v.value),0) as value,
          COALESCE(SUM(vr.approvedValue),0) as variations,
          COALESCE(SUM(c.actualCost),0) as actualCost,
          COALESCE(SUM(c.committedCost),0) as committedCost
        FROM (SELECT 0) x
        LEFT JOIN (
          SELECT projectId, SUM(amount) as value
          FROM "Valuation"
          WHERE "tenantId" = ${tenantId}
          GROUP BY projectId
        ) v ON 1=1
        LEFT JOIN (
          SELECT projectId, SUM(approvedValue) as approvedValue
          FROM "Variation"
          WHERE "tenantId" = ${tenantId} AND status IN ('approved','accepted')
          GROUP BY projectId
        ) vr ON 1=1
        LEFT JOIN (
          SELECT projectId, SUM(actualCost) as actualCost, SUM(committedCost) as committedCost
          FROM "CostPeriod"
          WHERE "tenantId" = ${tenantId}
          GROUP BY projectId
        ) c ON 1=1
        `;
      } catch (_e) {
        cvrAgg = [{ value: 0, variations: 0, actualCost: 0, committedCost: 0 }];
      }
      const agg = Array.isArray(cvrAgg) ? cvrAgg[0] || {} : {};
      const value = Number(agg.value || 0) + Number(agg.variations || 0);
      const cost = Number(agg.actualCost || 0) + Number(agg.committedCost || 0);
      const margin = value - cost;
      const marginPct = value > 0 ? (margin / value) * 100 : 0;

      // --- 3) Live pending approvals (Variations & POs) ---
      const [pendingVariations, pendingPOs] = await Promise.all([
        prisma.variation.count({
          where: {
            tenantId,
            OR: [
              { status: { equals: 'draft', mode: 'insensitive' } },
              { status: { equals: 'submitted', mode: 'insensitive' } },
              { status: { equals: 'awaiting_approval', mode: 'insensitive' } }
            ]
          }
        }),
        prisma.purchaseOrder?.count
          ? prisma.purchaseOrder.count({
              where: {
                tenantId,
                OR: [
                  { status: { equals: 'draft', mode: 'insensitive' } },
                  { status: { equals: 'submitted', mode: 'insensitive' } },
                  { status: { equals: 'awaiting_approval', mode: 'insensitive' } }
                ]
              }
            })
          : Promise.resolve(0)
      ]);

      // --- 4) Risk alerts (AI / manual flags) ---
      const riskAlerts = await prisma.aiAlert?.findMany ? prisma.aiAlert.findMany({
        where: {
          tenantId,
          OR: [
            { status: { equals: 'open', mode: 'insensitive' } },
            { status: { equals: 'new', mode: 'insensitive' } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, severity: true, type: true, message: true, projectId: true, createdAt: true }
      }) : [];

      // --- 5) CVR trend (last 6 points month-on-month) ---
      const cvrTrend = await prisma.cvrPeriod?.findMany ? prisma.cvrPeriod.findMany({
        where: { tenantId, periodDate: { gte: ninetyDaysAgo } },
        orderBy: { periodDate: 'asc' },
        select: { periodDate: true, value: true, actualCost: true, committedCost: true }
      }) : [];
      const cvrTrendPoints = (cvrTrend || []).map(p => {
        const v = Number(p.value || 0);
        const c = Number(p.actualCost || 0) + Number(p.committedCost || 0);
        const m = v - c;
        const pct = v > 0 ? (m / v) * 100 : 0;
        return { date: p.periodDate, marginPct: pct, value: v, cost: c };
      });

      // --- 6) Compliance expiries (insurance / H&S) within 30 days ---
      const compliance = await prisma.supplierCompliance?.findMany ? prisma.supplierCompliance.findMany({
        where: {
          tenantId,
          expiryDate: { lte: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30) }
        },
        select: { id: true, supplierId: true, type: true, expiryDate: true }
      }) : [];

      // --- 7) Carbon summary (Scopes 1-3, last 30 days) ---
      const carbon = await prisma.carbonLog?.groupBy ? prisma.carbonLog.groupBy({
        by: ['scope'],
        where: { tenantId, date: { gte: thirtyDaysAgo } },
        _sum: { kgCO2e: true }
      }) : [];
      const carbonSummary = carbon.reduce((acc, r) => {
        acc[r.scope] = Number(r._sum.kgCO2e || 0);
        return acc;
      }, { scope1: 0, scope2: 0, scope3: 0 });

      // --- 8) Cashflow (invoices in/out next 30 days) ---
      // Schema does not have a `direction` field. Treat invoices with a supplier as payables (money out),
      // and those without a supplier as receivables (money in). Use `gross` as the amount.
      const windowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
      const [payables, receivables] = await Promise.all([
        prisma.invoice?.findMany
          ? prisma.invoice.findMany({
              where: {
                tenantId,
                supplierId: { not: null },
                dueDate: { gte: today, lte: windowEnd }
              },
              select: { gross: true }
            })
          : [],
        prisma.invoice?.findMany
          ? prisma.invoice.findMany({
              where: {
                tenantId,
                supplierId: null,
                dueDate: { gte: today, lte: windowEnd }
              },
              select: { gross: true }
            })
          : []
      ]);
      const sum = arr => (arr || []).reduce((a, x) => a + Number(x.gross || 0), 0);
      const cashflow = { receivables: sum(receivables), payables: sum(payables) };

      // --- 9) Overdue tasks (top 5) ---
      const overdueTasks = await prisma.task.findMany({
        where: { tenantId, status: { equals: 'overdue', mode: 'insensitive' } },
        orderBy: { dueDate: 'asc' },
        take: 5,
        select: { id: true, title: true, dueDate: true, projectId: true }
      });

      return res.json({
        asOf: today,
        kpis: {
          activeProjects: projects.length,
          budgetVsSpend,
          margin: { value, cost, margin, marginPct },
          pending: { variations: pendingVariations, purchaseOrders: pendingPOs },
          cashflow,
          carbon: carbonSummary
        },
        lists: {
          overdueTasks,
          riskAlerts
        },
        charts: {
          cvrTrend: cvrTrendPoints
        },
        samples: {
          projects: projects.slice(0, 5)
        }
      });
    } catch (e) {
      console.error('home/overview error', e);
      res.status(500).json({ error: 'Failed to compute home overview' });
    }
  });

  return router;
};
