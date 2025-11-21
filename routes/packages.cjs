const express = require('express');
const router = express.Router();
const { prisma, toInt, assertProjectTenant } = require('../lib/safety.cjs');
const { isPackageSourced } = require('../lib/sourcing.cjs');
const { getTenantId } = require('../middleware/tenant.cjs');

function getContext(req) {
  return {
    tenantId: req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'] || null,
  };
}

function resolveTenantId(req) {
  return getTenantId(req) || getContext(req).tenantId || null;
}

function normalizePackage(row) {
  if (!row) return row;
  const pkg = { ...row };
  if (!Object.prototype.hasOwnProperty.call(pkg, 'scopeSummary')) {
    pkg.scopeSummary = Object.prototype.hasOwnProperty.call(pkg, 'scope') ? pkg.scope : null;
    delete pkg.scope;
  }
  return pkg;
}

function extractUnsupportedColumns(err, originalData) {
  const msg = String(err?.message || '').toLowerCase();
  if (!msg.includes('unknown column') && !msg.includes('does not exist') && !msg.includes('unknown field')) {
    return null;
  }
  const copy = { ...originalData };
  let removed = false;
  for (const key of Object.keys(copy)) {
    if (msg.includes(key.toLowerCase())) {
      delete copy[key];
      removed = true;
    }
  }
  if (!removed) return null;
  return copy;
}

function isScopeSummaryMissing(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!msg.includes('scopesummary')) return false;
  return msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('unknown field');
}

async function updatePackage(where, data) {
  try {
    return await prisma.package.update({ where, data });
  } catch (err) {
    if (isScopeSummaryMissing(err) && Object.prototype.hasOwnProperty.call(data, 'scopeSummary')) {
      const { scopeSummary: _ignored, ...rest } = data;
      if (!Object.prototype.hasOwnProperty.call(rest, 'scope')) {
        rest.scope = data.scopeSummary;
      }
      try {
        return await prisma.package.update({ where, data: rest });
      } catch (innerErr) {
        const stripped = extractUnsupportedColumns(innerErr, rest);
        if (stripped) {
          if (!Object.keys(stripped).length) {
            return prisma.package.findUnique({ where });
          }
          return prisma.package.update({ where, data: stripped });
        }
        throw innerErr;
      }
    }
    const stripped = extractUnsupportedColumns(err, data);
    if (stripped) {
      if (!Object.keys(stripped).length) {
        return prisma.package.findUnique({ where });
      }
      return prisma.package.update({ where, data: stripped });
    }
    throw err;
  }
}

function wrap(handler) {
  return (req, res, next) => {
    const binder = req.app?.locals?.asyncHandler;
    if (typeof binder === 'function') {
      return binder(handler)(req, res, next);
    }
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const ACTIVE_CONTRACT_STATUSES = ['draft', 'active', 'executed', 'live'];
const INACTIVE_STATUSES = ['cancelled', 'canceled', 'closed', 'terminated', 'withdrawn', 'void', 'archived'];

function parseLimit(raw, { fallback = 100, max = 200 } = {}) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(numeric)));
}

function parseCursor(raw) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function buildPackageCursorOptions(cursor) {
  if (!cursor) return {};
  return { skip: 1, cursor: { id: cursor } };
}

function isUnknownFieldError(err) {
  const message = String(err?.message || '').toLowerCase();
  if (!message) return false;
  if (message.includes('unknown') && (message.includes('field') || message.includes('argument'))) {
    return true;
  }
  return message.includes('relation') && message.includes('not found');
}

async function findPackageForTenant(packageId, tenantId) {
  try {
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, tenantId },
      select: { id: true, projectId: true },
    });
    if (pkg) return pkg;
  } catch (err) {
    if (!isUnknownFieldError(err)) {
      throw err;
    }
  }

  try {
    const pkg = await prisma.package.findFirst({
      where: { id: packageId },
      select: {
        id: true,
        projectId: true,
        tenantId: true,
        project: { select: { tenantId: true } },
      },
    });
    if (!pkg) return null;
    if (pkg.tenantId != null && String(pkg.tenantId) === String(tenantId)) {
      return { id: pkg.id, projectId: pkg.projectId };
    }
    if (pkg.project?.tenantId != null && String(pkg.project.tenantId) === String(tenantId)) {
      return { id: pkg.id, projectId: pkg.projectId };
    }
    return null;
  } catch (err) {
    if (isUnknownFieldError(err)) {
      return null;
    }
    throw err;
  }
}

async function fetchUnsourcedWithRelations({ tenantId, take, cursor }) {
  const sharedWhere = {
    tenantId,
    tenders: { none: { tenantId, status: { not: 'cancelled' } } },
    contracts: { none: { tenantId, status: { in: ACTIVE_CONTRACT_STATUSES } } },
  };

  const relationAttempts = [
    {
      where: {
        ...sharedWhere,
        directAwards: { none: { tenantId, status: { notIn: INACTIVE_STATUSES } } },
        internalResourceAssignments: { none: { tenantId, status: { notIn: INACTIVE_STATUSES } } },
      },
    },
    {
      where: {
        ...sharedWhere,
        directAwards: { none: { tenantId, status: { notIn: INACTIVE_STATUSES } } },
      },
    },
    { where: sharedWhere },
  ];

  const select = { id: true, name: true, reference: true, updatedAt: true };

  for (const attempt of relationAttempts) {
    try {
      return await prisma.package.findMany({
        where: attempt.where,
        orderBy: { updatedAt: 'desc' },
        take,
        ...buildPackageCursorOptions(cursor),
        select,
      });
    } catch (err) {
      if (!isUnknownFieldError(err)) {
        throw err;
      }
    }
  }

  return null;
}

function mapUnsourced(pkg) {
  if (!pkg) return null;
  const label = pkg.name || pkg.reference || `Package ${pkg.id}`;
  return {
    id: pkg.id,
    name: pkg.name || pkg.reference || null,
    reference: pkg.reference || null,
    label,
    updatedAt: pkg.updatedAt,
  };
}

// PATCH /api/packages/:id  — update simple metadata (route, name, etc.)
router.patch(
  '/packages/:id',
  wrap(async (req, res) => {
    const id = toInt(req.params.id);
    const body = req.body || {};
    const data = {};

    if (body.route !== undefined) data.route = body.route == null ? null : String(body.route).toLowerCase();
    if (body.status !== undefined) data.status = body.status == null ? null : String(body.status);
    if (body.name !== undefined) data.name = body.name == null ? null : String(body.name);
    if (body.trade !== undefined) data.trade = body.trade == null ? null : String(body.trade);
    if (body.scopeSummary !== undefined) data.scopeSummary = body.scopeSummary == null ? null : String(body.scopeSummary);

    if (!Object.keys(data).length) {
      throw Object.assign(new Error('No fields to update'), { status: 400 });
    }

    const updated = await updatePackage({ id }, data);
    res.json(normalizePackage(updated));
  }),
);

// GET /api/packages/:id/check-sourcing — gate package actions when sourcing exists.
router.get(
  '/packages/:id/check-sourcing',
  wrap(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const packageId = Number(req.params.id);
    if (!Number.isFinite(packageId)) {
      res.status(400).json({ error: 'INVALID_PACKAGE_ID' });
      return;
    }

    const pkg = await findPackageForTenant(packageId, tenantId);
    if (!pkg) {
      res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
      return;
    }

    const sourced = await isPackageSourced(prisma, tenantId, packageId);
    res.json({ sourced });
  }),
);

// GET /api/packages/unsourced — lightweight list for Create Tender modal.
router.get(
  '/packages/unsourced',
  wrap(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const limit = parseLimit(req.query?.limit, { fallback: 100, max: 200 });
    const cursor = parseCursor(req.query?.cursor);
    const take = limit + 1;
    const logger = req.app?.locals?.logger;
    const traceId =
      req.headers?.['x-request-id'] ||
      req.headers?.['x-trace-id'] ||
      req.headers?.['traceparent'] ||
      req.requestId ||
      req.id ||
      null;

    let rows = null;
    let usedFallback = false;

    try {
      rows = await fetchUnsourcedWithRelations({ tenantId, take, cursor });
    } catch (err) {
      logger?.warn?.({ traceId, tenantId, err }, '[packages.unsourced] relation filters unavailable');
    }

    if (!rows) {
      usedFallback = true;
      const batch = await prisma.package.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(500, take),
        ...buildPackageCursorOptions(cursor),
        select: { id: true, name: true, reference: true, updatedAt: true },
      });

      const filtered = [];
      for (const pkg of batch) {
        const sourced = await isPackageSourced(prisma, tenantId, pkg.id);
        if (!sourced) {
          filtered.push(pkg);
        }
        if (filtered.length >= take) {
          break;
        }
      }
      rows = filtered;
    }

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items = sliced.map(mapUnsourced).filter(Boolean);
    const nextCursor = hasMore ? String(sliced[sliced.length - 1].id) : null;

    logger?.debug?.(
      { traceId, tenantId, limit, cursor, returned: items.length, nextCursor, usedFallback },
      '[packages.unsourced] response',
    );

    res.json({
      items,
      nextCursor,
    });
  }),
);

// GET /api/packages/:id — minimal package detail with optional annotations
router.get(
  '/packages/:id',
  wrap(async (req, res) => {
    const id = toInt(req.params.id);
    const { tenantId } = getContext(req);

    let pkg = await prisma.package.findFirst({ where: { id } });
    if (!pkg) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    pkg = normalizePackage(pkg);

    if (tenantId) {
      try {
        await assertProjectTenant(pkg.projectId, tenantId);
      } catch (err) {
        if (err?.status === 404) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        throw err;
      }
    }

    let lines = [];
    try {
      // Get budget lines through the PackageItem join table
      const packageItems = await prisma.packageItem.findMany({
        where: { packageId: pkg.id },
        include: { budgetLine: true },
        orderBy: { id: 'asc' },
      });
      lines = packageItems.map(pi => pi.budgetLine).filter(Boolean);
    } catch (err) {
      console.warn('[server/packages.get] PackageItem lookup skipped', err?.message || err);
      lines = [];
    }

    let hasAnyContract = false;
    try {
      const contract = await prisma.contract.findFirst({ where: { packageId: pkg.id } });
      hasAnyContract = !!contract;
    } catch (err) {
      console.warn('[server/packages.get] contract lookup skipped', err?.message || err);
    }

    const state = {
      route: String(pkg.route || '').toLowerCase(),
      hasAnyContract,
    };

    res.json({ ...pkg, budgetLines: lines, state });
  }),
);

/**
 * GET /api/packages/:id/milestones
 * Get all milestones for a package
 */
router.get(
  '/packages/:id/milestones',
  wrap(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const packageId = toInt(req.params.id);
    if (!Number.isFinite(packageId)) {
      res.status(400).json({ error: 'INVALID_PACKAGE_ID' });
      return;
    }

    // Verify package exists and belongs to tenant
    const pkg = await findPackageForTenant(packageId, tenantId);
    if (!pkg) {
      res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
      return;
    }

    // Fetch milestones ordered by sequence
    const milestones = await prisma.packageMilestone.findMany({
      where: {
        packageId,
        tenantId,
      },
      orderBy: { sequence: 'asc' },
    });

    res.json({ milestones });
  }),
);

/**
 * POST /api/packages/:id/milestones
 * Save/replace all milestones for a package
 */
router.post(
  '/packages/:id/milestones',
  wrap(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const packageId = toInt(req.params.id);
    if (!Number.isFinite(packageId)) {
      res.status(400).json({ error: 'INVALID_PACKAGE_ID' });
      return;
    }

    // Verify package exists and belongs to tenant
    const pkg = await findPackageForTenant(packageId, tenantId);
    if (!pkg) {
      res.status(404).json({ error: 'PACKAGE_NOT_FOUND' });
      return;
    }

    const { milestones = [] } = req.body;

    // Validate milestones array
    if (!Array.isArray(milestones)) {
      res.status(400).json({ error: 'INVALID_MILESTONES_FORMAT' });
      return;
    }

    // Use transaction to delete old and create new milestones
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing milestones
      await tx.packageMilestone.deleteMany({
        where: {
          packageId,
          tenantId,
        },
      });

      // Create new milestones if any provided
      if (milestones.length > 0) {
        const created = await tx.packageMilestone.createMany({
          data: milestones.map((m, idx) => ({
            tenantId,
            packageId,
            milestoneNumber: m.milestoneNumber ?? idx + 1,
            description: m.description || null,
            targetValue: m.targetValue ? Number(m.targetValue) : null,
            targetDate: m.targetDate ? new Date(m.targetDate) : null,
            sequence: m.sequence ?? idx + 1,
            status: m.status || 'PENDING',
            contractId: m.contractId ? Number(m.contractId) : null,
            createdBy: m.createdBy ? Number(m.createdBy) : null,
          })),
        });

        // Fetch and return created milestones
        const saved = await tx.packageMilestone.findMany({
          where: {
            packageId,
            tenantId,
          },
          orderBy: { sequence: 'asc' },
        });

        return { milestones: saved, count: created.count };
      }

      return { milestones: [], count: 0 };
    });

    res.json(result);
  }),
);

module.exports = router;
