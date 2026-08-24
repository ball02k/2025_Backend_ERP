const express = require('express');
const router = express.Router();
const { prisma, Prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const {
  evaluateBudgetLinesLock,
  evaluatePackageLock,
  enforceDecision,
  sendCommercialLock,
} = require('../services/commercialLockService.cjs');

// POST /api/projects/:projectId/packages:seed
// Body: { mode: 'group' | 'prefix', prefixes: { '01-': 'Package A', '02-': 'Package B' } }
router.post('/projects/:projectId/packages:seed', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const projectId = Number(req.params.projectId);
    const { mode = 'group', prefixes = {}, only = [] } = req.body || {};

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    // Load all budget lines with cost code and group name (if any)
    const budgets = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        description: true,
        total: true,
        group: { select: { name: true } },
        costCodeId: true,
        costCode: { select: { id: true, code: true, description: true } },
      },
      orderBy: [{ id: 'asc' }],
    });

    const budgetIds = budgets.map((budget) => Number(budget.id)).filter(Number.isFinite);
    const existingPackageItems = budgetIds.length
      ? await prisma.packageItem.findMany({
          where: {
            tenantId,
            budgetLineId: { in: budgetIds },
            package: { projectId },
          },
          select: { budgetLineId: true },
        }).catch(() => [])
      : [];
    const alreadyLinkedBudgetIds = new Set(existingPackageItems.map((item) => Number(item.budgetLineId)));

    // Group lines
    const groups = new Map(); // name -> array of lines
    for (const b of budgets) {
      if (alreadyLinkedBudgetIds.has(Number(b.id))) continue;

      let key;
      let meta = {};
      if (String(mode) === 'prefix') {
        const code = b.costCode?.code || '';
        const suppliedPrefixes = Object.keys(prefixes || {});
        const match = suppliedPrefixes.find((p) => code.startsWith(p));
        if (suppliedPrefixes.length > 0) {
          key = match ? String(prefixes[match]) : 'Other';
        } else if (code) {
          key = b.costCode?.description
            ? `${code} - ${b.costCode.description}`
            : code;
        } else {
          key = 'Uncoded';
        }
        meta = {
          trade: b.costCode?.description || null,
          costCodeId: b.costCodeId || b.costCode?.id || null,
          scopeSummary: code ? `Budget package seeded from cost code ${code}.` : 'Budget package seeded from uncoded budget lines.',
        };
      } else {
        key = b.group?.name || 'Ungrouped';
        meta = {
          trade: key === 'Ungrouped' ? null : key,
          costCodeId: null,
          scopeSummary: `Budget package seeded from budget group ${key}.`,
        };
      }
      if (String(mode) === 'group' && only.length > 0 && !only.includes(key)) {
        continue;
      }
      if (!groups.has(key)) groups.set(key, { lines: [], meta });
      groups.get(key).lines.push(b);
    }

    // Create packages + join items
    const created = [];
    const reused = [];
    for (const [name, group] of groups.entries()) {
      const lines = group.lines || [];
      if (!lines.length) continue;
      const budgetAmount = lines.reduce(
        (sum, line) => sum.plus(line.total || 0),
        new Prisma.Decimal(0),
      );

      const pkg = await prisma.$transaction(async (tx) => {
        const lineIds = lines.map((line) => Number(line.id)).filter(Number.isFinite);
        const budgetDecision = await evaluateBudgetLinesLock({
          prisma: tx,
          tenantId,
          projectId,
          budgetLineIds: lineIds,
          action: 'package_seed',
          proposedChanges: { amount: true },
        });
        await enforceDecision(req, 'BudgetLine', lineIds.join(','), 'package_seed.link_budget_lines', budgetDecision);

        let packageRow = await tx.package.findFirst({
          where: { projectId, name: String(name) },
          select: { id: true, name: true },
        });

        if (!packageRow) {
          packageRow = await tx.package.create({
            data: {
              projectId,
              name: String(name),
              scopeSummary: group.meta?.scopeSummary || null,
              trade: group.meta?.trade || null,
              tradeCategory: group.meta?.trade || null,
              costCodeId: group.meta?.costCodeId || null,
              budgetEstimate: budgetAmount,
              budgetValue: budgetAmount,
              estimatedValue: budgetAmount,
              currency: 'GBP',
              status: 'Draft',
            },
            select: { id: true, name: true },
          });
        } else {
          const packageDecision = await evaluatePackageLock({
            prisma: tx,
            tenantId,
            projectId,
            packageId: packageRow.id,
            action: 'package_seed_extend',
            proposedChanges: { budgetEstimate: true },
          });
          await enforceDecision(req, 'Package', packageRow.id, 'package_seed.extend_package', packageDecision);

          reused.push(packageRow.id);
          await tx.package.update({
            where: { id: packageRow.id },
            data: {
              budgetEstimate: { increment: budgetAmount },
              budgetValue: { increment: budgetAmount },
              estimatedValue: { increment: budgetAmount },
            },
          }).catch(() => null);
        }

        await tx.packageItem.createMany({
          data: lines.map((l) => ({
            tenantId,
            packageId: packageRow.id,
            budgetLineId: Number(l.id),
          })),
        });

        return packageRow;
      });

      created.push({
        id: pkg.id,
        name: pkg.name,
        count: lines.length,
        budgetAmount: budgetAmount.toNumber(),
      });
    }

    return res.json({
      createdCount: created.length,
      packages: created,
      skippedLinkedCount: alreadyLinkedBudgetIds.size,
      reusedPackageCount: new Set(reused).size,
    });
  } catch (e) {
    if (sendCommercialLock(res, e)) return;
    console.error('[packages:seed]', e);
    res.status(500).json({ error: 'Failed to seed packages' });
  }
});

module.exports = router;
