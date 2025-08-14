const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Utility coercers
const asInt = (v) => (v == null ? null : Number(v));
const asDec = (v) => (v == null ? null : v); // Prisma Decimal keeps precision

async function recomputeProjectSnapshot(projectId, tenantId) {
  // Variations aggregates
  const [varDraft, varSubmitted, varApproved, varApprovedValue] = await Promise.all([
    prisma.variation.count({ where: { projectId, tenantId, status: "draft", is_deleted: false } }),
    prisma.variation.count({ where: { projectId, tenantId, status: "submitted", is_deleted: false } }),
    prisma.variation.count({ where: { projectId, tenantId, status: "approved", is_deleted: false } }),
    prisma.variation.aggregate({
      where: { projectId, tenantId, status: "approved", is_deleted: false },
      _sum: { agreed_sell: true },
    }),
  ]);

  // Tasks aggregates (example overdue vs this week)
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [tasksOverdue, tasksDueThisWeek] = await Promise.all([
    prisma.task.count({
      where: {
        projectId,
        tenantId,
        statusRel: { key: { not: "DONE" } },
        dueDate: { lt: now },
      },
    }),
    prisma.task.count({
      where: {
        projectId,
        tenantId,
        statusRel: { key: { not: "DONE" } },
        dueDate: { gte: now, lte: weekFromNow },
      },
    }),
  ]);

  // Schedule percent complete (placeholder: derive from tasks)
  const [openTasks, totalTasks] = await Promise.all([
    prisma.task.count({ where: { projectId, tenantId, statusRel: { key: { not: "DONE" } } } }),
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

module.exports = { recomputeProjectSnapshot };
