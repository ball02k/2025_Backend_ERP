const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();
  const { buildLinks } = require('../lib/buildLinks.cjs');

  function yyyymm(d) {
    const dt = d instanceof Date ? d : new Date(d);
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dt.getFullYear()}-${m}`;
  }

  // Ensure a CVR header exists for period
  router.post('/:projectId/cvr', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const projectId = Number(req.params.projectId);
      const period = String(req.body?.period || yyyymm(new Date()));
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
      const header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, projectId, period } });
      if (header) return res.json({ data: header });
      const created = await prisma.costValueReconciliation.create({ data: { tenantId, projectId, period } });
      return res.status(201).json({ data: created });
    } catch (e) { next(e); }
  });

  // Read header + lines for a period
  router.get('/:projectId/cvr', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const projectId = Number(req.params.projectId);
      const period = String(req.query?.period || yyyymm(new Date()));
      const header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, projectId, period } });
      if (!header) return res.json({ data: null });
      const proj = await prisma.project.findFirst({ where: { tenantId, id: header.projectId }, select: { id: true, code: true, name: true } });
      const lines = await prisma.cVRLine.findMany({ where: { tenantId, cvrId: header.id }, orderBy: [{ id: 'asc' }], select: { id: true, tenantId: true, cvrId: true, packageId: true, costCode: true, budget: true, committed: true, actual: true, earnedValue: true, variance: true, adjustment: true, note: true } });
      const headerOut = { ...header, project: proj };
      headerOut.links = buildLinks('cvr', { ...headerOut });
      return res.json({ data: { header: headerOut, lines } });
    } catch (e) { next(e); }
  });

  // Import helpers (additive, coarse-grained)
  router.post('/cvr/:id/lines/import', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const from = String(req.body?.from || '').toLowerCase();
      const header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, id } });
      if (!header) return res.status(404).json({ error: 'Not found' });

      // Group by packageId for simplicity; costCode optional
      const upserts = [];
      if (from === 'pos') {
        // Sum commitments/POs as committed by package
        const pos = await prisma.purchaseOrder.findMany({
          where: { tenantId, projectId: header.projectId },
          select: { id: true, packageId: true, total: true },
        });
        const map = new Map();
        for (const p of pos) {
          const key = `${p.packageId || 'none'}::`;
          const cur = map.get(key) || { packageId: p.packageId || null, costCode: null, committed: 0 };
          cur.committed += Number(p.total || 0);
          map.set(key, cur);
        }
        for (const v of map.values()) upserts.push(v);
      } else if (from === 'invoices') {
        const inv = await prisma.invoice.findMany({
          where: { tenantId, projectId: header.projectId },
          select: { id: true, matchedPoId: true, gross: true, net: true, vat: true },
        });
        const poIds = Array.from(new Set(inv.map(i => i.matchedPoId).filter(v => Number.isFinite(v))));
        const poById = poIds.length ? new Map((await prisma.purchaseOrder.findMany({ where: { id: { in: poIds } }, select: { id: true, projectId: true } })).map(p => [p.id, p])) : new Map();
        const map = new Map();
        for (const i of inv) {
          const pkgId = null; // no package link in schema; keep null aggregate
          const key = `${pkgId || 'none'}::`;
          const cur = map.get(key) || { packageId: pkgId, costCode: null, actual: 0 };
          const amount = (i.gross != null) ? Number(i.gross) : (Number(i.net || 0) + Number(i.vat || 0));
          cur.actual += amount;
          map.set(key, cur);
        }
        for (const v of map.values()) upserts.push(v);
      } else if (from === 'variations') {
        const vars = await prisma.variation.findMany({
          where: { tenantId, projectId: header.projectId, status: 'approved' },
          select: { id: true, value: true },
        });
        const adj = vars.reduce((a, v) => a + Number(v.value || 0), 0);
        upserts.push({ packageId: null, costCode: null, adjustment: adj });
      } else if (from === 'csv') {
        // Assume upstream upload processed; out of scope here
      }

      for (const u of upserts) {
        const where = { tenantId_cvrId_packageId_costCode: undefined }; // not a compound unique, fallback to find first
        const existing = await prisma.cVRLine.findFirst({ where: { tenantId, cvrId: id, packageId: u.packageId || null, costCode: u.costCode || null } });
        if (existing) {
          await prisma.cVRLine.update({ where: { id: existing.id }, data: {
            committed: u.committed != null ? u.committed : undefined,
            actual: u.actual != null ? u.actual : undefined,
            adjustment: u.adjustment != null ? u.adjustment : undefined,
          }});
        } else {
          await prisma.cVRLine.create({ data: { tenantId, cvrId: id, packageId: u.packageId || null, costCode: u.costCode || null,
            budget: 0, committed: Number(u.committed || 0), actual: Number(u.actual || 0), earnedValue: 0, variance: 0, adjustment: Number(u.adjustment || 0) } });
        }
      }
      return res.json({ ok: true, imported: upserts.length });
    } catch (e) { next(e); }
  });

  // Recompute derived fields for header + lines
  router.patch('/cvr/:id', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, id } });
      if (!header) return res.status(404).json({ error: 'Not found' });
      const lines = await prisma.cVRLine.findMany({ where: { tenantId, cvrId: id } });
      // Compute variance per line
      for (const ln of lines) {
        const variance = Number(ln.earnedValue || 0) - Number(ln.actual || 0);
        await prisma.cVRLine.update({ where: { id: ln.id }, data: { variance } });
      }
      const agg = await prisma.cVRLine.aggregate({
        where: { tenantId, cvrId: id },
        _sum: { budget: true, committed: true, actual: true, earnedValue: true, adjustment: true },
      });
      const budget = Number(agg._sum.budget || 0) + Number(agg._sum.adjustment || 0);
      const committed = Number(agg._sum.committed || 0);
      const actual = Number(agg._sum.actual || 0);
      const earnedValue = Number(agg._sum.earnedValue || 0);
      const costVariance = earnedValue - actual;
      const costToComplete = Math.max(0, budget - earnedValue) + (committed - actual);
      const marginPct = earnedValue > 0 ? (earnedValue - actual) / earnedValue : 0;
      const updated = await prisma.costValueReconciliation.update({ where: { id }, data: { budget, committed, actual, earnedValue, costVariance, costToComplete, marginPct } });
      return res.json({ data: updated });
    } catch (e) { next(e); }
  });

  router.post('/cvr/:id/publish', async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const { justification } = req.body || {};
      const header = await prisma.costValueReconciliation.findFirst({ where: { tenantId, id } });
      if (!header) return res.status(404).json({ error: 'Not found' });
      const updated = await prisma.costValueReconciliation.update({ where: { id }, data: { justification: justification || header.justification || null } });
      return res.json({ data: updated });
    } catch (e) { next(e); }
  });

  return router;
};
