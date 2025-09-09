// Build Project Overview payload shared between routes
// Usage: await buildProjectOverview(prisma, { tenantId, projectId })

const { linkOf } = require('../lib/links.cjs');

async function buildProjectOverview(prisma, { tenantId, projectId }) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      type: true,
      statusId: true,
      typeId: true,
      statusRel: { select: { id: true, key: true, label: true, colorHex: true } },
      typeRel: { select: { id: true, key: true, label: true, colorHex: true } },
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

  // Provide FE-friendly aliases
  const projectOut = {
    ...project,
    clientName: project.client ? project.client.name : null,
  };

  // Snapshot is optional in some tenant setups; tolerate missing table
  let snap = null;
  try {
    snap = await prisma.projectSnapshot.findUnique({ where: { projectId } });
  } catch (e) {
    if (!(e && e.code === 'P2021')) throw e; // table missing; continue with null snapshot
  }

  const nextMilestones = [];

  const widgets = {
    financial: {
      budget: (snap?.financialBudget ?? snap?.budget) ?? null,
      committed: (snap?.financialCommitted ?? snap?.committed) ?? null,
      actual: (snap?.financialActual ?? snap?.actual) ?? null,
      retentionHeld: snap?.retentionHeld ?? null,
      forecastAtComplete: (snap?.financialForecast ?? snap?.forecastAtComplete) ?? null,
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

  // Lightweight 30-day summary (counts and sums) for dashboard sparklines
  const since = new Date(); since.setDate(since.getDate() - 29);

  // Helpers to safely query optional modules (tables may not exist in some deployments)
  const safeCount = (promise) => promise.catch((e) => (e && e.code === 'P2021' ? 0 : Promise.reject(e)));
  const safeAggregateSum = (promise, key) =>
    promise
      .then((res) => Number((res && res._sum && res._sum[key]) || 0))
      .catch((e) => (e && e.code === 'P2021' ? 0 : Promise.reject(e)));

  const [rfis30, qa30, hs30, carbonKg, poAmount] = await Promise.all([
    safeCount(prisma.rfi.count({ where: { tenantId, projectId, createdAt: { gte: since } } })),
    safeCount(prisma.qaRecord.count({ where: { tenantId, projectId, createdAt: { gte: since } } })),
    safeCount(prisma.hsEvent.count({ where: { tenantId, projectId, eventDate: { gte: since } } })),
    safeAggregateSum(
      prisma.carbonEntry.aggregate({ where: { tenantId, projectId, activityDate: { gte: since } }, _sum: { calculatedKgCO2e: true } }),
      'calculatedKgCO2e'
    ),
    safeAggregateSum(
      prisma.purchaseOrder.aggregate({ where: { tenantId, projectId, orderDate: { gte: since } }, _sum: { total: true } }),
      'total'
    ),
  ]);

  const trendsSummary = {
    days: 30,
    rfisCreated: rfis30,
    qaCreated: qa30,
    hsEvents: hs30,
    carbonKg,
    poAmount,
  };

  // Related entities (lightweight lists + standardized link DTOs)
  const [packages, pos, variations, invitedSuppliers] = await Promise.all([
    prisma.package
      .findMany({
        where: { projectId, project: { tenantId } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, name: true, status: true },
      })
      .catch(() => []),
    prisma.purchaseOrder
      .findMany({
        where: { tenantId, projectId },
        orderBy: { orderDate: 'desc' },
        take: 6,
        select: { id: true, code: true, supplier: true, status: true },
      })
      .catch(() => []),
    prisma.variation
      .findMany({
        where: { tenantId, projectId, deletedAt: null, NOT: { status: 'Approved' } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, title: true, status: true },
      })
      .catch(() => []),
    prisma.tenderInvite
      .findMany({
        where: { package: { projectId, project: { tenantId } } },
        take: 8,
        select: { supplierId: true, supplier: { select: { id: true, name: true } } },
        orderBy: { invitedAt: 'desc' },
      })
      .catch(() => []),
  ]);

  // Build standardized links
  const links = [];
  if (projectOut.clientId && project.client) {
    links.push(linkOf('client', projectOut.clientId, project.client.name));
  }
  for (const p of packages) {
    links.push(linkOf('package', p.id, p.name, { projectId }));
    // Synthetic RFx link per package (maps to FE tender view)
    links.push(linkOf('rfx', p.id, `RFx: ${p.name}`, { projectId }));
  }
  for (const po of pos) {
    links.push(linkOf('po', po.id, `PO ${po.code}`));
  }
  for (const v of variations) {
    links.push(linkOf('variation', v.id, v.title, { projectId }));
  }
  // Key suppliers (unique by id)
  const supSeen = new Set();
  for (const inv of invitedSuppliers) {
    const sid = inv?.supplier?.id;
    if (sid && !supSeen.has(sid)) {
      supSeen.add(sid);
      links.push(linkOf('supplier', sid, inv.supplier.name));
    }
  }

  return {
    project: projectOut,
    widgets,
    trendsSummary,
    quickLinks: {
      contracts: `/api/contracts?projectId=${projectId}`,
      procurement: `/api/procurement?projectId=${projectId}`,
      schedule: `/api/schedule?projectId=${projectId}`,
      documents: `/api/documents?projectId=${projectId}`,
    },
    links,
    updatedAt: snap?.updatedAt ?? null,
  };
}

module.exports = { buildProjectOverview };
