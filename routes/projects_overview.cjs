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

    return res.json({ project: data.project, widgets: data.widgets, quickLinks: data.quickLinks });
  } catch (err) {
    console.error("overview error", err);
    res.status(500).json({ error: "Failed to build project overview" });
  }
});

module.exports = router;
