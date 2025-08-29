// Build Project Overview payload shared between routes
// Usage: await buildProjectOverview(prisma, { tenantId, projectId })

async function buildProjectOverview(prisma, { tenantId, projectId }) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      type: true,
      clientId: true,
      projectManagerId: true,
      country: true,
      currency: true,
      unitSystem: true,
      taxScheme: true,
      contractForm: true,
      startPlanned: true,
      endPlanned: true,
      startActual: true,
      endActual: true,
      client: { select: { id: true, name: true } },
    },
  });
  if (!project) return null;

  const snap = await prisma.projectSnapshot.findUnique({ where: { projectId } });

  const nextMilestones = [];

  const widgets = {
    financial: {
      budget: snap?.budget ?? null,
      committed: snap?.committed ?? null,
      actual: snap?.actual ?? null,
      retentionHeld: snap?.retentionHeld ?? null,
      forecastAtComplete: snap?.forecastAtComplete ?? null,
      variance: snap?.variance ?? null,
    },
    schedule: {
      percentComplete: snap?.schedulePct ?? 0,
      criticalActivitiesAtRisk: snap?.criticalAtRisk ?? 0,
      nextMilestones,
    },
    variations: {
      draft: snap?.variationsDraft ?? 0,
      submitted: snap?.variationsSubmitted ?? 0,
      approved: snap?.variationsApproved ?? 0,
      valueApproved: snap?.variationsValueApproved ?? 0,
      total:
        (snap?.variationsDraft ?? 0) +
        (snap?.variationsSubmitted ?? 0) +
        (snap?.variationsApproved ?? 0),
      pending: snap?.variationsSubmitted ?? 0,
    },
    tasks: { overdue: snap?.tasksOverdue ?? 0, dueThisWeek: snap?.tasksDueThisWeek ?? 0 },
    rfis: { open: snap?.rfisOpen ?? 0, avgAgeDays: snap?.rfisAvgAgeDays ?? 0 },
    qa: { openNCR: snap?.qaOpenNCR ?? 0, openPunch: snap?.qaOpenPunch ?? 0 },
    hs: { incidentsThisMonth: snap?.hsIncidentsThisMonth ?? 0, openPermits: snap?.hsOpenPermits ?? 0 },
    procurement: { criticalLate: snap?.procurementCriticalLate ?? 0, posOpen: snap?.procurementPOsOpen ?? 0 },
    carbon: { target: snap?.carbonTarget ?? null, toDate: snap?.carbonToDate ?? null, unit: snap?.carbonUnit ?? null },
  };

  if (widgets?.schedule) {
    widgets.schedule.pct = widgets.schedule.pct ?? widgets.schedule.percentComplete ?? 0;
    widgets.schedule.criticalAtRisk =
      widgets.schedule.criticalAtRisk ?? widgets.schedule.criticalActivitiesAtRisk ?? 0;
  }

  return {
    project,
    widgets,
    quickLinks: {
      contracts: `/api/contracts?projectId=${projectId}`,
      procurement: `/api/procurement?projectId=${projectId}`,
      schedule: `/api/schedule?projectId=${projectId}`,
      documents: `/api/documents?projectId=${projectId}`,
    },
    updatedAt: snap?.updatedAt ?? null,
  };
}

module.exports = { buildProjectOverview };
