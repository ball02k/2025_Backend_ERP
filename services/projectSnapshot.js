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

  // RFIs: open and average age (days) for open RFIs (status open|answered)
  let rfisOpen = 0;
  let rfisAvgAgeDays = 0;
  try {
    rfisOpen = await globalPrisma.rfi.count({ where: { projectId, tenantId, isDeleted: false, status: { in: ['open','answered','investigating'] } } });
    const nowMs = Date.now();
    const openRfis = await globalPrisma.rfi.findMany({ where: { projectId, tenantId, isDeleted: false, status: { in: ['open','answered','investigating'] } }, select: { createdAt: true }, take: 500 });
    if (openRfis.length) {
      const sumDays = openRfis.reduce((acc, r) => acc + Math.max(0, (nowMs - new Date(r.createdAt).getTime()) / 86400000), 0);
      rfisAvgAgeDays = Math.round((sumDays / openRfis.length) * 10) / 10;
    }
  } catch (_) {}

  // QA/QC: open records
  let qaOpen = 0;
  try {
    qaOpen = await globalPrisma.qaRecord.count({ where: { projectId, tenantId, isDeleted: false, status: 'open' } });
  } catch (_) {}

  // H&S: incidents this month and open count (mapped to hsOpenPermits for now)
  let hsIncidentsThisMonth = 0;
  let hsOpenCount = 0;
  try {
    const now = new Date();
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    hsIncidentsThisMonth = await globalPrisma.hsEvent.count({ where: { projectId, tenantId, isDeleted: false, type: 'incident', eventDate: { gte: startMonth, lte: endMonth } } });
    hsOpenCount = await globalPrisma.hsEvent.count({ where: { projectId, tenantId, isDeleted: false, status: { in: ['open','investigating'] } } });
  } catch (_) {}

  // Carbon: current month total and YTD total (kgCO2e)
  let carbonMonth = 0;
  let carbonYtd = 0;
  try {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const monthWhere = { tenantId, projectId, isDeleted: false, periodYear: y, periodMonth: m };
    const ytdWhere = { tenantId, projectId, isDeleted: false, periodYear: y };
    const monthAgg = await globalPrisma.carbonEntry.aggregate({ where: monthWhere, _sum: { calculatedKgCO2e: true } });
    const ytdAgg = await globalPrisma.carbonEntry.aggregate({ where: ytdWhere, _sum: { calculatedKgCO2e: true } });
    carbonMonth = Number(monthAgg._sum.calculatedKgCO2e || 0);
    carbonYtd = Number(ytdAgg._sum.calculatedKgCO2e || 0);
  } catch (_) {}

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
      // map new module counts onto existing placeholder fields
      rfisOpen: rfisOpen,
      rfisAvgAgeDays: rfisAvgAgeDays,
      qaOpenNCR: qaOpen,
      qaOpenPunch: 0,
      hsIncidentsThisMonth,
      hsOpenPermits: hsOpenCount,
      carbonToDate: carbonYtd,
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
      rfisOpen: rfisOpen,
      rfisAvgAgeDays: rfisAvgAgeDays,
      qaOpenNCR: qaOpen,
      qaOpenPunch: 0,
      hsIncidentsThisMonth,
      hsOpenPermits: hsOpenCount,
      carbonToDate: carbonYtd,
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
