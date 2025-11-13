const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { auditLog } = require('../lib/audit.cjs');

function ctx(req) {
  return {
    tenantId: req.headers['x-tenant-id'] || req.user?.tenantId || req.tenantId || 'demo',
    userId: req.user?.sub || req.user?.id || 'system',
  };
}

function sanitizePackage(pkg) {
  if (!pkg) return pkg;
  const out = { ...pkg };
  if (out.documentId != null && typeof out.documentId !== 'string') {
    out.documentId = String(out.documentId);
  }
  return out;
}

const allowedRoutes = new Set(['tender', 'direct', 'internal']);

function isScopeSummaryMissing(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!msg.includes('scopesummary')) return false;
  return msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('unknown field');
}

const packageDetailBase = {
  id: true,
  projectId: true,
  name: true,
  trade: true,
  status: true,
  route: true,
  budgetEstimate: true,
  deadline: true,
  targetAwardDate: true,
  requiredOnSite: true,
  leadTimeWeeks: true,
  contractForm: true,
  retentionPct: true,
  paymentTerms: true,
  currency: true,
  awardValue: true,
  awardSupplierId: true,
  costCodeId: true,
  ownerUserId: true,
  buyerUserId: true,
  documentId: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true } },
};

const packageDetailSelect = {
  ...packageDetailBase,
  scopeSummary: true,
};

function normalizeScope(row) {
  if (!row || typeof row !== 'object') return row;
  if (!Object.prototype.hasOwnProperty.call(row, 'scopeSummary')) {
    if (Object.prototype.hasOwnProperty.call(row, 'scope')) {
      row.scopeSummary = row.scope;
      delete row.scope;
    } else {
      row.scopeSummary = null;
    }
  }
  return row;
}

async function findPackageDetail(where) {
  try {
    const row = await prisma.package.findFirst({ where, select: packageDetailSelect });
    return normalizeScope(row);
  } catch (err) {
    if (!isScopeSummaryMissing(err)) throw err;
    console.warn('[packages.get] scopeSummary column missing, retrying without field');
    const row = await prisma.package.findFirst({ where, select: packageDetailBase });
    return normalizeScope(row);
  }
}

// PATCH /packages/:id — update core routing metadata
router.patch('/:id', async (req, res) => {
  try {
    const { tenantId, userId } = ctx(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const body = req.body || {};
    const { route, status, name, trade, scopeSummary } = body;

    const existing = await prisma.package.findFirst({
      where: { id, project: { tenantId } },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const data = {};
    if (route !== undefined) {
      const normalized = route == null ? null : String(route).toLowerCase();
      if (normalized && !allowedRoutes.has(normalized)) {
        return res.status(400).json({ error: 'Invalid route value' });
      }
      data.route = normalized;
    }
    if (status !== undefined) data.status = status == null ? null : String(status);
    if (name !== undefined) data.name = name == null ? null : String(name);
    if (trade !== undefined) data.trade = trade == null ? null : String(trade);
    if (scopeSummary !== undefined) data.scopeSummary = scopeSummary == null ? null : String(scopeSummary);

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    let update;
    try {
      update = await prisma.package.update({
        where: { id },
        data,
      });
    } catch (err) {
      if (isScopeSummaryMissing(err) && Object.prototype.hasOwnProperty.call(data, 'scopeSummary')) {
        console.warn('[packages.patch] scopeSummary column missing, retrying without field');
        const { scopeSummary: _ignored, ...rest } = data;
        if (data.scopeSummary !== undefined && !Object.prototype.hasOwnProperty.call(rest, 'scope')) {
          rest.scope = data.scopeSummary;
        }
        update = await prisma.package.update({
          where: { id },
          data: rest,
        });
      } else {
        throw err;
      }
    }

    await auditLog(prisma, {
      tenantId,
      userId,
      entity: 'Package',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: update,
    });

    const response = sanitizePackage(update);
    if (!Object.prototype.hasOwnProperty.call(response, 'scopeSummary')) {
      if (Object.prototype.hasOwnProperty.call(response, 'scope')) {
        response.scopeSummary = response.scope;
        delete response.scope;
      } else {
        response.scopeSummary = null;
      }
    }

    res.json(response);
  } catch (e) {
    console.error('[packages.patch]', e);
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

// GET /packages/:id — detail including budget lines + contract assignments
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = ctx(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const pkgRaw = await findPackageDetail({
      where: { id, project: { tenantId } },
    });
    const pkg = normalizeScope(pkgRaw);
    if (!pkg) return res.status(404).json({ error: 'Not found' });

    let lines = [];
    try {
      lines = await prisma.budgetLineItem.findMany({
        where: { packageId: id, project: { tenantId } },
        orderBy: { id: 'asc' },
      });
    } catch (err) {
      console.warn('[packages.get] budgetLineItem lookup failed', err.message);
      lines = [];
    }

    const annotated = lines.map((line) => ({
      ...line,
      rate: line.rate?.toString?.() ?? line.rate,
      total: line.total?.toString?.() ?? line.total,
    }));

    const out = sanitizePackage({
      ...pkg,
      budgetLines: annotated,
    });
    if (!Object.prototype.hasOwnProperty.call(out, 'scopeSummary')) out.scopeSummary = null;

    res.json(out);
  } catch (e) {
    console.error('[packages.get]', e);
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

module.exports = () => router;
