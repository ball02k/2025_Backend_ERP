const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { auditLog } = require('../lib/audit.cjs');

const allowedRoutes = new Set(['tender', 'direct', 'internal']);

function ctx(req) {
  return {
    tenantId: req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'] || req.user?.tenantId || req.tenantId || 'demo',
    userId: req.user?.sub || req.user?.id || 'system',
  };
}

function normalizeRoute(value, existing) {
  if (value === undefined) return existing;
  if (value == null || value === '') return null;
  const v = String(value).toLowerCase();
  if (!allowedRoutes.has(v)) {
    throw Object.assign(new Error('Invalid route'), { status: 400 });
  }
  return v;
}

function coerceString(value) {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

function sanitizePackage(pkg) {
  if (!pkg) return pkg;
  const out = { ...pkg };
  if (out.documentId != null && typeof out.documentId !== 'string') {
    out.documentId = String(out.documentId);
  }
  return out;
}

// PATCH /packages/:id  (set route and metadata)
router.patch('/:id', async (req, res) => {
  try {
    const { tenantId, userId } = ctx(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const existing = await prisma.package.findFirst({
      where: { id, project: { tenantId } },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { route, status, name, trade, scopeSummary } = req.body || {};
    let nextRoute;
    try {
      nextRoute = normalizeRoute(route, existing.route);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const data = {
      route: nextRoute,
      status: coerceString(status ?? existing.status),
      name: coerceString(name ?? existing.name),
      trade: coerceString(trade ?? existing.trade),
      scopeSummary: coerceString(scopeSummary ?? existing.scopeSummary),
    };

    const updated = await prisma.package.update({
      where: { id },
      data,
    });

    await auditLog(prisma, {
      tenantId,
      userId,
      entity: 'Package',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: updated,
    });

    res.json(sanitizePackage(updated));
  } catch (e) {
    console.error('[server/packages.patch]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// GET /packages/:id  (detail with lines + supplier/contract annotations)
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = ctx(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const pkg = await prisma.package.findFirst({
      where: { id, project: { tenantId } },
      include: {
        project: { select: { id: true, name: true } },
        contracts: {
          select: {
            id: true,
            contractTitle: true,
            status: true,
            type: true,
            supplierId: true,
          },
        },
      },
    });
    if (!pkg) return res.status(404).json({ error: 'Not found' });

    let lines = [];
    try {
      lines = await prisma.budgetLineItem.findMany({
        where: { packageId: id, project: { tenantId } },
        orderBy: { id: 'asc' },
      });
    } catch (err) {
      console.warn('[server/packages.get] line lookup failed', err.message);
    }

    let contractLines = [];
    if (lines.length) {
      try {
        contractLines = await prisma.contractLine.findMany({
          where: { budgetLineItemId: { in: lines.map((l) => l.id) } },
          include: {
            contract: {
              select: {
                id: true,
                contractTitle: true,
                status: true,
                type: true,
                supplierId: true,
                supplier: { select: { id: true, name: true } },
              },
            },
          },
        });
      } catch (err) {
        console.warn('[server/packages.get] contract line lookup failed', err.message);
      }
    }

    const byLineId = new Map(contractLines.map((cl) => [cl.budgetLineItemId, cl]));
    const annotated = lines.map((line) => {
      const cl = byLineId.get(line.id);
      const contract = cl?.contract || null;
      const supplier = contract?.supplier || null;
      return {
        ...line,
        rate: line.rate?.toString?.() ?? line.rate,
        total: line.total?.toString?.() ?? line.total,
        contract: contract
          ? {
              id: contract.id,
              title: contract.contractTitle,
              status: contract.status,
              type: contract.type,
            }
          : null,
        supplier: supplier
          ? {
              id: supplier.id,
              name: supplier.name,
            }
          : null,
      };
    });

    res.json(
      sanitizePackage({
        ...pkg,
        budgetLines: annotated,
      })
    );
  } catch (e) {
    console.error('[server/packages.get]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
