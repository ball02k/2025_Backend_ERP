const router = require('express').Router({ mergeParams: true });
const { prisma, Prisma } = require('../utils/prisma.cjs');
const { auditLog } = require('../lib/audit.cjs');

function ctx(req) {
  return {
    tenantId: req.headers['x-tenant-id'] || req.user?.tenantId || req.tenantId || 'demo',
    userId: req.user?.sub || req.user?.id || 'system',
  };
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildSchedule(lines) {
  return lines.map((l) => ({
    id: l.id,
    costCode: l.costCode,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit || null,
    rate: l.rate == null ? null : String(l.rate),
    lineTotal: l.total == null ? '0' : String(l.total),
  }));
}

// GET /api/contracts/:id — fetch single contract
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const row = await prisma.contract.findFirst({ where: { id, project: { tenantId } } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const out = { ...row };
    if (out.documentId != null && typeof out.documentId !== 'string') out.documentId = String(out.documentId);
    res.json(out);
  } catch (e) {
    console.error('[contracts/get]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/create-from-lines
router.post('/create-from-lines', async (req, res) => {
  try {
    const { tenantId, userId } = ctx(req);
    const { packageId, supplierId, type, contractTitle, lineItemIds } = req.body || {};

    const pkgId = toNum(packageId);
    if (!pkgId) return res.status(400).json({ error: 'packageId required' });
    if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return res.status(400).json({ error: 'lineItemIds required' });
    }
    const normalizedType = String(type || '').toLowerCase();
    if (!['direct', 'internal'].includes(normalizedType)) {
      return res.status(400).json({ error: 'type must be direct or internal' });
    }
    if (normalizedType === 'direct' && !supplierId) {
      return res.status(400).json({ error: 'supplierId required for direct contracts' });
    }

    const pkg = await prisma.package.findFirst({
      where: { id: pkgId, project: { tenantId } },
      include: { project: { select: { id: true } } },
    });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const ids = lineItemIds.map(toNum).filter(Number.isFinite);
    if (!ids.length) return res.status(400).json({ error: 'lineItemIds invalid' });

    const lines = await prisma.budgetLineItem.findMany({
      where: {
        id: { in: ids },
        projectId: pkg.projectId,
        project: { tenantId },
        packageId: pkg.id,
      },
    });
    if (lines.length !== ids.length) {
      return res.status(400).json({ error: 'One or more selected lines are invalid' });
    }

    const assigned = await prisma.contractLine.findMany({
      where: { budgetLineItemId: { in: ids } },
      select: { budgetLineItemId: true },
    });
    if (assigned.length) {
      return res.status(400).json({ error: 'Some lines are already assigned to a contract' });
    }

    const schedule = buildSchedule(lines);
    const sumDecimal = lines.reduce(
      (acc, line) => acc.plus(line.total ?? 0),
      new Prisma.Decimal(0)
    );

    const createdContract = await prisma.contract.create({
      data: {
        projectId: pkg.projectId,
        packageId: pkg.id,
        supplierId: normalizedType === 'internal' ? null : toNum(supplierId),
        type: normalizedType,
        status: 'draft',
        contractTitle:
          contractTitle ||
          `${pkg.name} — ${normalizedType === 'internal' ? 'Internal' : 'Direct'} Contract`,
        scheduleJSON: schedule,
        contractValueOriginal: sumDecimal,
        contractValueCurrent: sumDecimal,
        value: sumDecimal,
        originalValue: sumDecimal,
      },
    });

    await prisma.$transaction(
      ids.map((id) =>
        prisma.contractLine.create({
          data: {
            contractId: createdContract.id,
            budgetLineItemId: id,
          },
        })
      )
    );

    let document = null;
    try {
      const storageKey = `contracts/draft-${createdContract.id}-${Date.now()}.json`;
      document = await prisma.document.create({
        data: {
          tenantId,
          filename: `${createdContract.contractTitle || 'Contract Draft'}.json`,
          mimeType: 'application/json',
          size: 0,
          storageKey,
          title: createdContract.contractTitle,
          kind: 'contract-draft',
          storageUrl: null,
        },
      });
      await prisma.documentLink.create({
        data: {
          tenantId,
          documentId: BigInt(document.id),
          projectId: pkg.projectId,
          packageId: pkg.id,
          supplierId: createdContract.supplierId || undefined,
          linkType: 'contract',
          kind: 'contract',
          entityType: 'package',
          entityId: pkg.id,
        },
      });
      if (createdContract.supplierId) {
        await prisma.documentLink.create({
          data: {
            tenantId,
            documentId: BigInt(document.id),
            projectId: pkg.projectId,
            supplierId: createdContract.supplierId,
            linkType: 'contract',
            kind: 'contract',
            entityType: 'supplier',
            entityId: createdContract.supplierId,
          },
        });
      }
      await prisma.contract.update({
        where: { id: createdContract.id },
        data: { documentId: BigInt(document.id) },
      });
    } catch (err) {
      console.warn('[contracts.create-from-lines] document creation failed', err.message);
    }

    await auditLog(prisma, {
      tenantId,
      userId,
      entity: 'Contract',
      entityId: createdContract.id,
      action: 'CREATE_FROM_LINES',
      before: null,
      after: { lineCount: ids.length, type: normalizedType },
    });

    const result = {
      ...createdContract,
      documentId:
        document?.id != null
          ? String(document.id)
          : createdContract.documentId != null
          ? String(createdContract.documentId)
          : null,
    };

    res.json(result);
  } catch (e) {
    console.error('[contracts.create-from-lines]', e);
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { tenantId, userId } = ctx(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const existing = await prisma.contract.findFirst({
      where: { id, project: { tenantId } },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (String(existing.status || '').toLowerCase() === 'signed') {
      return res.status(400).json({ error: 'Contract is signed; editing disabled' });
    }

    const { contractTitle, metaJSON } = req.body || {};
    const data = {};
    if (contractTitle !== undefined) data.contractTitle = contractTitle;
    if (metaJSON !== undefined) data.metaJSON = metaJSON;

    if (!Object.keys(data).length) {
      return res.json(sanitizeContract(existing));
    }

    const updated = await prisma.contract.update({
      where: { id: existing.id },
      data,
    });

    await auditLog(prisma, {
      tenantId,
      userId,
      entity: 'Contract',
      entityId: existing.id,
      action: 'UPDATE_META',
      before: {
        contractTitle: existing.contractTitle,
        metaJSON: existing.metaJSON,
      },
      after: {
        contractTitle: updated.contractTitle,
        metaJSON: updated.metaJSON,
      },
    });

    res.json(sanitizeContract(updated));
  } catch (e) {
    console.error('[contracts.patch]', e);
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

router.post('/:id/sign', async (req, res) => {
  try {
    const { tenantId, userId } = ctx(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const { signedUrl, signMeta } = req.body || {};
    if (!signedUrl) return res.status(400).json({ error: 'signedUrl required' });

    const existing = await prisma.contract.findFirst({
      where: { id, project: { tenantId } },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.contract.update({
      where: { id: existing.id },
      data: {
        status: 'signed',
        signedUrl,
        signedAt: new Date(),
        signMeta: signMeta !== undefined ? signMeta : existing.signMeta,
      },
    });

    await auditLog(prisma, {
      tenantId,
      userId,
      entity: 'Contract',
      entityId: existing.id,
      action: 'SIGN',
      before: {
        status: existing.status,
        signedUrl: existing.signedUrl,
        signedAt: existing.signedAt,
      },
      after: {
        status: updated.status,
        signedUrl: updated.signedUrl,
        signedAt: updated.signedAt,
      },
    });

    res.json(sanitizeContract(updated));
  } catch (e) {
    console.error('[contracts.sign]', e);
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

module.exports = (/*prismaArg*/) => router;
