const express = require('express');

// ============================================================================
// LEGACY: This is the OLD Tender module
// ============================================================================
// For NEW work, prefer the RFx/Request module:
//   - Backend: routes/rfx*.cjs, routes/requests.cjs
//   - Frontend: RequestInvite, RfxDetails, etc.
// This legacy code is kept for backwards compatibility only.
// ============================================================================

const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth.cjs');

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

// ==========================================
// COPY PACKAGE DETAILS & DOCUMENTS TO TENDER
// ==========================================

// POST /api/tenders/:tenderId/copy-from-package
router.post('/:tenderId/copy-from-package', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const tenderId = Number(req.params.tenderId);
    const userId = req.user?.id;

    console.log(`[Copy Package] Starting copy for tender ${tenderId}`);

    // Get the tender (which is actually a Request)
    const tender = await prisma.request.findFirst({
      where: {
        id: tenderId,
        tenantId
      }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    // Check if tender is in draft status
    if (tender.status !== 'draft' && tender.status !== 'Draft') {
      return res.status(400).json({
        error: 'Can only copy package details to draft tenders',
        currentStatus: tender.status
      });
    }

    if (!tender.packageId) {
      return res.status(400).json({ error: 'Tender is not associated with a package' });
    }

    // Get the package
    const pkg = await prisma.package.findFirst({
      where: {
        id: tender.packageId,
        // Verify it's in the same project for security
        projectId: tender.projectId
      }
    });

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    console.log(`[Copy Package] Found package: ${pkg.name}`);

    // Count existing document links for this tender
    const existingDocsCount = await prisma.documentLink.count({
      where: {
        tenantId,
        entityType: 'request',
        entityId: tenderId
      }
    });

    // Get all document links for the package
    const packageDocLinks = await prisma.documentLink.findMany({
      where: {
        tenantId,
        entityType: 'package',
        entityId: tender.packageId
      },
      include: {
        document: true
      }
    });

    console.log(`[Copy Package] Found ${packageDocLinks.length} package documents`);

    // Track what we're copying
    const copiedFields = [];
    let documentsCreated = 0;
    let documentsSkipped = 0;

    // Update tender with package details (only if not already set)
    const updateData = {};

    if (!tender.title || tender.title === 'Untitled Tender') {
      updateData.title = pkg.name;
      copiedFields.push('title');
    }

    // Note: Request model doesn't have description or estimatedValue fields
    // These belong to the Package model which is already linked

    if (Object.keys(updateData).length > 0) {
      await prisma.request.update({
        where: { id: tenderId },
        data: updateData
      });
      console.log(`[Copy Package] Updated tender fields:`, copiedFields);
    }

    // Copy document links (only if they don't already exist)
    for (const pkgDocLink of packageDocLinks) {
      // Check if this document is already linked to the tender
      const existing = await prisma.documentLink.findFirst({
        where: {
          tenantId,
          documentId: pkgDocLink.documentId,
          entityType: 'request',
          entityId: tenderId
        }
      });

      if (existing) {
        console.log(`[Copy Package] Document already linked: ${pkgDocLink.document.filename}`);
        documentsSkipped++;
        continue;
      }

      // Create new document link for tender
      await prisma.documentLink.create({
        data: {
          tenantId,
          documentId: pkgDocLink.documentId,
          entityType: 'request',
          entityId: tenderId,
          linkType: pkgDocLink.linkType || 'tender_document',
          category: pkgDocLink.category || 'specifications',
          projectId: tender.projectId
        }
      });

      documentsCreated++;
      console.log(`[Copy Package] Linked document: ${pkgDocLink.document.filename}`);
    }

    // Create audit log
    try {
      await prisma.tenderAuditLog.create({
        data: {
          tenantId,
          requestId: tenderId,
          entityType: 'tender',
          entityId: tenderId,
          action: 'package_details_copied',
          actorType: 'user',
          actorId: String(userId || 'unknown'),
          actorName: req.user?.name || 'Unknown User',
          changes: {
            packageId: pkg.id,
            packageName: pkg.name,
            copiedFields,
            documentsCreated,
            documentsSkipped,
            totalDocuments: packageDocLinks.length
          }
        }
      });
    } catch (auditError) {
      console.error('[Copy Package] Audit log failed:', auditError);
      // Don't fail the operation if audit fails
    }

    const response = {
      success: true,
      packageName: pkg.name,
      copiedFields,
      documentsCreated,
      documentsSkipped,
      totalDocuments: packageDocLinks.length,
      existingDocsBefore: existingDocsCount,
      message: `✅ Copied ${documentsCreated} documents from package "${pkg.name}"`
    };

    console.log('[Copy Package] Success:', response);
    res.json(response);
  } catch (e) {
    console.error('[Copy Package] Error:', e);
    next(e);
  }
});

// GET /api/tenders/:tenderId/package-info - Get package info for a tender
router.get('/:tenderId/package-info', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const tenderId = Number(req.params.tenderId);

    const tender = await prisma.request.findFirst({
      where: {
        id: tenderId,
        tenantId
      }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    if (!tender.packageId) {
      return res.json({
        hasPackage: false,
        package: null,
        documentCount: 0
      });
    }

    const pkg = await prisma.package.findFirst({
      where: {
        id: tender.packageId,
        projectId: tender.projectId
      }
    });

    if (!pkg) {
      return res.json({
        hasPackage: false,
        package: null,
        documentCount: 0
      });
    }

    // Count package documents
    const documentCount = await prisma.documentLink.count({
      where: {
        tenantId,
        entityType: 'package',
        entityId: pkg.id
      }
    });

    // Check if already copied
    const tenderDocCount = await prisma.documentLink.count({
      where: {
        tenantId,
        entityType: 'request',
        entityId: tenderId
      }
    });

    res.json({
      hasPackage: true,
      package: {
        id: pkg.id,
        name: pkg.name,
        description: pkg.scopeSummary,
        estimatedValue: pkg.budgetEstimate,
        trade: pkg.trade,
        status: pkg.status
      },
      documentCount,
      tenderDocumentCount: tenderDocCount,
      alreadyCopied: tenderDocCount > 0
    });
  } catch (e) {
    console.error('[Package Info] Error:', e);
    next(e);
  }
});

module.exports = router;
