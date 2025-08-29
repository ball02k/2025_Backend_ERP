const express = require("express");
const router = express.Router();
const { prisma, Prisma, dec } = require("../utils/prisma.cjs");
const { recomputeProjectSnapshot } = require("../services/projectSnapshot");
const { requireProjectMember } = require("../middleware/membership.cjs");
const DEV = process.env.NODE_ENV !== "production";

function parseNumber(n, fallback = null) {
  if (n === undefined || n === null || n === "") return fallback;
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

async function loadVariation(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const variation = await prisma.variation.findFirst({ where: { id, tenantId } });
    if (!variation) return res.status(404).json({ error: "Not found" });
    req.variation = variation;
    req.params.projectId = String(variation.projectId);
    next();
  } catch (e) {
    next(e);
  }
}

// LIST
// LIST (project-scoped)
router.get("/", requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const {
      projectId,
      status,
      type,
      q,
      limit = 20,
      offset = 0,
    } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const where = { tenantId, projectId: Number(projectId) };
    if (status) where.status = String(status);
    if (type) where.type = String(type);
    if (q) {
      where.OR = [
        { title: { contains: String(q), mode: "insensitive" } },
        { reference: { contains: String(q), mode: "insensitive" } },
        { reason: { contains: String(q), mode: "insensitive" } },
        { notes: { contains: String(q), mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.variation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: Number(offset) || 0,
        take: Number(limit) || 20,
        select: {
          id: true,
          projectId: true,
          tenantId: true,
          title: true,
          reference: true,
          contractType: true,
          status: true,
          type: true,
          reason: true,
          submissionDate: true,
          decisionDate: true,
          value: true,
          costImpact: true,
          timeImpactDays: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.variation.count({ where }),
    ]);

    return res.json({
      data: rows,
      meta: { total, limit: Number(limit), offset: Number(offset) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch variations",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// DETAIL
router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.variation.findFirst({
      where: { id, tenantId },
      include: { lines: { orderBy: { sort: "asc" } } },
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    // Enforce membership: check project membership by projectId
    const membership = await prisma.projectMembership.findFirst({
      where: { tenantId, projectId: row.projectId, userId: Number(req.user.id) },
      select: { id: true },
    });
    if (!membership) return res.status(403).json({ error: "Forbidden" });
    res.json({ data: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// CREATE
router.post("/", requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const body = { ...req.body };
    const {
      projectId,
      title,
      reference,
      contractType,
      type,
      status,
      reason,
      submissionDate,
      decisionDate,
      value,
      costImpact,
      timeImpactDays,
      notes,
      lines = [],
    } = body || {};

    if (!projectId || !title || !type || !contractType || value == null || costImpact == null) {
      return res.status(400).json({
        error: "projectId, title, type, contractType, value, costImpact are required",
      });
    }

    const resolvedStatus = status || "proposed";

    const created = await prisma.variation.create({
      data: {
        tenantId,
        projectId: Number(projectId),
        reference: reference || null,
        title,
        contractType: String(contractType),
        type: String(type),
        status: String(resolvedStatus),
        reason: reason || null,
        submissionDate: submissionDate ? new Date(submissionDate) : null,
        decisionDate: decisionDate ? new Date(decisionDate) : null,
        value: dec(parseNumber(value, 0) ?? 0),
        costImpact: dec(parseNumber(costImpact, 0) ?? 0),
        timeImpactDays: parseNumber(timeImpactDays, null),
        notes: notes || null,
        lines: lines?.length
          ? {
              create: lines.map((L) => ({
                tenantId,
                description: L.description,
                qty: dec(parseNumber(L.qty, 0) ?? 0),
                rate: dec(parseNumber(L.rate, 0) ?? 0),
                value: dec(parseNumber(L.value, 0) ?? 0),
                sort: Number(L.sort || 0),
              })),
            }
          : undefined,
      },
      include: { lines: true },
    });

    await recomputeProjectSnapshot(Number(created.projectId), tenantId);
    res.status(201).json({ data: created });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      error: err.message || "Failed to create variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// UPDATE
router.put("/:id", loadVariation, requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const existing = req.variation;
    const id = existing.id;

    const body = { ...req.body };
    const {
      title,
      reference,
      contractType,
      type,
      status,
      reason,
      submissionDate,
      decisionDate,
      value,
      costImpact,
      timeImpactDays,
      notes,
      lines,
    } = body || {};

    const updated = await prisma.$transaction(async (tx) => {
      if (Array.isArray(lines)) {
        await tx.variationLine.deleteMany({ where: { tenantId, variationId: id } });
      }

      const upd = await tx.variation.update({
        where: { id, tenantId },
        data: {
          reference: reference ?? existing.reference,
          title: title ?? existing.title,
          contractType: contractType ?? existing.contractType,
          type: type ?? existing.type,
          status: status ?? existing.status,
          reason: reason ?? existing.reason,
          submissionDate: submissionDate ? new Date(submissionDate) : existing.submissionDate,
          decisionDate: decisionDate ? new Date(decisionDate) : existing.decisionDate,
          value: value != null ? dec(parseNumber(value, 0) ?? 0) : existing.value,
          costImpact: costImpact != null ? dec(parseNumber(costImpact, 0) ?? 0) : existing.costImpact,
          timeImpactDays: timeImpactDays != null ? Number(timeImpactDays) : existing.timeImpactDays,
          notes: notes ?? existing.notes,
          ...(Array.isArray(lines) && lines.length
            ? {
                lines: {
                  create: lines.map((L) => ({
                    tenantId,
                    description: L.description,
                    qty: dec(parseNumber(L.qty, 0) ?? 0),
                    rate: dec(parseNumber(L.rate, 0) ?? 0),
                    value: dec(parseNumber(L.value, 0) ?? 0),
                    sort: Number(L.sort || 0),
                  })),
                },
              }
            : {}),
        },
        include: { lines: true },
      });

      return upd;
    });

    await recomputeProjectSnapshot(Number(updated.projectId), tenantId);
    if (updated.projectId !== existing.projectId) {
      await recomputeProjectSnapshot(Number(existing.projectId), tenantId);
    }

    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      error: err.message || "Failed to update variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// STATUS CHANGE
// Simple status update (optional)
router.patch("/:id/status", loadVariation, requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = req.variation.id;
    const existing = req.variation;
    const { toStatus } = req.body || {};
    if (!toStatus) return res.status(400).json({ error: "toStatus is required" });

    const updatedMany = await prisma.variation.updateMany({
      where: { id, tenantId },
      data: { status: String(toStatus) },
    });
    const updated =
      updatedMany.count > 0
        ? await prisma.variation.findFirst({ where: { id, tenantId } })
        : null;
    await recomputeProjectSnapshot(Number(existing.projectId), tenantId);
    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to change status", details: DEV ? String(err.message) : undefined });
  }
});

// SOFT DELETE
router.delete("/:id", loadVariation, requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const existing = req.variation;
    const id = existing.id;
    // Use deleteMany to enforce tenant scoping in where
    const result = await prisma.variation.deleteMany({ where: { id, tenantId } });
    const deleted = result.count > 0 ? existing : null;

    await recomputeProjectSnapshot(Number(existing.projectId), tenantId);
    res.json({ data: deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to delete variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

module.exports = router;
