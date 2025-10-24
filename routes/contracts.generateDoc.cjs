const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../middleware/auth.cjs');

/**
 * POST /contracts/:id/document/version
 * Creates a new version of the contract document
 * Body: { contentJson, baseVersionId?, redlinePatch? }
 */
router.post('/contracts/:id/document/version', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id ? Number(req.user.id) : null;

  if (!tenantId || !Number.isFinite(contractId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  const { contentJson, baseVersionId, redlinePatch } = req.body || {};

  if (!contentJson) {
    return res.status(400).json({ error: 'CONTENT_REQUIRED' });
  }

  try {
    // Find the active document
    const document = await prisma.contractDocument.findFirst({
      where: {
        contractId,
        tenantId,
        active: true,
      },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            versionNo: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    }

    // Calculate next version number
    const latestVersionNo = document.versions[0]?.versionNo || 0;
    const nextVersionNo = latestVersionNo + 1;

    // Validate baseVersionId if provided
    let baseVersionIdToUse = null;
    if (baseVersionId != null && Number.isFinite(Number(baseVersionId))) {
      const baseVersion = await prisma.contractVersion.findFirst({
        where: {
          id: Number(baseVersionId),
          tenantId,
          contractDocId: document.id,
        },
      });
      if (baseVersion) {
        baseVersionIdToUse = baseVersion.id;
      }
    }

    // Create new version
    const newVersion = await prisma.contractVersion.create({
      data: {
        tenantId,
        contractDocId: document.id,
        versionNo: nextVersionNo,
        contentJson,
        baseVersionId: baseVersionIdToUse,
        redlinePatch: redlinePatch || null,
        createdBy: userId,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'ContractVersion',
        entityId: String(newVersion.id),
        action: 'version.create',
        changes: {
          contractId,
          documentId: document.id,
          versionNo: nextVersionNo,
          baseVersionId: baseVersionIdToUse,
          hasRedline: Boolean(redlinePatch),
        },
      },
    });

    return res.status(201).json({
      id: newVersion.id,
      versionNo: newVersion.versionNo,
      contractDocId: newVersion.contractDocId,
      createdAt: newVersion.createdAt,
    });
  } catch (error) {
    console.error('contracts.generateDoc error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * PUT /contracts/:id/document/version/:versionId/redline
 * Updates the redline patch for a specific version
 * Body: { redlinePatch }
 */
router.put('/contracts/:id/document/version/:versionId/redline', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const versionId = Number(req.params.versionId);
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id ? Number(req.user.id) : null;

  if (!tenantId || !Number.isFinite(contractId) || !Number.isFinite(versionId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  const { redlinePatch } = req.body || {};

  try {
    // Find the version
    const version = await prisma.contractVersion.findFirst({
      where: {
        id: versionId,
        tenantId,
        document: {
          contractId,
          active: true,
        },
      },
    });

    if (!version) {
      return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    }

    // Update the redline patch
    const updated = await prisma.contractVersion.update({
      where: { id: versionId },
      data: {
        redlinePatch: redlinePatch || null,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'ContractVersion',
        entityId: String(versionId),
        action: 'redline.update',
        changes: {
          contractId,
          versionId,
          hasRedline: Boolean(redlinePatch),
        },
      },
    });

    return res.json({
      id: updated.id,
      versionNo: updated.versionNo,
      redlinePatch: updated.redlinePatch,
    });
  } catch (error) {
    console.error('contracts.generateDoc redline error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
