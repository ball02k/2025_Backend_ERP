const { prisma } = require("../utils/prisma.cjs");

async function recomputeProjectSnapshot(projectId, tenantId) {
  // Variations
  const [varDraft, varSubmitted, varApproved, varApprovedValue] = await Promise.all([
    prisma.variation.count({ where: { projectId, tenantId, status: "draft", is_deleted: false } }),
    prisma.variation.count({ where: { projectId, tenantId, status: "submitted", is_deleted: false } }),
    prisma.variation.count({ where: { projectId, tenantId, status: "approved", is_deleted: false } }),
    prisma.variation.aggregate({
      where: { projectId, tenantId, status: "approved", is_deleted: false },
      _sum: { agreed_sell: true },
    }),
  ]);

  // Tasks
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const [tasksOverdue, tasksDueThisWeek, openTasks, totalTasks] = await Promise.all([
    prisma.task.count({ where: { projectId, tenantId, status: { not: "Done" }, dueDate: { lt: now } } }),
    prisma.task.count({ where: { projectId, tenantId, status: { not: "Done" }, dueDate: { gte: now, lte: weekFromNow } } }),
    prisma.task.count({ where: { projectId, tenantId, status: { not: "Done" } } }),
    prisma.task.count({ where: { projectId, tenantId } }),
  ]);
  const schedulePct = totalTasks > 0 ? Math.round(((totalTasks - openTasks) / totalTasks) * 100) : 0;

  await prisma.projectSnapshot.upsert({
    where: { projectId },
    update: {
      tenantId,
      variationsDraft: varDraft,
      variationsSubmitted: varSubmitted,
      variationsApproved: varApproved,
      variationsValueApproved: varApprovedValue._sum.agreed_sell || 0,
      tasksOverdue,
      tasksDueThisWeek,
      schedulePct,
      updatedAt: new Date(),
    },
    create: {
      projectId,
      tenantId,
      variationsDraft: varDraft,
      variationsSubmitted: varSubmitted,
      variationsApproved: varApproved,
      variationsValueApproved: varApprovedValue._sum.agreed_sell || 0,
      tasksOverdue,
      tasksDueThisWeek,
      schedulePct,
    },
  });
}



async function recomputeProcurement(projectId, tenantId) {
  const now = new Date();
  const [posOpen, criticalLate] = await Promise.all([
    prisma.purchaseOrder.count({ where: { projectId, tenantId, status: "Open" } }),
    prisma.delivery.count({
      where: {
        po: { projectId, tenantId },
        expectedAt: { lt: now },
        receivedAt: null,
      },
    }),
  ]);
  await prisma.projectSnapshot.upsert({
    where: { projectId },
    update: {
      tenantId,
      procurementPOsOpen: posOpen,
      procurementCriticalLate: criticalLate,
      updatedAt: new Date(),
    },
    create: {
      projectId,
      tenantId,
      procurementPOsOpen: posOpen,
      procurementCriticalLate: criticalLate,
    },
  });
}

async function recomputeFinancials(projectId, tenantId) {
  const now = new Date();

  const [budget, committed, actual, forecast] = await Promise.all([
    prisma.budgetLine.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId },
    }),
    prisma.commitment.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId, status: "Open" },
    }),
    prisma.actualCost.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId },
    }),
    prisma.forecast.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId },
    }),
  ]);

  await prisma.projectSnapshot.updateMany({
    where: { tenantId, projectId },
    data: {
      financialBudget: budget._sum.amount ?? 0,
      financialCommitted: committed._sum.amount ?? 0,
      financialActual: actual._sum.amount ?? 0,
      financialForecast: forecast._sum.amount ?? 0,
      updatedAt: now,
    },
  });
}

module.exports = { recomputeProjectSnapshot, recomputeProcurement, recomputeFinancials };
