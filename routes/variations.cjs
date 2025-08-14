const express = require("express");
const router = express.Router();
const { prisma, dec } = require("../utils/prisma.cjs");
const { computeTotals } = require("../utils/variations.cjs");
const { resolve: resolveLookup } = require("../utils/lookups.cjs");
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

// LIST
router.get("/", async (req, res) => {
  try {
    const {
      projectId,
      status,
      type,
      q,
      limit = 20,
      offset = 0,
      totals,
      includeTotals,
    } = req.query;
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

    const wantTotals =
      totals === "1" ||
      totals === "true" ||
      includeTotals === "1" ||
      includeTotals === "true";
    if (wantTotals && rows.length) {
      const ids = rows.map((r) => r.id);
      const lines = await prisma.variationLine.findMany({
        where: { variationId: { in: ids } },
      });
      const grouped = lines.reduce((m, l) => {
        (m[l.variationId] ||= []).push(l);
        return m;
      }, {});
      rows.forEach((r) => {
        r.totals = computeTotals(r, grouped[r.id] || []);
      });
    }

    res.json({
      data: Array.isArray(rows) ? rows : [],
      meta: {
        total: Number(total) || 0,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      },
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

    const totals = computeTotals(row, row.lines || []);
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
      lines = [],
    } = req.body || {};

    if (!projectId || !title || !(type || typeLookupId)) {
      return res.status(400).json({
        error: "projectId, title, and type (or typeLookupId) are required",
      });
    }

    let resolvedType = type;
    let resolvedStatus = status;
    let resolvedReason = reason_code;

    if (!resolvedType && typeLookupId) {
      const val = await resolveLookup(typeLookupId, "variation_type", prisma);
      if (!val) return res.status(400).json({ error: "Unknown typeLookupId" });
      resolvedType = val;
    }
    if (!resolvedStatus && statusLookupId) {
      const val = await resolveLookup(statusLookupId, "variation_status", prisma);
      if (!val)
        return res.status(400).json({ error: "Unknown statusLookupId" });
      resolvedStatus = val;
    }
    if (!resolvedReason && reasonLookupId) {
      const val = await resolveLookup(reasonLookupId, "variation_reason", prisma);
      if (!val)
        return res.status(400).json({ error: "Unknown reasonLookupId" });
      resolvedReason = val;
    }
    if (!resolvedStatus) resolvedStatus = "draft";

    const created = await prisma.variation.create({
      data: {
        projectId: Number(projectId),
        referenceCode: referenceCode || null,
        title,
        description: description || null,
        type: String(resolvedType),
        status: String(resolvedStatus),
        reason_code: resolvedReason || null,
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
                qty: dec(parseNumber(L.qty, 0) ?? 0),
                unit: L.unit || null,
                unit_cost: dec(parseNumber(L.unit_cost, 0) ?? 0),
                unit_sell:
                  L.unit_sell != null
                    ? dec(parseNumber(L.unit_sell, 0) ?? 0)
                    : null,
              })),
            }
          : undefined,
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: String(resolvedStatus), note: "created" },
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

      let resolvedType = type ?? existing.type;
      let resolvedStatus = status ?? existing.status;
      let resolvedReason = reason_code ?? existing.reason_code;

      if (!resolvedType && typeLookupId) {
        const val = await resolveLookup(typeLookupId, "variation_type", prisma);
        if (!val) return res.status(400).json({ error: "Unknown typeLookupId" });
        resolvedType = val;
      }
      if (!resolvedStatus && statusLookupId) {
        const val = await resolveLookup(statusLookupId, "variation_status", prisma);
        if (!val)
          return res.status(400).json({ error: "Unknown statusLookupId" });
        resolvedStatus = val;
      }
      if (!resolvedReason && reasonLookupId) {
        const val = await resolveLookup(reasonLookupId, "variation_reason", prisma);
        if (!val)
          return res.status(400).json({ error: "Unknown reasonLookupId" });
        resolvedReason = val;
      }

      const upd = await tx.variation.update({
        where: { id },
        data: {
          referenceCode: referenceCode ?? existing.referenceCode,
          title: title ?? existing.title,
          description: description ?? existing.description,
          type: String(resolvedType),
          status: String(resolvedStatus),
          reason_code: resolvedReason,
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
                    qty: dec(parseNumber(L.qty, 0) ?? 0),
                    unit: L.unit || null,
                    unit_cost: dec(parseNumber(L.unit_cost, 0) ?? 0),
                    unit_sell:
                      L.unit_sell != null
                        ? dec(parseNumber(L.unit_sell, 0) ?? 0)
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
