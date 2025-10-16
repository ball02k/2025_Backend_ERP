const express = require('express');
const router = express.Router();
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { auditLog } = require('../lib/audit.cjs');

function ctx(req) {
  return {
    tenantId: req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'] || req.user?.tenantId || req.tenantId || 'demo',
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

function toPlainDecimal(value) {
  return value != null && typeof value?.toString === 'function' ? value.toString() : value ?? null;
}

function sanitizeContract(contract) {
  if (!contract) return contract;
  const out = { ...contract };
  if (typeof out.id === 'bigint') out.id = out.id.toString();
  if (typeof out.documentId === 'bigint') out.documentId = out.documentId.toString();
  ['contractValueOriginal', 'contractValueCurrent', 'value', 'originalValue'].forEach((key) => {
    if (key in out) out[key] = toPlainDecimal(out[key]);
  });
  return out;
}

// POST /contracts:create-from-lines
router.post('/create-from-lines', async (req, res) => {
  try {
    const { tenantId, userId } = ctx(req);
    const { packageId, supplierId, type, contractTitle, lineItemIds } = req.body || {};

    const pkgId = toNum(packageId);
    if (!pkgId) return res.status(400).json({ error: 'packageId and lineItemIds required' });
    if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return res.status(400).json({ error: 'packageId and lineItemIds required' });
    }

    const normalizedType = String(type || '').toLowerCase();
    if (!['direct', 'internal'].includes(normalizedType)) {
      return res.status(400).json({ error: 'type must be direct or internal' });
    }
    if (normalizedType === 'direct' && !supplierId) {
      return res.status(400).json({ error: 'supplierId required for direct' });
    }

    const pkg = await prisma.package.findFirst({
      where: { id: pkgId, project: { tenantId } },
      include: { project: { select: { id: true } } },
    });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const ids = lineItemIds.map(toNum).filter(Number.isFinite);
    if (!ids.length) {
      return res.status(400).json({ error: 'lineItemIds required' });
    }

    const lines = await prisma.budgetLineItem.findMany({
      where: {
        id: { in: ids },
        packageId: pkg.id,
        projectId: pkg.projectId,
        project: { tenantId },
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
      ids.map((lineId) =>
        prisma.contractLine.create({
          data: {
            contractId: createdContract.id,
            budgetLineItemId: lineId,
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
          supplierId: createdContract.supplierId ?? undefined,
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
      console.warn('[server/contracts.create-from-lines] document creation failed', err.message);
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

    const result = sanitizeContract({
      ...createdContract,
      documentId:
        document?.id != null
          ? String(document.id)
          : createdContract.documentId != null
          ? String(createdContract.documentId)
          : null,
    });

    res.json(result);
  } catch (e) {
    console.error('[server/contracts.create-from-lines]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
