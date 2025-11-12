const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

/**
 * GET /contracts/:id/document
 * Returns the active contract document with all versions
 */
router.get('/contracts/:id/document', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const tenantId = req.user?.tenantId;

  if (!tenantId || !Number.isFinite(contractId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  try {
    // Find the contract
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: {
        id: true,
        title: true,
        contractRef: true,
        status: true,
        value: true,
        currency: true,
        projectId: true,
        packageId: true,
        supplierId: true,
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    }

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
          select: {
            id: true,
            versionNo: true,
            contentJson: true,
            baseVersionId: true,
            redlinePatch: true,
            createdBy: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    }

    // Get approval steps and approvals
    const approvalSteps = await prisma.contractApprovalStep.findMany({
      where: { contractId, tenantId },
      orderBy: { seq: 'asc' },
      include: {
        approvals: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            userId: true,
            decision: true,
            comment: true,
            decidedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return res.json({
      contract,
      document: {
        id: document.id,
        title: document.title,
        editorType: document.editorType,
        active: document.active,
        createdAt: document.createdAt,
      },
      versions: document.versions,
      latestVersion: document.versions[0] || null,
      approvalSteps,
    });
  } catch (error) {
    console.error('contracts.read error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /contracts/:id/document/versions/:versionId
 * Returns a specific version of the contract document
 */
router.get('/contracts/:id/document/versions/:versionId', requireAuth, async (req, res) => {
  const contractId = Number(req.params.id);
  const versionId = Number(req.params.versionId);
  const tenantId = req.user?.tenantId;

  if (!tenantId || !Number.isFinite(contractId) || !Number.isFinite(versionId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  try {
    const version = await prisma.contractVersion.findFirst({
      where: {
        id: versionId,
        tenantId,
        document: {
          contractId,
        },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            editorType: true,
            contractId: true,
          },
        },
      },
    });

    if (!version) {
      return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    }

    return res.json({
      id: version.id,
      versionNo: version.versionNo,
      contentJson: version.contentJson,
      baseVersionId: version.baseVersionId,
      redlinePatch: version.redlinePatch,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      document: version.document,
    });
  } catch (error) {
    console.error('contracts.read version error', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
