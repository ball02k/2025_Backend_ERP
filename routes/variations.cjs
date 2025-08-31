const express = require("express");
const router = express.Router();
const { prisma, Prisma, dec } = require("../utils/prisma.cjs");
const { recomputeProjectSnapshot } = require("../services/projectSnapshot");
const { requireProjectMember } = require("../middleware/membership.cjs");
const { z } = require('zod');
const DEV = process.env.NODE_ENV !== "production";

function parseNumber(n, fallback = null) {
  if (n === undefined || n === null || n === "") return fallback;
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

// --- CSV helpers (aligned with clients/tasks) ---
function toCsvRow(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    })
    .join(',') + '\n';
}
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i++];
    if (inQ) {
      if (ch === '"') { if (text[i] === '"') { field += '"'; i++; } else { inQ = false; } }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') pushField();
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i] === '\n') i++; pushField(); pushRow(); }
      else field += ch;
    }
  }
  if (field.length || row.length) { pushField(); pushRow(); }
  const headers = (rows.shift() || []).map((h) => h.trim());
  const data = rows.filter(r => r.length && r.some(v => v && v.trim && v.trim().length)).map((r) => {
    const obj = {}; headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; }); return obj;
  });
  return { headers, rows: data };
}
async function readRawBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function getCsvTextFromRequest(req) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.startsWith('multipart/form-data')) {
    const m = /boundary=([^;]+)\b/.exec(ct);
    if (!m) return (await readRawBody(req));
    const boundary = '--' + m[1];
    const raw = await readRawBuffer(req);
    const text = raw.toString('utf8');
    const parts = text.split(boundary).filter((p) => p.trim() && p.indexOf('\r\n\r\n') !== -1);
    if (!parts.length) return '';
    const seg = parts[0];
    const splitAt = seg.indexOf('\r\n\r\n');
    if (splitAt === -1) return '';
    let body = seg.slice(splitAt + 4);
    body = body.replace(/\r?\n--$/,'').replace(/\r?\n$/,'');
    return body;
  }
  return (await readRawBody(req));
}

// LIST
// LIST (project-scoped)
router.get("/", requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, limit = 20, offset = 0 } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const where = { tenantId, projectId: Number(projectId) };
    const [rows, total] = await Promise.all([
      prisma.variation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: Number(offset) || 0,
        take: Number(limit) || 20,
        select: { id: true, reference: true, title: true, status: true, value: true, createdAt: true },
      }),
      prisma.variation.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      ref: r.reference,
      title: r.title,
      status: r.status,
      value: r.value,
      createdAt: r.createdAt,
    }));
    res.json({ total, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch variations",
      details: DEV ? String(err.message) : undefined,
    });
  }
});

// CSV: EXPORT all tenant variations or by projectId
router.get('/csv/export', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const where = { tenantId, ...(projectId ? { projectId } : {}), };
    const rows = await prisma.variation.findMany({ where, orderBy: { updatedAt: 'desc' } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="variations.csv"');
    const headers = ['id','projectId','title','reference','contractType','type','status','reason','submissionDate','decisionDate','value','costImpact','timeImpactDays','notes'];
    res.write(toCsvRow(headers));
    for (const v of rows) {
      res.write(toCsvRow([
        v.id,
        v.projectId,
        v.title,
        v.reference || '',
        v.contractType || '',
        v.type || '',
        v.status || '',
        v.reason || '',
        v.submissionDate ? new Date(v.submissionDate).toISOString() : '',
        v.decisionDate ? new Date(v.decisionDate).toISOString() : '',
        v.value != null ? v.value : '',
        v.costImpact != null ? v.costImpact : '',
        v.timeImpactDays != null ? v.timeImpactDays : '',
        v.notes || '',
      ]));
    }
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export variations CSV' });
  }
});

// CSV: TEMPLATE
router.get('/csv/template', async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="variations_template.csv"');
  const headers = ['projectId','title','reference','contractType','type','status','reason','submissionDate','decisionDate','value','costImpact','timeImpactDays','notes'];
  res.write(toCsvRow(headers));
  res.write(toCsvRow(['1','Door spec change','CE-101','NEC4','compensation_event','submitted','Client instruction','2025-08-01','','12500.00','11250.00','5','Provisional until QS review']));
  res.end();
});

// CSV: IMPORT with Zod validation per row and project membership check
router.post('/csv/import', async (req, res) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    const userId = Number(req.user?.id);
    const raw = await getCsvTextFromRequest(req);
    const { headers, rows } = parseCsv(raw);
    const required = ['projectId','title','contractType','type','value','costImpact'];
    for (const col of required) if (!headers.includes(col)) return res.status(400).json({ error: `Missing required column: ${col}` });

    const rowSchema = z.object({
      id: z.string().optional(),
      projectId: z.string().min(1),
      title: z.string().min(1),
      reference: z.string().optional(),
      contractType: z.string().min(1),
      type: z.string().min(1),
      status: z.string().optional(),
      reason: z.string().optional(),
      submissionDate: z.string().optional(),
      decisionDate: z.string().optional(),
      value: z.string().min(1),
      costImpact: z.string().min(1),
      timeImpactDays: z.string().optional(),
      notes: z.string().optional(),
    });

    let imported = 0, updated = 0, skipped = 0; const skippedRows = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const csvRow = rows[idx];
      const rowIndex = idx + 2; // header is row 1
      let parsed;
      try {
        parsed = rowSchema.parse(csvRow);
      } catch (e) {
        skipped++; skippedRows.push({ rowIndex, reason: 'VALIDATION_FAILED' }); continue;
      }
      const projectId = Number(parsed.projectId);
      const id = parsed.id ? Number(parsed.id) : null;
      if (!Number.isFinite(projectId)) { skipped++; skippedRows.push({ rowIndex, reason: 'INVALID_PROJECT_ID' }); continue; }

      // Enforce membership (admins bypass)
      const mem = await prisma.projectMembership.findFirst({ where: { tenantId, projectId, userId }, select: { id: true } });
      if (!mem && !(Array.isArray(req.user?.roles) && req.user.roles.includes('admin'))) {
        skipped++; skippedRows.push({ rowIndex, reason: 'NOT_A_PROJECT_MEMBER' }); continue;
      }

      try {
        const data = {
          tenantId,
          projectId,
          title: parsed.title,
          reference: parsed.reference || null,
          contractType: parsed.contractType,
          type: parsed.type,
          status: parsed.status || 'proposed',
          reason: parsed.reason || null,
          submissionDate: parsed.submissionDate ? new Date(parsed.submissionDate) : null,
          decisionDate: parsed.decisionDate ? new Date(parsed.decisionDate) : null,
          value: dec(parseNumber(parsed.value, 0) ?? 0),
          costImpact: dec(parseNumber(parsed.costImpact, 0) ?? 0),
          timeImpactDays: parsed.timeImpactDays != null && parsed.timeImpactDays !== '' ? Number(parsed.timeImpactDays) : null,
          notes: parsed.notes || null,
        };

        if (id && Number.isFinite(id)) {
          const exists = await prisma.variation.findFirst({ where: { id, tenantId } });
          if (!exists) { skipped++; skippedRows.push({ rowIndex, reason: 'VARIATION_NOT_FOUND' }); continue; }
          await prisma.variation.update({ where: { id }, data });
          updated++;
          try { await recomputeProjectSnapshot(prisma, { projectId }); } catch {}
        } else {
          await prisma.variation.create({ data });
          imported++;
          try { await recomputeProjectSnapshot(prisma, { projectId }); } catch {}
        }
      } catch (e) {
        skipped++; skippedRows.push({ rowIndex, reason: 'ERROR:' + (e.code || e.message || 'UNKNOWN') });
      }
    }

    res.json({ imported, updated, skipped, skippedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import variations CSV' });
  }
});

// DETAIL
router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const row = await prisma.variation.findFirst({
      where: { id, tenantId },
      include: {
        lines: { orderBy: { sort: "asc" } },
        // Minimal relation for FE linking
        project: { select: { id: true, name: true } },
      },
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

    await recomputeProjectSnapshot(prisma, { projectId: Number(created.projectId) });
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
router.put("/:id", async (req, res, next) => {
  // Resolve projectId for membership and attach to req
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.variation.findFirst({ where: { id, tenantId }, select: { projectId: true } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    req.query.projectId = String(existing.projectId);
    return requireProjectMember(req, res, next);
  } catch (e) { return next(e); }
}, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const existing = await prisma.variation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

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

    await recomputeProjectSnapshot(prisma, { projectId: Number(updated.projectId) });
    if (updated.projectId !== existing.projectId) {
      await recomputeProjectSnapshot(prisma, { projectId: Number(existing.projectId) });
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
router.patch("/:id/status",
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

      const existing = await prisma.variation.findFirst({
        where: { id, tenantId },
        select: { projectId: true }
      });
      if (!existing) return res.status(404).json({ error: "Not found" });

      // Attach for membership enforcement
      req.query.projectId = String(existing.projectId);
      return requireProjectMember(req, res, next);
    } catch (e) {
      return next(e);
    }
  },
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      const { toStatus } = req.body || {};
      if (!toStatus) return res.status(400).json({ error: "toStatus is required" });

      const updatedMany = await prisma.variation.updateMany({
        where: { id, tenantId },
        data: { status: String(toStatus) } // no enums
      });

      const updated = updatedMany.count > 0
        ? await prisma.variation.findFirst({ where: { id, tenantId } })
        : null;

      if (!updated) return res.status(404).json({ error: "Not found" });

      await recomputeProjectSnapshot(prisma, { projectId: Number(updated.projectId) });
      return res.json({ data: updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Failed to change status",
        details: DEV ? String(err.message) : undefined
      });
    }
  }
);

// DELETE (tenant-scoped)
router.delete("/:id",
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

      const existing = await prisma.variation.findFirst({
        where: { id, tenantId },
        select: { projectId: true }
      });
      if (!existing) return res.status(404).json({ error: "Not found" });

      req.query.projectId = String(existing.projectId);
      return requireProjectMember(req, res, next);
    } catch (e) {
      return next(e);
    }
  },
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const id = Number(req.params.id);

      const existing = await prisma.variation.findFirst({ where: { id, tenantId } });
      if (!existing) return res.status(404).json({ error: "Not found" });

      // Hard delete (comment corrected). If you later add soft-delete fields, swap this for updateMany.
      const result = await prisma.variation.deleteMany({ where: { id, tenantId } });
      if (result.count === 0) return res.status(404).json({ error: "Not found" });

      await recomputeProjectSnapshot(prisma, { projectId: Number(existing.projectId) });
      return res.json({ data: existing });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Failed to delete variation",
        details: DEV ? String(err.message) : undefined
      });
    }
  }
);

module.exports = router;
