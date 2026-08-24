/**
 * Enhanced CVR Routes with Role-Aware Value Calculation (Task 4.1)
 *
 * Provides CVR reporting with automatic role detection:
 * - Principal Contractor: Uses applications to client
 * - Subcontractor: Uses certificates from MC
 */

const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  getCVRValueData,
  getValueBreakdown,
  getCVRValueWarnings,
} = require('../services/cvrValueService.cjs');

/**
 * GET /projects/:projectId/cvr/value
 * Get CVR value data (role-aware)
 */
router.get('/projects/:projectId/cvr/value', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : null;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get project for role context
    const project = await prisma.project.findUnique({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        name: true,
        projectRole: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get role-aware value data
    const valueData = await getCVRValueData(tenantId, projectId, asOfDate);

    // Get warnings
    const warnings = getCVRValueWarnings(valueData, project.projectRole);

    res.json({
      projectId,
      projectName: project.name,
      projectRole: project.projectRole,
      asOfDate: asOfDate || new Date(),
      value: valueData,
      warnings,
    });
  } catch (error) {
    console.error('[CVR Value] Error:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/value-breakdown
 * Get detailed breakdown of value sources (applications or certificates)
 */
router.get('/projects/:projectId/cvr/value-breakdown', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get project for role context
    const project = await prisma.project.findUnique({
      where: { id: projectId, tenantId },
      select: {
        projectRole: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get detailed breakdown
    const breakdown = await getValueBreakdown(
      tenantId,
      projectId,
      project.projectRole
    );

    res.json({
      projectRole: project.projectRole,
      source: project.projectRole === 'SUBCONTRACTOR' ? 'certificates' : 'applications',
      items: breakdown,
    });
  } catch (error) {
    console.error('[CVR Value Breakdown] Error:', error);
    next(error);
  }
});

/**
 * GET /projects/:projectId/cvr/report
 * Get complete CVR report with value and cost sections
 */
router.get('/projects/:projectId/cvr/report', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const projectId = Number(req.params.projectId);
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get project with budget
    const project = await prisma.project.findUnique({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        name: true,
        projectRole: true,
        code: true,
        budget: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get role-aware value data
    const valueData = await getCVRValueData(tenantId, projectId, asOfDate);

    // Get cost data (from invoices, POs, etc.)
    const costData = await getCVRCostData(tenantId, projectId, asOfDate);

    // Calculate margins
    const totalValue = valueData.cumulativeCertified + valueData.pendingValue;
    const totalCost = costData.totalCost;
    const grossMargin = totalValue - totalCost;
    const grossMarginPct = totalValue > 0 ? (grossMargin / totalValue) * 100 : 0;

    const netValue = valueData.netValue;
    const netMargin = netValue - totalCost;
    const netMarginPct = netValue > 0 ? (netMargin / netValue) * 100 : 0;

    // Calculate variance from budget
    const budgetValue = Number(project.budget || 0);
    const valueVariance = totalValue - budgetValue;
    const costVariance = totalCost - budgetValue;

    // Get warnings
    const warnings = getCVRValueWarnings(valueData, project.projectRole);

    res.json({
      projectId,
      projectName: project.name,
      projectRole: project.projectRole,
      reportDate: new Date(),
      periodEnd: asOfDate,

      // Value section
      value: {
        source: valueData.source,
        description: valueData.description,
        cumulativeCertified: valueData.cumulativeCertified,
        pendingCertification: valueData.pendingValue,
        totalValue,
        retentionHeld: valueData.retentionHeld,
        netValue: valueData.netValue,
      },

      // Cost section
      cost: costData,

      // Results
      results: {
        grossMargin,
        grossMarginPercentage: grossMarginPct,
        netMargin,
        netMarginPercentage: netMarginPct,
        costToComplete: budgetValue - totalCost,
        projectedFinalMargin: grossMargin, // Simplified - would need forecast
      },

      // Variance
      variance: {
        budgetValue,
        budgetCost: budgetValue,
        budgetMargin: 0, // Assume target margin is 0 unless specified
        valueVariance,
        costVariance,
        marginVariance: grossMargin,
      },

      // Warnings and notes
      warnings,
    });
  } catch (error) {
    console.error('[CVR Report] Error:', error);
    next(error);
  }
});

/**
 * Get CVR cost data (same for both roles)
 * Uses existing invoice/PO data
 */
async function getCVRCostData(tenantId, projectId, asOfDate) {
  const dateFilter = asOfDate ? { lte: asOfDate } : {};

  // Get costs from invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      projectId,
      status: { notIn: ['CANCELLED', 'VOID'] },
      ...(asOfDate && {
        OR: [
          { issueDate: dateFilter },
          { createdAt: dateFilter },
        ],
      }),
    },
    select: {
      gross: true,
      net: true,
    },
  });

  // Calculate cost by category
  // Note: Invoice model doesn't have category field, so all costs go to "other"
  // For proper categorization, would need to use budgetLine or contract relationships
  const costByCategory = {
    labour: 0,
    materials: 0,
    subcontractors: 0,
    plant: 0,
    overheads: 0,
    other: 0,
  };

  invoices.forEach((inv) => {
    const amount = Number(inv.gross || inv.net || 0);
    // Without category field, put all costs in "other" for now
    costByCategory.other += amount;
  });

  const totalCost = Object.values(costByCategory).reduce((sum, val) => sum + val, 0);

  return {
    ...costByCategory,
    totalCost,
  };
}

module.exports = router;
