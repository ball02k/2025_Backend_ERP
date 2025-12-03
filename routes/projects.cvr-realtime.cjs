const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * GET /projects/:projectId/cvr
 * Real-time CVR calculation (no snapshots required)
 * Calculates Budget → Committed → Actual → Remaining
 */
router.get('/projects/:projectId/cvr', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1. GET BUDGET from budget lines grouped by package
    const budgetLines = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        planned: true,
        amount: true,
        packageId: true,
        package: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // 2. GET COMMITTED from active/signed contracts grouped by package
    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        projectId,
        status: { in: ['active', 'signed'] },
      },
      select: {
        id: true,
        contractRef: true,
        value: true,
        packageId: true,
      },
    });

    // 3. GET ACTUAL from certified payment applications (excluding cancelled/rejected)
    const paymentApps = await prisma.applicationForPayment.findMany({
      where: {
        tenantId,
        projectId,
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
      select: {
        certifiedThisPeriod: true,
        claimedThisPeriod: true,
        packageId: true,
        contractId: true,
      },
    });

    // Group by package
    const packageMap = new Map();

    // Add budget by package
    budgetLines.forEach((bl) => {
      const pkgId = bl.packageId;
      if (!packageMap.has(pkgId)) {
        packageMap.set(pkgId, {
          packageId: pkgId,
          packageName: bl.package?.name || 'Unallocated',
          budget: 0,
          committed: 0,
          actual: 0,
          budgetLines: [],
        });
      }
      const pkg = packageMap.get(pkgId);
      const budgetAmount = Number(bl.planned || bl.amount || 0);
      pkg.budget += budgetAmount;
      pkg.budgetLines.push({
        id: bl.id,
        code: bl.code,
        name: bl.name || bl.description,
        budget: budgetAmount,
      });
    });

    // Add committed by package
    contracts.forEach((contract) => {
      const pkgId = contract.packageId;
      if (!packageMap.has(pkgId)) {
        packageMap.set(pkgId, {
          packageId: pkgId,
          packageName: 'Unknown Package',
          budget: 0,
          committed: 0,
          actual: 0,
          budgetLines: [],
        });
      }
      const pkg = packageMap.get(pkgId);
      pkg.committed += Number(contract.value || 0);
    });

    // Add actual by package
    paymentApps.forEach((app) => {
      const pkgId = app.packageId;
      if (!packageMap.has(pkgId)) {
        packageMap.set(pkgId, {
          packageId: pkgId,
          packageName: 'Unknown Package',
          budget: 0,
          committed: 0,
          actual: 0,
          budgetLines: [],
        });
      }
      const pkg = packageMap.get(pkgId);
      const actualAmount = Number(app.certifiedThisPeriod || app.claimedThisPeriod || 0);
      pkg.actual += actualAmount;
    });

    // Calculate totals and variance
    let totalBudget = 0;
    let totalCommitted = 0;
    let totalActual = 0;

    const entries = Array.from(packageMap.values()).map((pkg) => {
      totalBudget += pkg.budget;
      totalCommitted += pkg.committed;
      totalActual += pkg.actual;

      const variance = pkg.budget - pkg.committed;
      const remaining = pkg.budget - pkg.actual;

      return {
        ...pkg,
        variance,
        remaining,
      };
    });

    const totalVariance = totalBudget - totalCommitted;
    const totalRemaining = totalBudget - totalActual;

    res.json({
      projectId,
      totalBudget,
      totalCommitted,
      totalActual,
      totalVariance,
      totalRemaining,
      entries,
      summary: {
        budget: totalBudget,
        committed: totalCommitted,
        actual: totalActual,
        variance: totalVariance,
        remaining: totalRemaining,
      },
    });
  } catch (error) {
    console.error('[CVR Real-time] Error:', error);
    next(error);
  }
});

module.exports = router;
