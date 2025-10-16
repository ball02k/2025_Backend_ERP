const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { createContract, HttpError } = require('../services/contracts.cjs');
const { writeAudit } = require('../lib/audit.cjs');
const { prisma } = require('../utils/prisma.cjs');

function resolveTenantId(req) {
  return (
    req.user?.tenantId ||
    req.tenantId ||
    req.headers['x-tenant-id'] ||
    req.headers['X-Tenant-Id'] ||
    null
  );
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const userId = req.user?.id;
    const {
      projectId,
      packageId,
      supplierId,
      awardValue,
      currency = 'GBP',
      title,
      contractType,
      startDate,
      endDate,
    } = req.body || {};

    const contract = await createContract({
      tenantId,
      userId,
      projectId,
      packageId,
      supplierId,
      awardValue,
      currency,
      title,
      contractType,
      startDate,
      endDate,
    });

    await writeAudit({
      tenantId,
      entity: 'Contract',
      entityId: contract.id,
      action: 'CREATE',
      userId,
      after: {
        id: contract.id,
        projectId: contract.projectId,
        packageId: contract.packageId,
        supplierId: contract.supplierId,
        awardValue: contract.awardValue?.toString?.() ?? String(contract.awardValue),
        currency: contract.currency,
        title: contract.title,
        contractType: contract.contractType,
      },
      reason: 'Direct award to contract',
    });

    res.status(201).json(contract);
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    return next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const contract = await prisma.contract.findFirst({
      where: { id, tenantId },
      include: {
        project: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(contract);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
