const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const DEV = process.env.NODE_ENV !== "production";

// Allowed workflow transitions
const ALLOWED = {
  draft: ["submitted", "deleted"],
  submitted: ["under_review", "draft"],
  under_review: ["approved", "rejected"],
  approved: ["instructed", "priced", "agreed", "vo_issued"],
  rejected: [],
  instructed: ["priced", "agreed", "vo_issued"],
  priced: ["agreed", "vo_issued"],
  agreed: ["vo_issued"],
  vo_issued: ["vo_accepted"],
  vo_accepted: [],
};

function canTransition(from, to) {
  if (from === to) return true;
  const next = ALLOWED[from] || [];
  return next.includes(to);
}

function parseNumber(n, fallback = null) {
  if (n === undefined || n === null || n === "") return fallback;
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

// Optional lookup resolver. Works only if a LookupValue model exists with { id, category, key }.
// If not present, it safely falls back to provided strings.
async function resolveLookupKey(category, id, fallback) {
  if (!id) return fallback ?? null;
  try {
    const hasModel =
      prisma.lookupValue && typeof prisma.lookupValue.findFirst === "function";
    if (!hasModel) return fallback ?? null;

    const lv = await prisma.lookupValue.findFirst({
      where: { id: Number(id), category: String(category) },
      select: { key: true },
    });
    return lv?.key ?? fallback ?? null;
  } catch {
    return fallback ?? null;
  }
}

// Helper to compute totals on detail reads
function computeTotals(row) {
  const hasLines = Array.isArray(row?.lines) && row.lines.length > 0;
  if (hasLines) {
    let cost = 0;
    let sell = 0;
    for (const L of row.lines) {
      const qty = Number(L.qty ?? 0);
      const unit_cost = Number(L.unit_cost ?? 0);
      const unit_sell = Number(L.unit_sell ?? 0);
      cost += qty * unit_cost;
      sell += qty * unit_sell;
    }
    return {
      lines_cost: Number(cost.toFixed(2)),
      lines_sell: Number(sell.toFixed(2)),
      margin: Number((sell - cost).toFixed(2)),
    };
  }
  const estCost = Number(row?.estimated_cost ?? 0);
  const estSell = Number(row?.estimated_sell ?? 0);
  return {
    lines_cost: estCost,
    lines_sell: estSell,
    margin: Number((estSell - estCost).toFixed(2)),
  };
}

// LIST
router.get("/", async (req, res) => {
  try {
    const { projectId, status, type, q, limit = 20, offset = 0 } = req.query;
    const where = { is_deleted: false };
    if (projectId) where.projectId = Number(projectId);
    if (status) where.status = String(status);
    if (type) where.type = String(type);
    if (q) {
      where.OR = [
        { title: { contains: String(q), mode: "insensitive" } },
        { referenceCode: { contains: String(q), mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.variation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: Number(offset) || 0,
        take: Number(limit) || 20,
        include: {
          project: {
            select: {
              id: true,
              code: true,
              name: true,
              statusId: true,
              typeId: true,
            },
          },
        },
      }),
      prisma.variation.count({ where }),
    ]);

    res.json({
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
    const id = Number(req.params.id);
    const row = await prisma.variation.findFirst({
      where: { id, is_deleted: false },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            statusId: true,
            typeId: true,
          },
        },
        lines: true,
        statusHistory: { orderBy: { changedAt: "asc" } },
      },
    });
    if (!row) return res.status(404).json({ error: "Not found" });

    const totals = computeTotals(row);
    res.json({ data: { ...row, totals } });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// CREATE
router.post("/", async (req, res) => {
  try {
    const {
      projectId,
      referenceCode,
      title,
      description,
      type,
      typeLookupId,
      status = "draft",
      statusLookupId,
      reason_code,
      reasonLookupId,
      estimated_cost,
      estimated_sell,
      agreed_cost,
      agreed_sell,
      notifiedDate,
      submittedDate,
      reviewedDate,
      approvedDate,
      rejectedDate,
      instructedDate,
      pricedDate,
      agreedDate,
      voIssuedDate,
      voAcceptedDate,
      lines = [],
    } = req.body || {};

    if (!projectId || !title || !(type || typeLookupId)) {
      return res.status(400).json({
        error: "projectId, title, and type (or typeLookupId) are required",
      });
    }

    const typeKey = await resolveLookupKey("variation.type", typeLookupId, type);
    const statusKey = await resolveLookupKey(
      "variation.status",
      statusLookupId,
      status || "draft"
    );
    const reasonKey = await resolveLookupKey(
      "variation.reason",
      reasonLookupId,
      reason_code
    );

    const created = await prisma.variation.create({
      data: {
        projectId: Number(projectId),
        referenceCode: referenceCode || null,
        title,
        description: description || null,
        type: String(typeKey),
        status: String(statusKey),
        reason_code: reasonKey || null,
        estimated_cost: estimated_cost ?? null,
        estimated_sell: estimated_sell ?? null,
        agreed_cost: agreed_cost ?? null,
        agreed_sell: agreed_sell ?? null,
        notifiedDate: notifiedDate ? new Date(notifiedDate) : null,
        submittedDate: submittedDate ? new Date(submittedDate) : null,
        reviewedDate: reviewedDate ? new Date(reviewedDate) : null,
        approvedDate: approvedDate ? new Date(approvedDate) : null,
        rejectedDate: rejectedDate ? new Date(rejectedDate) : null,
        instructedDate: instructedDate ? new Date(instructedDate) : null,
        pricedDate: pricedDate ? new Date(pricedDate) : null,
        agreedDate: agreedDate ? new Date(agreedDate) : null,
        voIssuedDate: voIssuedDate ? new Date(voIssuedDate) : null,
        voAcceptedDate: voAcceptedDate ? new Date(voAcceptedDate) : null,
        lines: lines?.length
          ? {
              create: lines.map((L) => ({
                cost_code: L.cost_code || null,
                description: L.description,
                qty: new prisma.Prisma.Decimal(parseNumber(L.qty, 0) ?? 0),
                unit: L.unit || null,
                unit_cost: new prisma.Prisma.Decimal(parseNumber(L.unit_cost, 0) ?? 0),
                unit_sell:
                  L.unit_sell != null
                    ? new prisma.Prisma.Decimal(parseNumber(L.unit_sell, 0) ?? 0)
                    : null,
              })),
            }
          : undefined,
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: String(statusKey || "draft"), note: "created" },
          ],
        },
      },
      include: { lines: true, statusHistory: true },
    });

    res.status(201).json({ data: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to create variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.variation.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const {
      referenceCode,
      title,
      description,
      type,
      typeLookupId,
      status,
      statusLookupId,
      reason_code,
      reasonLookupId,
      estimated_cost,
      estimated_sell,
      agreed_cost,
      agreed_sell,
      notifiedDate,
      submittedDate,
      reviewedDate,
      approvedDate,
      rejectedDate,
      instructedDate,
      pricedDate,
      agreedDate,
      voIssuedDate,
      voAcceptedDate,
      lines,
    } = req.body || {};

    const updated = await prisma.$transaction(async (tx) => {
      if (Array.isArray(lines)) {
        await tx.variationLine.deleteMany({ where: { variationId: id } });
      }

      const typeKey = await resolveLookupKey(
        "variation.type",
        typeLookupId,
        type ?? existing.type
      );
      const statusKey = await resolveLookupKey(
        "variation.status",
        statusLookupId,
        status ?? existing.status
      );
      const reasonKey = await resolveLookupKey(
        "variation.reason",
        reasonLookupId,
        reason_code ?? existing.reason_code
      );

      const upd = await tx.variation.update({
        where: { id },
        data: {
          referenceCode: referenceCode ?? existing.referenceCode,
          title: title ?? existing.title,
          description: description ?? existing.description,
          type: String(typeKey),
          status: String(statusKey),
          reason_code: reasonKey,
          estimated_cost: estimated_cost ?? existing.estimated_cost,
          estimated_sell: estimated_sell ?? existing.estimated_sell,
          agreed_cost: agreed_cost ?? existing.agreed_cost,
          agreed_sell: agreed_sell ?? existing.agreed_sell,
          notifiedDate: notifiedDate ? new Date(notifiedDate) : existing.notifiedDate,
          submittedDate: submittedDate ? new Date(submittedDate) : existing.submittedDate,
          reviewedDate: reviewedDate ? new Date(reviewedDate) : existing.reviewedDate,
          approvedDate: approvedDate ? new Date(approvedDate) : existing.approvedDate,
          rejectedDate: rejectedDate ? new Date(rejectedDate) : existing.rejectedDate,
          instructedDate: instructedDate ? new Date(instructedDate) : existing.instructedDate,
          pricedDate: pricedDate ? new Date(pricedDate) : existing.pricedDate,
          agreedDate: agreedDate ? new Date(agreedDate) : existing.agreedDate,
          voIssuedDate: voIssuedDate ? new Date(voIssuedDate) : existing.voIssuedDate,
          voAcceptedDate: voAcceptedDate ? new Date(voAcceptedDate) : existing.voAcceptedDate,
          ...(Array.isArray(lines) && lines.length
            ? {
                lines: {
                  create: lines.map((L) => ({
                    cost_code: L.cost_code || null,
                    description: L.description,
                    qty: new prisma.Prisma.Decimal(parseNumber(L.qty, 0) ?? 0),
                    unit: L.unit || null,
                    unit_cost: new prisma.Prisma.Decimal(parseNumber(L.unit_cost, 0) ?? 0),
                    unit_sell:
                      L.unit_sell != null
                        ? new prisma.Prisma.Decimal(parseNumber(L.unit_sell, 0) ?? 0)
                        : null,
                  })),
                },
              }
            : {}),
        },
        include: { lines: true },
      });

      return upd;
    });

    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to update variation",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// STATUS CHANGE
router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { toStatus, note } = req.body || {};
    if (!toStatus) return res.status(400).json({ error: "toStatus is required" });

    const existing = await prisma.variation.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (!canTransition(existing.status, toStatus)) {
      return res
        .status(400)
        .json({ error: `Invalid transition ${existing.status} -> ${toStatus}` });
    }

    const dateFieldByStatus = {
      submitted: "submittedDate",
      under_review: "reviewedDate",
      approved: "approvedDate",
      rejected: "rejectedDate",
      instructed: "instructedDate",
      priced: "pricedDate",
      agreed: "agreedDate",
      vo_issued: "voIssuedDate",
      vo_accepted: "voAcceptedDate",
    };

    const dateField = dateFieldByStatus[toStatus] || null;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.variation.update({
        where: { id },
        data: {
          status: toStatus,
          ...(dateField ? { [dateField]: new Date() } : {}),
        },
      });

      await tx.variationStatusHistory.create({
        data: {
          variationId: id,
          fromStatus: existing.status,
          toStatus,
          note: note || null,
        },
      });

      return u;
    });

    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to change status",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// SOFT DELETE
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.variation.findFirst({
      where: { id, is_deleted: false },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const deleted = await prisma.variation.update({
      where: { id },
      data: { is_deleted: true },
    });

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
