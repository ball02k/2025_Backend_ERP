const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { parsePeriod } = require('../lib/period.cjs');
const { buildLinks } = require('../lib/buildLinks.cjs');

function safe(x) {
  return JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

async function sumContractsByPackage(tenantId, projectId) {
  const contracts = await prisma.contract.findMany({
    where: { tenantId, projectId },
    select: { id: true, packageId: true, value: true },
  });
  const byPkg = new Map();
  for (const c of contracts) {
    if (!c.packageId) continue;
    const prev = byPkg.get(c.packageId) || { total: 0, contractId: null };
    prev.total += Number(c.value || 0);
    prev.contractId = c.id ?? prev.contractId;
    byPkg.set(c.packageId, prev);
  }
  return byPkg;
}

async function sumInvoicesToDate(tenantId, projectId, endDate) {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, projectId },
    select: {
      net: true,
      gross: true,
      vat: true,
      createdAt: true,
      issueDate: true,
      packageId: true,
      contractId: true,
    },
  });
  const byPkg = new Map();
  for (const inv of invoices) {
    const d = inv.issueDate ?? inv.createdAt;
    if (!d) continue;
    if (new Date(d) > endDate) continue;
    const key = inv.packageId ?? null;
    if (!key) continue;
    const gross = inv.gross != null ? Number(inv.gross) : undefined;
    const amt =
      gross != null
        ? gross
        : Number(inv.net || 0) + Number(inv.vat || 0);
    byPkg.set(key, (byPkg.get(key) || 0) + amt);
  }
  return byPkg;
}

function derived(line) {
  const estimate = Number(line.estimate || 0);
  const actual = Number(line.actualToDate || 0);
  const progress = Number(line.progressPct || 0);
  const earnedValue = estimate * progress * 0.01;
  const variance = earnedValue - actual;
  const costToComplete = estimate - actual;
  return { earnedValue, variance, costToComplete };
}

router.get('/projects/:projectId/cvr', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const period = String(req.query.period || '');
    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) {
      return res.status(400).json({ error: 'period must be YYYY-MM' });
    }

    let snapshot = await prisma.cVRSnapshot.findFirst({
      where: { tenantId, projectId, period },
    });

    if (!snapshot && req.query.seed === 'true') {
      const { end } = parsePeriod(period);
      const budgetLines = await prisma.budgetLine.findMany({
        where: { tenantId, projectId },
      });
      const contractMap = await sumContractsByPackage(tenantId, projectId);
      const actualMap = await sumInvoicesToDate(tenantId, projectId, end);

      snapshot = await prisma.cVRSnapshot.create({
        data: { tenantId, projectId, period, status: 'draft' },
      });

      for (const bl of budgetLines) {
        const planned = Number(bl.planned || bl.amount || 0);
        const pkgId = bl.packageId ?? null;
        const estimateEntry = pkgId ? contractMap.get(pkgId) : null;
        const actualEntry = pkgId ? actualMap.get(pkgId) : null;
        await prisma.cVRSnapshotLine.create({
          data: {
            tenantId,
            snapshotId: snapshot.id,
            projectId,
            budgetLineId: bl.id,
            packageId: pkgId,
            contractId: estimateEntry?.contractId || null,
            code: bl.code ?? null,
            name: bl.name ?? bl.description ?? null,
            planned,
            estimate: estimateEntry?.total || 0,
            actualToDate: actualEntry || 0,
            progressPct: 0,
          },
        });
      }
    }

    if (!snapshot) {
      return res
        .status(404)
        .json({ error: 'Snapshot not found. Call with ?seed=true to create.' });
    }

    const lines = await prisma.cVRSnapshotLine.findMany({
      where: { tenantId, snapshotId: snapshot.id },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });

    const enriched = lines.map((line) => {
      const safeLine = safe(line);
      const metrics = derived(line);
      const row = {
        ...safeLine,
        ...metrics,
      };
      row.links = buildLinks('cvrLine', row);
      return row;
    });

    const totals = enriched.reduce(
      (acc, row) => {
        acc.planned += Number(row.planned || 0);
        acc.estimate += Number(row.estimate || 0);
        acc.actualToDate += Number(row.actualToDate || 0);
        acc.earnedValue += Number(row.earnedValue || 0);
        acc.variance += Number(row.variance || 0);
        acc.costToComplete += Number(row.costToComplete || 0);
        return acc;
      },
      {
        planned: 0,
        estimate: 0,
        actualToDate: 0,
        earnedValue: 0,
        variance: 0,
        costToComplete: 0,
      }
    );

    res.json({
      snapshot: safe(snapshot),
      lines: enriched,
      totals,
    });
  } catch (e) {
    next(e);
  }
});

router.patch('/projects/:projectId/cvr/lines/:lineId', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const lineId = Number(req.params.lineId);
    await prisma.cVRSnapshotLine.findFirstOrThrow({
      where: { tenantId, projectId, id: lineId },
    });
    const payload = req.body || {};
    const updated = await prisma.cVRSnapshotLine.update({
      where: { id: lineId },
      data: {
        progressPct:
          payload.progressPct != null ? Number(payload.progressPct) : undefined,
        notes: payload.notes ?? undefined,
      },
    });
    const safeLine = safe(updated);
    const metrics = derived(updated);
    const line = { ...safeLine, ...metrics };
    line.links = buildLinks('cvrLine', line);
    res.json({ line });
  } catch (e) {
    next(e);
  }
});

router.post('/projects/:projectId/cvr/refresh', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const period = String(req.body?.period || '');
    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) {
      return res.status(400).json({ error: 'period must be YYYY-MM' });
    }

    const snapshot = await prisma.cVRSnapshot.findFirst({
      where: { tenantId, projectId, period },
    });
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    const { end } = parsePeriod(period);
    const actualMap = await sumInvoicesToDate(tenantId, projectId, end);
    const lines = await prisma.cVRSnapshotLine.findMany({
      where: { tenantId, snapshotId: snapshot.id },
    });
    for (const line of lines) {
      const actual = line.packageId ? actualMap.get(line.packageId) || 0 : 0;
      await prisma.cVRSnapshotLine.update({
        where: { id: line.id },
        data: { actualToDate: actual },
      });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

async function setStatus(req, res, next, status) {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const period = String(req.body?.period || '');
    const note = req.body?.note ?? null;
    const snapshot = await prisma.cVRSnapshot.findFirst({
      where: { tenantId, projectId, period },
    });
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    const updated = await prisma.cVRSnapshot.update({
      where: { id: snapshot.id },
      data: { status, note },
    });
    res.json(safe(updated));
  } catch (e) {
    next(e);
  }
}

router.post('/projects/:projectId/cvr/submit', (req, res, next) =>
  setStatus(req, res, next, 'submitted')
);
router.post('/projects/:projectId/cvr/approve', (req, res, next) =>
  setStatus(req, res, next, 'approved')
);

module.exports = router;
