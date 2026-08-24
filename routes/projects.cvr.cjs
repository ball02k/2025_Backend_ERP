const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { parsePeriod } = require('../lib/period.cjs');
const { buildLinks } = require('../lib/buildLinks.cjs');
const { calculateActuals } = require('../services/cvrActualsService.cjs');

const budgetLineCvrSelect = {
  id: true,
  tenantId: true,
  projectId: true,
  code: true,
  description: true,
  planned: true,
  amount: true,
  total: true,
};

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

async function sumUnallocatedCertifiedActuals(tenantId, projectId, endDate) {
  const rows = await prisma.cVRActual.findMany({
    where: {
      tenantId,
      projectId,
      budgetLineId: null,
      sourceType: 'PAYMENT_APPLICATION',
      status: { not: 'REVERSED' },
      OR: [
        { incurredDate: { lte: endDate } },
        { certifiedDate: { lte: endDate } },
        { paidDate: { lte: endDate } },
      ],
    },
    select: {
      amount: true,
    },
  });

  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

// DEPRECATED: Replaced by cvrActualsService.calculateActuals()
// which includes both invoices AND certified payment applications
async function sumInvoicesToDate(tenantId, projectId, endDate) {
  // Use the new service that includes Payment Applications
  // Returns Map of budgetLineId → actual amount
  return await calculateActuals(tenantId, projectId, endDate);
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

// POST endpoint to create/initialize CVR snapshot for a period
router.post('/projects/:projectId/cvr', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const period = String(req.body?.period || '');

    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) {
      return res.status(400).json({ error: 'period must be YYYY-MM' });
    }

    // Check if snapshot already exists
    let snapshot = await prisma.cVRSnapshot.findFirst({
      where: { tenantId, projectId, period },
    });

    if (snapshot) {
      return res.json({ message: 'Snapshot already exists', snapshot: safe(snapshot) });
    }

    // Create new snapshot with seed data
    const { end } = parsePeriod(period);
    const budgetLines = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: budgetLineCvrSelect,
    });
    const contractMap = await sumContractsByPackage(tenantId, projectId);
    const actualMap = await sumInvoicesToDate(tenantId, projectId, end);

    // Get next snapshot number for this project
    const lastSnapshot = await prisma.cVRSnapshot.findFirst({
      where: { tenantId, projectId },
      orderBy: { snapshotNumber: 'desc' },
    });
    const snapshotNumber = (lastSnapshot?.snapshotNumber || 0) + 1;
    const snapshotRef = `CVR-${projectId}-${period}-${String(snapshotNumber).padStart(3, '0')}`;

    // Calculate period dates from YYYY-MM format
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month

    snapshot = await prisma.cVRSnapshot.create({
      data: {
        tenantId,
        projectId,
        period,
        periodStart,
        periodEnd,
        status: 'draft',
        snapshotNumber,
        snapshotRef
      },
    });

    for (const bl of budgetLines) {
      const planned = Number(bl.planned || bl.amount || 0);
      // Get actuals directly from budget line (not via package)
      const actualEntry = actualMap.get(bl.id) || 0;
      await prisma.cVRSnapshotLine.create({
        data: {
          tenantId,
          snapshotId: snapshot.id,
          projectId,
          budgetLineId: bl.id,
          packageId: null,
          contractId: null,
          code: bl.code ?? null,
          name: bl.description ?? null,
          planned,
          estimate: 0, // Can be populated from contracts if needed
          actualToDate: actualEntry,
          progressPct: 0,
        },
      });
    }

    res.json({ message: 'Snapshot created', snapshot: safe(snapshot) });
  } catch (e) {
    next(e);
  }
});

router.get('/projects/:projectId/cvr', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const period = String(req.query.period || '');

    // If no period specified, return live/all-time CVR data
    if (!period) {
      const budgetLines = await prisma.budgetLine.findMany({
        where: { tenantId, projectId },
        select: budgetLineCvrSelect,
      });
      const contractMap = await sumContractsByPackage(tenantId, projectId);
      const asOfDate = new Date();
      const actualMap = await sumInvoicesToDate(tenantId, projectId, asOfDate);
      const unallocatedActuals = await sumUnallocatedCertifiedActuals(tenantId, projectId, asOfDate);

      const lines = budgetLines.map((bl) => {
        const planned = Number(bl.planned || bl.amount || 0);
        const actualEntry = actualMap.get(bl.id) || 0;
        const contractEntry = contractMap.get(bl.packageId);
        const estimate = contractEntry?.total || 0;

        const line = {
          id: bl.id,
          tenantId,
          projectId,
          budgetLineId: bl.id,
          packageId: bl.packageId,
          contractId: contractEntry?.contractId || null,
          code: bl.code ?? null,
          name: bl.description ?? null,
          planned,
          estimate,
          actualToDate: actualEntry,
          progressPct: 0,
          notes: null,
        };

        const metrics = derived(line);
        const row = { ...line, ...metrics };
        row.links = buildLinks('cvrLine', row);
        return row;
      });

      if (unallocatedActuals > 0) {
        const line = {
          id: 'unallocated-certified-applications',
          tenantId,
          projectId,
          budgetLineId: null,
          packageId: null,
          contractId: null,
          code: 'UNALLOCATED',
          name: 'Unallocated certified payment applications',
          planned: 0,
          estimate: 0,
          actualToDate: unallocatedActuals,
          progressPct: 0,
          notes: 'Assign payment application line items to budget lines to move this into the coded CVR.',
        };
        const metrics = derived(line);
        lines.push({
          ...line,
          ...metrics,
          links: [
            { type: 'project', id: projectId, href: `/projects/${projectId}`, label: `#${projectId}` },
            { type: 'paymentApplications', href: `/projects/${projectId}/financials`, label: 'Payment applications' },
          ],
        });
      }

      const totals = lines.reduce(
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

      return res.json({
        snapshot: null, // No snapshot for live view
        lines,
        totals,
        mode: 'live', // Indicate this is live data, not a snapshot
      });
    }

    // Validate period format if provided
    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) {
      return res.status(400).json({ error: 'period must be YYYY-MM' });
    }

    // Period specified - return snapshot data
    let snapshot = await prisma.cVRSnapshot.findFirst({
      where: { tenantId, projectId, period },
    });

    if (!snapshot && req.query.seed === 'true') {
      const { end } = parsePeriod(period);
      const budgetLines = await prisma.budgetLine.findMany({
        where: { tenantId, projectId },
        select: budgetLineCvrSelect,
      });
      const contractMap = await sumContractsByPackage(tenantId, projectId);
      const actualMap = await sumInvoicesToDate(tenantId, projectId, end);

      // Get next snapshot number for this project
      const lastSnapshot = await prisma.cVRSnapshot.findFirst({
        where: { tenantId, projectId },
        orderBy: { snapshotNumber: 'desc' },
      });
      const snapshotNumber = (lastSnapshot?.snapshotNumber || 0) + 1;
      const snapshotRef = `CVR-${projectId}-${period}-${String(snapshotNumber).padStart(3, '0')}`;

      // Calculate period dates from YYYY-MM format
      const [year, month] = period.split('-').map(Number);
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0); // Last day of month

      snapshot = await prisma.cVRSnapshot.create({
        data: {
          tenantId,
          projectId,
          period,
          periodStart,
          periodEnd,
          status: 'draft',
          snapshotNumber,
          snapshotRef
        },
      });

      for (const bl of budgetLines) {
        const planned = Number(bl.planned || bl.amount || 0);
        // Get actuals directly from budget line (not via package)
        const actualEntry = actualMap.get(bl.id) || 0;
        await prisma.cVRSnapshotLine.create({
          data: {
            tenantId,
            snapshotId: snapshot.id,
            projectId,
            budgetLineId: bl.id,
            packageId: null,
            contractId: null,
            code: bl.code ?? null,
            name: bl.description ?? null,
            planned,
            estimate: 0, // Can be populated from contracts if needed
            actualToDate: actualEntry,
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
      mode: 'snapshot', // Indicate this is snapshot data, not live
      period, // Include the period for reference
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

    // Use new calculateActuals service that includes Payment Applications
    const actualsMap = await calculateActuals(tenantId, projectId, end);

    const lines = await prisma.cVRSnapshotLine.findMany({
      where: { tenantId, snapshotId: snapshot.id },
    });

    let updatedCount = 0;
    for (const line of lines) {
      // Get actual from budget line if available
      const actual = line.budgetLineId ? actualsMap.get(line.budgetLineId) || 0 : 0;

      await prisma.cVRSnapshotLine.update({
        where: { id: line.id },
        data: { actualToDate: actual },
      });

      if (actual > 0) updatedCount++;
    }

    res.json({
      ok: true,
      message: `Updated ${updatedCount} lines with actuals`,
      totalLines: lines.length,
    });
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
