const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// TODO: replace with real auth/tenant resolution middleware
function getTenantId(req) {
  return req.headers["x-tenant-id"] || "demo";
}

router.get("/:id/overview", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true, code: true, name: true, status: true, type: true,
        clientId: true, projectManagerId: true,
        country: true, currency: true, unitSystem: true, taxScheme: true, contractForm: true,
        startPlanned: true, endPlanned: true, startActual: true, endActual: true,
      },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const snap = await prisma.projectSnapshot.findUnique({ where: { projectId } });

    // Next milestones (placeholder: if you have a Milestone table, query top 3 upcoming)
    const nextMilestones = []; // populate when schedule module is ready

    return res.json({
      project,
      widgets: {
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
        },
        tasks: { overdue: snap?.tasksOverdue ?? 0, dueThisWeek: snap?.tasksDueThisWeek ?? 0 },
        rfis: { open: snap?.rfisOpen ?? 0, avgAgeDays: snap?.rfisAvgAgeDays ?? 0 },
        qa: { openNCR: snap?.qaOpenNCR ?? 0, openPunch: snap?.qaOpenPunch ?? 0 },
        hs: { incidentsThisMonth: snap?.hsIncidentsThisMonth ?? 0, openPermits: snap?.hsOpenPermits ?? 0 },
        procurement: { criticalLate: snap?.procurementCriticalLate ?? 0, posOpen: snap?.procurementPOsOpen ?? 0 },
        carbon: { target: snap?.carbonTarget ?? null, toDate: snap?.carbonToDate ?? null, unit: snap?.carbonUnit ?? null },
      },
      quickLinks: {
        contracts: `/api/contracts?projectId=${projectId}`,
        procurement: `/api/procurement?projectId=${projectId}`,
        schedule: `/api/schedule?projectId=${projectId}`,
        documents: `/api/documents?projectId=${projectId}`,
      },
      updatedAt: snap?.updatedAt ?? null,
    });
  } catch (err) {
    console.error("overview error", err);
    res.status(500).json({ error: "Failed to build project overview" });
  }
});

module.exports = router;
