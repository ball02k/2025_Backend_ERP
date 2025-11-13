/**
 * CVR (Cost Value Reconciliation) Service
 *
 * Provides real-time financial tracking:
 * - Budget: What we planned to spend
 * - Committed: What we've contractually agreed to spend
 * - Actual: What we've actually spent/invoiced
 *
 * CVR Formula: Budget - Committed - Actual = Remaining Budget
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get CVR summary for a project or specific budget line
 * Returns aggregated financial data showing budget vs committed vs actual
 */
async function getCVRSummary(tenantId, projectId, budgetLineId = null) {
  const where = {
    tenantId,
    projectId,
    ...(budgetLineId && { budgetLineId }),
  };

  // Get budget data
  const budgetLines = await prisma.budgetLine.findMany({
    where: budgetLineId ? { id: budgetLineId, tenantId } : { projectId, tenantId },
    select: {
      id: true,
      code: true,
      description: true,
      total: true,
      planned: true,
      estimated: true,
      actual: true,
    },
  });

  const totalBudget = budgetLines.reduce((sum, bl) => sum + Number(bl.total || 0), 0);

  // Get committed amounts (status: COMMITTED)
  const commitments = await prisma.cVRCommitment.findMany({
    where: { ...where, status: 'COMMITTED' },
    select: { amount: true },
  });
  const totalCommitted = commitments.reduce((sum, c) => sum + Number(c.amount), 0);

  // Get actual amounts (status: RECORDED, CERTIFIED, PAID)
  const actuals = await prisma.cVRActual.findMany({
    where: {
      ...where,
      status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
    },
    select: { amount: true },
  });
  const totalActuals = actuals.reduce((sum, a) => sum + Number(a.amount), 0);

  // Calculate remaining and variance
  const remaining = totalBudget - totalCommitted - totalActuals;
  const variance = totalBudget - totalCommitted;
  const percentCommitted = totalBudget > 0 ? (totalCommitted / totalBudget) * 100 : 0;
  const percentActual = totalBudget > 0 ? (totalActuals / totalBudget) * 100 : 0;

  return {
    budget: totalBudget,
    committed: totalCommitted,
    actuals: totalActuals,
    remaining,
    variance,
    percentCommitted,
    percentActual,
    budgetLines: budgetLineId ? budgetLines : undefined,
  };
}

/**
 * Create a CVR commitment record
 * Call this when: Contract signed, Variation approved, PO issued
 */
async function createCommitment({
  tenantId,
  projectId,
  budgetLineId,
  sourceType, // 'CONTRACT' | 'VARIATION' | 'PURCHASE_ORDER'
  sourceId,
  amount,
  description,
  reference,
  costCode,
  effectiveDate,
  createdBy,
}) {
  return await prisma.cVRCommitment.create({
    data: {
      tenantId,
      projectId,
      budgetLineId,
      sourceType,
      sourceId,
      amount,
      currency: 'GBP',
      status: 'COMMITTED',
      description,
      reference,
      costCode,
      effectiveDate,
      createdBy,
    },
  });
}

/**
 * Update commitment status (e.g., when superseded or cancelled)
 */
async function updateCommitmentStatus(id, status, cancelledDate = null) {
  return await prisma.cVRCommitment.update({
    where: { id },
    data: {
      status,
      ...(cancelledDate && { cancelledDate }),
    },
  });
}

/**
 * Create a CVR actual record
 * Call this when: Invoice received, Payment application certified, Payment made
 */
async function createActual({
  tenantId,
  projectId,
  budgetLineId,
  sourceType, // 'INVOICE' | 'PAYMENT_APPLICATION' | 'DIRECT_COST'
  sourceId,
  amount,
  description,
  reference,
  costCode,
  incurredDate,
  certifiedDate,
  paidDate,
  createdBy,
}) {
  // Determine status based on dates
  let status = 'RECORDED';
  if (paidDate) status = 'PAID';
  else if (certifiedDate) status = 'CERTIFIED';

  return await prisma.cVRActual.create({
    data: {
      tenantId,
      projectId,
      budgetLineId,
      sourceType,
      sourceId,
      amount,
      currency: 'GBP',
      status,
      description,
      reference,
      costCode,
      incurredDate,
      certifiedDate,
      paidDate,
      createdBy,
    },
  });
}

/**
 * Update actual status (e.g., when invoice is certified or paid)
 */
async function updateActualStatus(id, status, certifiedDate = null, paidDate = null) {
  return await prisma.cVRActual.update({
    where: { id },
    data: {
      status,
      ...(certifiedDate && { certifiedDate }),
      ...(paidDate && { paidDate }),
    },
  });
}

/**
 * Get commitment breakdown by source type for a project
 */
async function getCommitmentBreakdown(tenantId, projectId) {
  const commitments = await prisma.cVRCommitment.groupBy({
    by: ['sourceType'],
    where: { tenantId, projectId, status: 'COMMITTED' },
    _sum: { amount: true },
    _count: true,
  });

  return commitments.map(c => ({
    sourceType: c.sourceType,
    total: Number(c._sum.amount || 0),
    count: c._count,
  }));
}

/**
 * Get actual breakdown by source type for a project
 */
async function getActualBreakdown(tenantId, projectId) {
  const actuals = await prisma.cVRActual.groupBy({
    by: ['sourceType'],
    where: {
      tenantId,
      projectId,
      status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
    },
    _sum: { amount: true },
    _count: true,
  });

  return actuals.map(a => ({
    sourceType: a.sourceType,
    total: Number(a._sum.amount || 0),
    count: a._count,
  }));
}

/**
 * Get CVR data for all budget lines in a project
 * Returns array of budget lines with their committed and actual amounts
 */
async function getCVRByBudgetLine(tenantId, projectId) {
  const budgetLines = await prisma.budgetLine.findMany({
    where: { tenantId, projectId },
    select: {
      id: true,
      code: true,
      description: true,
      category: true,
      total: true,
      costCode: { select: { code: true, description: true } },
    },
  });

  const results = await Promise.all(
    budgetLines.map(async (bl) => {
      const commitments = await prisma.cVRCommitment.aggregate({
        where: { tenantId, budgetLineId: bl.id, status: 'COMMITTED' },
        _sum: { amount: true },
      });

      const actuals = await prisma.cVRActual.aggregate({
        where: {
          tenantId,
          budgetLineId: bl.id,
          status: { in: ['RECORDED', 'CERTIFIED', 'PAID'] },
        },
        _sum: { amount: true },
      });

      const committed = Number(commitments._sum.amount || 0);
      const actual = Number(actuals._sum.amount || 0);
      const budget = Number(bl.total || 0);
      const remaining = budget - committed - actual;

      return {
        budgetLineId: bl.id,
        code: bl.code,
        description: bl.description,
        category: bl.category,
        costCode: bl.costCode?.code,
        budget,
        committed,
        actual,
        remaining,
        variance: budget - committed,
        percentCommitted: budget > 0 ? (committed / budget) * 100 : 0,
        percentActual: budget > 0 ? (actual / budget) * 100 : 0,
      };
    })
  );

  return results;
}

/**
 * Delete a commitment (e.g., when source is deleted)
 */
async function deleteCommitment(id) {
  return await prisma.cVRCommitment.delete({ where: { id } });
}

/**
 * Delete an actual (e.g., when invoice is reversed)
 */
async function deleteActual(id) {
  return await prisma.cVRActual.delete({ where: { id } });
}

module.exports = {
  getCVRSummary,
  createCommitment,
  updateCommitmentStatus,
  createActual,
  updateActualStatus,
  getCommitmentBreakdown,
  getActualBreakdown,
  getCVRByBudgetLine,
  deleteCommitment,
  deleteActual,
};
