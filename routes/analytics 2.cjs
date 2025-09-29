const express = require('express');

module.exports = function analyticsRouter(prisma) {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  router.get('/rollups', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
      const byProject = Number.isFinite(projectId);

      const whereProj = byProject ? { tenantId, projectId } : { tenantId };
      const whereTenantOnly = { tenantId };

      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

      const [
        poTotal,
        poOpen,
        poPartRec,
        poClosed,
        poAmountSum,
        pkgTotal,
        pkgTender,
        pkgAwarded,
        submissions,
        contracts,
        rfiOpen,
        rfiAnswered,
        rfiClosed,
        qaOpen,
        qaPass,
        qaFail,
        qaItemsOpen,
        qaItemsTotal,
        hsOpen,
        hsClosed,
        hsThisMonth,
        carbonYearSum,
        reqOpen,
        reqInvites,
        reqResponsesSubmitted,
        reqAwards,
      ] = await Promise.all([
        prisma.purchaseOrder.count({ where: whereProj }),
        prisma.purchaseOrder.count({ where: { ...whereProj, status: 'Open' } }),
        prisma.purchaseOrder.count({ where: { ...whereProj, status: 'Partially Received' } }),
        prisma.purchaseOrder.count({ where: { ...whereProj, status: 'Closed' } }),
        prisma.purchaseOrder.aggregate({ where: whereProj, _sum: { total: true } }),
        prisma.package.count({ where: byProject ? { projectId } : {} }),
        prisma.package.count({ where: { ...(byProject ? { projectId } : {}), status: 'Tender' } }),
        prisma.package.count({ where: { ...(byProject ? { projectId } : {}), status: 'Awarded' } }),
        prisma.submission.count({ where: byProject ? { package: { projectId } } : {} }),
        prisma.contract.count({ where: byProject ? { projectId } : {} }),
        prisma.rfi.count({ where: { ...whereProj, status: 'open' } }),
        prisma.rfi.count({ where: { ...whereProj, status: 'answered' } }),
        prisma.rfi.count({ where: { ...whereProj, status: 'closed' } }),
        prisma.qaRecord.count({ where: { ...whereProj, status: 'open' } }),
        prisma.qaRecord.count({ where: { ...whereProj, status: 'pass' } }),
        prisma.qaRecord.count({ where: { ...whereProj, status: 'fail' } }),
        prisma.qaItem.count({ where: { ...whereProj, result: 'open' } }),
        prisma.qaItem.count({ where: whereProj }),
        prisma.hsEvent.count({ where: { ...whereProj, status: 'open' } }),
        prisma.hsEvent.count({ where: { ...whereProj, status: 'closed' } }),
        prisma.hsEvent.count({ where: { ...whereProj, eventDate: { gte: startOfMonth, lt: endOfMonth } } }),
        prisma.carbonEntry.aggregate({
          where: { ...whereProj, periodYear: now.getUTCFullYear() },
          _sum: { calculatedKgCO2e: true },
        }),
        prisma.request.count({ where: { ...whereTenantOnly, status: 'open' } }),
        prisma.requestInvite.count({ where: whereTenantOnly }),
        prisma.requestResponse.count({ where: { ...whereTenantOnly, status: 'submitted' } }),
        prisma.awardDecision.count({ where: { ...whereTenantOnly, decision: 'awarded' } }),
      ]);

      const totalAmount = poAmountSum?._sum?.total != null ? Number(poAmountSum._sum.total) : 0;
      const carbonKg = carbonYearSum?._sum?.calculatedKgCO2e != null
        ? Number(carbonYearSum._sum.calculatedKgCO2e)
        : 0;

      return res.json({
        scope: byProject ? { level: 'project', projectId } : { level: 'tenant' },
        procurement: {
          pos: { total: poTotal, byStatus: { Open: poOpen, PartiallyReceived: poPartRec, Closed: poClosed }, totalAmount },
          packages: { total: pkgTotal, tender: pkgTender, awarded: pkgAwarded, submissions, contracts },
        },
        rfis: { open: rfiOpen, answered: rfiAnswered, closed: rfiClosed, total: rfiOpen + rfiAnswered + rfiClosed },
        qa: { open: qaOpen, pass: qaPass, fail: qaFail, total: qaOpen + qaPass + qaFail, itemsOpen: qaItemsOpen, itemsTotal: qaItemsTotal },
        hs: { open: hsOpen, closed: hsClosed, total: hsOpen + hsClosed, incidentsThisMonth: hsThisMonth },
        carbon: { year: now.getUTCFullYear(), totalKgCO2e: carbonKg },
        requests: { open: reqOpen, invites: reqInvites, responsesSubmitted: reqResponsesSubmitted, awards: reqAwards },
      });
    } catch (e) { next(e); }
  });

  router.get('/trends', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const projectId = Number(req.query.projectId);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: 'projectId required' });
      }
      const days = Math.max(1, Math.min(180, Number(req.query.days || 30)));
      const since = new Date();
      since.setDate(since.getDate() - days + 1);

      const dkey = (d) => {
        const x = new Date(d);
        const y = x.getUTCFullYear();
        const m = String(x.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(x.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };

      const rangeKeys = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        rangeKeys.push(dkey(d));
      }

      const [rfis, qas, hs, carbons, pos] = await Promise.all([
        prisma.rfi.findMany({ where: { tenantId, projectId, createdAt: { gte: since } }, select: { createdAt: true } }),
        prisma.qaRecord.findMany({ where: { tenantId, projectId, createdAt: { gte: since } }, select: { createdAt: true } }),
        prisma.hsEvent.findMany({ where: { tenantId, projectId, eventDate: { gte: since } }, select: { eventDate: true } }),
        prisma.carbonEntry.findMany({ where: { tenantId, projectId, activityDate: { gte: since } }, select: { activityDate: true, calculatedKgCO2e: true } }),
        prisma.purchaseOrder.findMany({ where: { tenantId, projectId, orderDate: { gte: since } }, select: { orderDate: true, total: true } }),
      ]);

      const counts = (arr, field) => arr.reduce((acc, r) => { const k = dkey(r[field]); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
      const sums = (arr, fieldDate, fieldVal) => arr.reduce((acc, r) => { const k = dkey(r[fieldDate]); const v = Number(r[fieldVal] || 0); acc[k] = (acc[k] || 0) + v; return acc; }, {});

      const rfisCount = counts(rfis, 'createdAt');
      const qasCount = counts(qas, 'createdAt');
      const hsCount = counts(hs, 'eventDate');
      const carbonSum = sums(carbons, 'activityDate', 'calculatedKgCO2e');
      const poSum = sums(pos, 'orderDate', 'total');

      const series = (map) => rangeKeys.map((k) => ({ date: k, value: Number(map[k] || 0) }));

      return res.json({
        projectId,
        days,
        rfisCreated: series(rfisCount),
        qaCreated: series(qasCount),
        hsEvents: series(hsCount),
        carbonKg: series(carbonSum),
        poAmount: series(poSum),
      });
    } catch (e) { next(e); }
  });

  return router;
};
