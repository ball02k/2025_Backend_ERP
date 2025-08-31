const { prisma: globalPrisma } = require("../utils/prisma.cjs");

async function recomputeProjectSnapshot(prisma, { projectId }) {
  const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { tenantId: true } });
  if (!proj) return;
  const tenantId = proj.tenantId;

  const statusesApproved = ["approved", "implemented"];
  const statusesPending = ["proposed", "in_review"];
  const [totalAll, varApproved, varPending, varApprovedValue] = await Promise.all([
    prisma.variation.count({ where: { projectId, tenantId } }),
    prisma.variation.count({ where: { projectId, tenantId, status: { in: statusesApproved } } }),
    prisma.variation.count({ where: { projectId, tenantId, status: { in: statusesPending } } }),
    prisma.variation.aggregate({
      where: { projectId, tenantId, status: { in: statusesApproved } },
      _sum: { value: true },
    }),
  ]);
  const varDraft = Math.max(totalAll - varApproved - varPending, 0);

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
      variationsSubmitted: varPending,
      variationsApproved: varApproved,
      variationsValueApproved: varApprovedValue._sum.value || 0,
      tasksOverdue,
      tasksDueThisWeek,
      schedulePct,
      updatedAt: new Date(),
    },
    create: {
      projectId,
      tenantId,
      variationsDraft: varDraft,
      variationsSubmitted: varPending,
      variationsApproved: varApproved,
      variationsValueApproved: varApprovedValue._sum.value || 0,
      tasksOverdue,
      tasksDueThisWeek,
      schedulePct,
    },
  });
}



async function recomputeProcurement(projectId, tenantId) {
  const now = new Date();
  const [posOpen, criticalLate] = await Promise.all([
    globalPrisma.purchaseOrder.count({ where: { projectId, tenantId, status: "Open" } }),
    globalPrisma.delivery.count({
      where: {
        po: { projectId, tenantId },
        expectedAt: { lt: now },
        receivedAt: null,
      },
    }),
  ]);
  await globalPrisma.projectSnapshot.upsert({
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
    globalPrisma.budgetLine.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId },
    }),
    globalPrisma.commitment.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId, status: "Open" },
    }),
    globalPrisma.actualCost.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId },
    }),
    globalPrisma.forecast.aggregate({
      _sum: { amount: true },
      where: { tenantId, projectId },
    }),
  ]);

  const sums = {
    budget: budget._sum.amount ?? 0,
    committed: committed._sum.amount ?? 0,
    actual: actual._sum.amount ?? 0,
    forecast: forecast._sum.amount ?? 0,
  };

  await globalPrisma.projectSnapshot.updateMany({
    where: { tenantId, projectId },
    data: {
      financialBudget: sums.budget,
      financialCommitted: sums.committed,
      financialActual: sums.actual,
      financialForecast: sums.forecast,
      // legacy fields for compatibility
      budget: sums.budget,
      committed: sums.committed,
      actual: sums.actual,
      forecastAtComplete: sums.forecast,
      updatedAt: now,
    },
  });
}

module.exports = { recomputeProjectSnapshot, recomputeProcurement, recomputeFinancials };
