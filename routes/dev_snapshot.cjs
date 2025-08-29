const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { recomputeProjectSnapshot } = require("../services/projectSnapshot");

function getTenantId(req) { return (req.user && req.user.tenantId) || "demo"; }

router.post("/recompute/:projectId", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    await recomputeProjectSnapshot(projectId, tenantId);
    const snap = await prisma.projectSnapshot.findUnique({ where: { projectId } });
    res.json({ ok: true, snapshot: snap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "recompute failed" });
  }
});

module.exports = router;
