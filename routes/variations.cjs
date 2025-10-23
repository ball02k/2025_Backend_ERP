const router = require('express').Router({ mergeParams: true });
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');
const { recomputeEstimatesForProject, recomputeProjectFinancials } = require('./hooks.recompute.cjs');

function toJson(row) {
  return JSON.parse(JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

function withLinks(entity, row) {
  const x = toJson(row);
  x.links = buildLinks(entity, x);
  return x;
}

async function writeAudit({ userId, entityId, action, changes, req }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        entity: 'variation',
        entityId: String(entityId),
        action,
        changes: changes ? toJson(changes) : null,
        ipAddress: req?.ip || null,
      },
    });
  } catch (err) {
    console.warn('[variations] failed to write audit log', err);
  }
}

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId;
}

function getUserId(req) {
  const raw = req.user?.id ?? req.userId ?? null;
  return raw != null ? Number(raw) : null;
}

function normalizeDecimal(value, field) {
  try {
    if (value instanceof Prisma.Decimal) return value;
    if (value === '' || value === null || value === undefined) {
      throw new Error(`${field} required`);
    }
    return new Prisma.Decimal(value);
  } catch (err) {
    throw Object.assign(new Error(`${field} invalid`), { status: 400 });
  }
}

function variationDelta(v) {
  const candidate = v?.amount ?? v?.value ?? v?.costImpact ?? 0;
  return candidate instanceof Prisma.Decimal ? candidate : new Prisma.Decimal(candidate);
}

// List variations with query parameters (?projectId=)
router.get('/variations', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId required' });
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const rawOffset = Number(req.query.offset);
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const rows = await prisma.variation.findMany({
      where: { tenantId, projectId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    res.json({
      items: rows.map((r) => withLinks('variation', r)),
      total: rows.length,
      limit,
      offset,
    });
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// List variations by project
router.get('/projects/:projectId/variations', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const rows = await prisma.variation.findMany({
      where: { tenantId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(rows.map((r) => withLinks('variation', r)));
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// Create variation
router.post('/projects/:projectId/variations', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const userId = getUserId(req);
    const {
      packageId,
      budgetLineId,
      contractId,
      title,
      reason,
      description,
      type,
      amount,
      contractType,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: 'title required' });
    if (!type) return res.status(400).json({ error: 'type required' });

    const amountDecimal = normalizeDecimal(amount, 'amount');

    const created = await prisma.variation.create({
      data: {
        tenantId,
        projectId,
        packageId: packageId ?? null,
        budgetLineId: budgetLineId ?? null,
        contractId: contractId ?? null,
        title,
        reason: reason ?? null,
        description: description ?? null,
        type,
        amount: amountDecimal,
        value: amountDecimal,
        costImpact: amountDecimal,
        contractType: contractType || 'general',
        status: 'submitted',
      },
    });

    await writeAudit({
      userId,
      entityId: created.id,
      action: 'VARIATION_CREATE',
      changes: { after: toJson(created) },
      req,
    });

    res.json(withLinks('variation', created));
  } catch (e) {
    next(e);
  }
});

// Approve variation -> moves money + recompute
router.patch('/variations/:id/approve', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const id = Number(req.params.id);
    const { justification, approvedBy } = req.body || {};
    const approverId = approvedBy != null ? Number(approvedBy) : getUserId(req);

    const existing = await prisma.variation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Variation not found' });
    if (existing.status === 'approved') {
      return res.json(withLinks('variation', existing));
    }

    const delta = variationDelta(existing);
    let contractForUpdate = existing.contractId;
    let updated;

    await prisma.$transaction(async (tx) => {
      if (existing.type === 'BUDGET_ADJUSTMENT') {
        if (!existing.budgetLineId) throw Object.assign(new Error('budgetLineId required'), { status: 400 });
        await tx.budgetLine.update({
          where: { id: existing.budgetLineId },
          data: { planned: { increment: delta } },
        });
      } else if (existing.type === 'CONTRACT_VARIATION') {
        let contractId = existing.contractId;
        if (!contractId && existing.packageId) {
          const contract = await tx.contract.findFirst({
            where: { tenantId, projectId: existing.projectId, packageId: existing.packageId },
            orderBy: { createdAt: 'desc' },
          });
          if (!contract) throw Object.assign(new Error('No contract found for package; provide contractId'), { status: 400 });
          contractId = contract.id;
          contractForUpdate = contract.id;
        }
        if (!contractId) throw Object.assign(new Error('contractId or packageId required'), { status: 400 });
        const contract = await tx.contract.findFirst({ where: { tenantId, id: contractId } });
        if (!contract) throw Object.assign(new Error('Contract not found'), { status: 404 });
        await tx.contract.update({
          where: { id: contract.id },
          data: {
            originalValue: contract.originalValue ?? contract.value,
            value: { increment: delta },
          },
        });
        contractForUpdate = contract.id;
      } else {
        throw Object.assign(new Error('Unknown variation type'), { status: 400 });
      }

      updated = await tx.variation.update({
        where: { id },
        data: {
          status: 'approved',
          justification: justification ?? null,
          approvedAt: new Date(),
          approvedBy: approverId ?? null,
          amount: delta,
          value: existing.value ?? delta,
          costImpact: existing.costImpact ?? delta,
          ...(contractForUpdate && !existing.contractId ? { contractId: contractForUpdate } : {}),
        },
      });
    });

    if (existing.type === 'CONTRACT_VARIATION') {
      await recomputeEstimatesForProject(tenantId, existing.projectId);
    }

    await recomputeProjectFinancials(tenantId, existing.projectId);

    await writeAudit({
      userId: approverId ?? getUserId(req),
      entityId: id,
      action: 'VARIATION_APPROVE',
      changes: { before: toJson(existing), after: toJson(updated), justification: justification ?? null },
      req,
    });

    res.json(withLinks('variation', updated));
  } catch (e) {
    if (e && e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    next(e);
  }
});

// Reject variation
router.patch('/variations/:id/reject', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const id = Number(req.params.id);
    const { justification } = req.body || {};
    const userId = getUserId(req);

    const existing = await prisma.variation.findFirst({ where: { tenantId, id } });
    if (!existing) return res.status(404).json({ error: 'Variation not found' });

    const updated = await prisma.variation.update({
      where: { id },
      data: { status: 'rejected', justification: justification ?? null },
    });

    await writeAudit({
      userId,
      entityId: id,
      action: 'VARIATION_REJECT',
      changes: { before: toJson(existing), after: toJson(updated), justification: justification ?? null },
      req,
    });

    res.json(withLinks('variation', updated));
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
