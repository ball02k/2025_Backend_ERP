const router = require('express').Router();
const { prisma, Prisma, toDecimal } = require('../lib/prisma.js');
const { writeAudit } = require('../lib/audit.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function serializePackage(pkg) {
  if (!pkg) return pkg;
  const { contracts = [], budgetItems = [], ...rest } = pkg;
  const contractSummaries = contracts.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    awardValue: c.awardValue instanceof Prisma.Decimal ? Number(c.awardValue) : c.awardValue,
    supplier: c.supplier ? { id: c.supplier.id, name: c.supplier.name } : null,
    currency: c.currency,
    contractType: c.contractType,
    startDate: c.startDate,
    endDate: c.endDate,
  }));
  const budgetLines = budgetItems
    .filter((it) => it?.budgetLine)
    .map((it) => {
      const bl = it.budgetLine;
      return {
        id: bl.id,
        description: bl.description,
        qty: bl.qty != null ? Number(bl.qty) : null,
        unit: bl.unit || null,
        rate: bl.rate != null ? Number(bl.rate) : null,
        total: bl.total != null ? Number(bl.total) : Number(bl.amount || 0),
        costCode: bl.costCode
          ? { id: bl.costCode.id, code: bl.costCode.code, description: bl.costCode.description || '' }
          : null,
      };
    });
  return {
    ...rest,
    scope: rest.scopeSummary ?? null,
    contracts: contractSummaries,
    budgetLines,
  };
}

router.get('/packages', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { projectId } = req.query || {};
    const where = { project: { tenantId } };
    if (projectId) where.projectId = Number(projectId);

    const packages = await prisma.package.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          include: { supplier: { select: { id: true, name: true } } },
        },
        budgetItems: {
          include: { budgetLine: { include: { costCode: true } } },
        },
      },
    });

    const payload = packages.map((pkg) => {
      const base = serializePackage(pkg);
      return {
        ...base,
        awardSupplier: pkg.awardSupplier ? { id: pkg.awardSupplier.id, name: pkg.awardSupplier.name } : null,
      };
    });

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.patch('/packages/:packageId', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;
    const packageId = Number(req.params.packageId);
    if (!Number.isFinite(packageId)) return res.status(400).json({ error: 'Invalid package id' });

    const existing = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          include: { supplier: { select: { id: true, name: true } } },
        },
        budgetItems: { include: { budgetLine: { include: { costCode: true } } } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Package not found' });

    const data = {};
    const {
      name,
      scopeSummary,
      scope,
      trade,
      status,
      awardSupplierId,
      awardValue,
      targetAwardDate,
      requiredOnSite,
      deadline,
      leadTimeWeeks,
      contractForm,
      retentionPct,
      paymentTerms,
    } = req.body || {};

    if (name !== undefined) data.name = name;
    if (scopeSummary !== undefined || scope !== undefined) data.scopeSummary = scopeSummary ?? scope ?? null;
    if (trade !== undefined) data.trade = trade;
    if (status !== undefined) data.status = status;
    if (leadTimeWeeks !== undefined) data.leadTimeWeeks = leadTimeWeeks != null ? Number(leadTimeWeeks) : null;
    if (contractForm !== undefined) data.contractForm = contractForm || null;
    if (paymentTerms !== undefined) data.paymentTerms = paymentTerms || null;
    if (retentionPct !== undefined) {
      data.retentionPct = retentionPct != null ? toDecimal(retentionPct, { fallback: 0 }) : null;
    }
    if (targetAwardDate !== undefined) data.targetAwardDate = targetAwardDate ? new Date(targetAwardDate) : null;
    if (requiredOnSite !== undefined) data.requiredOnSite = requiredOnSite ? new Date(requiredOnSite) : null;
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
    if (awardValue !== undefined) {
      data.awardValue = awardValue != null ? toDecimal(awardValue, { fallback: 0 }) : null;
    }
    if (awardSupplierId !== undefined) {
      if (awardSupplierId == null) {
        data.awardSupplierId = null;
      } else {
        const supplier = await prisma.supplier.findFirst({
          where: { tenantId, id: Number(awardSupplierId) },
          select: { id: true },
        });
        if (!supplier) return res.status(400).json({ error: 'Award supplier not found' });
        data.awardSupplierId = supplier.id;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.json(serializePackage(existing));
    }

    const updated = await prisma.package.update({
      where: { id: existing.id },
      data,
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          include: { supplier: { select: { id: true, name: true } } },
        },
        budgetItems: { include: { budgetLine: { include: { costCode: true } } } },
      },
    });

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'Package',
      entityId: updated.id,
      action: 'PACKAGE_UPDATE',
      changes: data,
    });

    res.json(
      serializePackage({
        ...updated,
        awardSupplier: updated.awardSupplier ? { id: updated.awardSupplier.id, name: updated.awardSupplier.name } : null,
      }),
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
