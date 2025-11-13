const express = require("express");
const router = express.Router();
const { prisma } = require("../utils/prisma.cjs");
const { requireProjectMember } = require("../middleware/membership.cjs");
const { buildProjectOverview } = require("../services/projectOverview");

router.get("/:id/overview", requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const data = await buildProjectOverview(prisma, { tenantId, projectId });
    if (!data) return res.status(404).json({ error: "PROJECT_NOT_FOUND" });

    // Include updatedAt for FE components that display freshness
    const v2 = data.overviewV2 || {};
    return res.json({
      // New overview shape (additive)
      id: v2.id,
      code: v2.code,
      name: v2.name,
      status: v2.status,
      links: v2.links || data.links || [],
      widgets: v2.widgets || data.widgets,
      tables: v2.tables || undefined,
      health: v2.health || undefined,

      // Back-compat fields
      project: data.project,
      quickLinks: data.quickLinks,
      trendsSummary: data.trendsSummary,
      updatedAt: data.updatedAt ?? null,
    });
  } catch (err) {
    console.error("overview error", err);
    res.status(500).json({ error: "Failed to build project overview" });
  }
});

module.exports = router;
