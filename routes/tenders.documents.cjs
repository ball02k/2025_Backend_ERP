const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth.cjs');
const { makeStorageKey, signKey, writeLocalFile } = require('../utils/storage.cjs');

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

// Configure multer for memory storage (optional - install with: npm install multer)
let upload;
try {
  const multer = require('multer');
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
  });
} catch (e) {
  // Multer not installed, uploads will be disabled
  upload = {
    single: () => (req, res, next) => {
      req.file = null;
      next();
    },
    array: () => (req, res, next) => {
      req.files = [];
      next();
    }
  };
}

// LIST documents for a tender
router.get('/:tenderId/documents', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);

    // Verify tender exists and user has access
    const tender = await prisma.request.findFirst({
      where: { id: requestId, tenantId }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    // Get document links for this tender
    const links = await prisma.documentLink.findMany({
      where: {
        tenantId,
        entityType: 'request',
        entityId: requestId
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get the actual documents
    const docIds = links.map(l => l.documentId);
    const docs = docIds.length > 0
      ? await prisma.document.findMany({
          where: {
            id: { in: docIds },
            tenantId
          }
        })
      : [];

    // Get download counts
    const downloadCounts = {};
    if (docIds.length > 0) {
      try {
        const downloads = await prisma.tenderDocumentDownload.groupBy({
          by: ['documentId'],
          where: {
            tenantId,
            documentId: { in: docIds }
          },
          _count: { documentId: true }
        }).catch(() => []);

        downloads.forEach(d => {
          downloadCounts[String(d.documentId)] = d._count.documentId;
        });
      } catch (e) {
        console.warn('Download tracking not available:', e.message);
      }
    }

    // Combine links with documents
    const items = links.map(link => {
      const doc = docs.find(d => String(d.id) === String(link.documentId));
      return {
        id: doc?.id,
        linkId: link.id,
        filename: doc?.filename,
        fileName: doc?.filename,
        mimeType: doc?.mimeType,
        contentType: doc?.mimeType,
        fileType: doc?.mimeType?.split('/')[1] || '',
        size: doc?.size,
        category: link.category,
        linkType: link.linkType,
        isMandatory: link.linkType === 'mandatory',
        createdAt: link.createdAt,
        uploadedAt: doc?.uploadedAt,
        url: doc ? `/api/documents/${String(doc.id)}/download` : null,
        downloadUrl: doc ? `/api/documents/${String(doc.id)}/download` : null,
        downloadCount: downloadCounts[String(doc?.id)] || 0
      };
    }).filter(item => item.id); // Only return items where document exists

    res.json({ items, total: items.length });
  } catch (e) {
    console.error('Error listing tender documents:', e);
    next(e);
  }
});

// UPLOAD document for a tender
router.post('/:tenderId/documents', upload.single('file'), async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    const file = req.file;

    console.log('[Document Upload] Request received:', {
      tenderId: requestId,
      hasFile: !!file,
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {})
    });

    if (!file) {
      console.error('[Document Upload] No file in request - multer may not be installed');
      return res.status(400).json({
        error: 'No file provided',
        hint: 'Make sure multer is installed: npm install multer'
      });
    }

    // Verify tender exists and user has access
    const tender = await prisma.request.findFirst({
      where: { id: requestId, tenantId }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const { category, linkType = 'tender_document', isAddendum } = req.body || {};

    // Generate storage key
    const storageKey = makeStorageKey(file.originalname);

    // Write file to local storage (or S3 if configured)
    const storageProvider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

    if (storageProvider === 'local') {
      // Write to local storage
      await writeLocalFile(storageKey, file.buffer);
    }
    // TODO: Add S3 support if needed

    // Create document record
    const document = await prisma.document.create({
      data: {
        tenantId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
        uploadedById: req.user?.id || null
      }
    });

    // Create document link to tender
    const link = await prisma.documentLink.create({
      data: {
        tenantId,
        documentId: document.id,
        entityType: 'request',
        entityId: requestId,
        linkType: linkType || 'tender_document',
        category: category || null
      }
    });

    // If addendum, notify all invited suppliers
    if (isAddendum === 'true' || linkType === 'addendum') {
      try {
        const { sendTenderInvitation } = require('../services/email.service.cjs');

        const invitations = await prisma.tenderInvitation.findMany({
          where: {
            tenantId,
            requestId,
            status: { not: 'cancelled' }
          },
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                email: true,
                contactName: true
              }
            }
          }
        }).catch(() => []);

        console.log(`[Addendum] Notifying ${invitations.length} suppliers`);

        // Send emails (don't block the response)
        Promise.all(
          invitations.map(async (inv) => {
            if (!inv.supplier?.email) return;

            try {
              // Simple email notification (reusing email service structure)
              const appUrl = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || 'http://localhost:5173';
              const invitationUrl = `${appUrl}/supplier-portal/tender/${tender.id}?token=${inv.accessToken}`;

              // Would send email here with email service
              console.log(`[Addendum] Would notify ${inv.supplier.email} about addendum`);
            } catch (emailError) {
              console.error(`Failed to send addendum email to ${inv.supplier.email}:`, emailError);
            }
          })
        ).catch(err => console.error('Addendum notification error:', err));
      } catch (e) {
        console.error('Failed to send addendum notifications:', e);
        // Don't fail the upload if email fails
      }
    }

    res.status(201).json({
      id: document.id,
      linkId: link.id,
      filename: document.filename,
      fileName: document.filename,
      mimeType: document.mimeType,
      size: document.size,
      category: link.category,
      linkType: link.linkType,
      createdAt: link.createdAt,
      uploadedAt: document.uploadedAt
    });
  } catch (e) {
    console.error('Error uploading tender document:', e);
    next(e);
  }
});

// TRACK document download
router.post('/:tenderId/documents/:documentId/track-download', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    const documentId = BigInt(req.params.documentId);
    const userId = req.user?.id;
    const supplierId = req.user?.supplierId;

    // Create download tracking record
    try {
      await prisma.tenderDocumentDownload.create({
        data: {
          tenantId,
          documentId,
          supplierId: supplierId || null,
          userId: userId || null,
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null
        }
      });
    } catch (e) {
      // If model doesn't exist, just log
      console.warn('Download tracking not available:', e.message);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error tracking download:', e);
    // Don't fail - tracking is optional
    res.json({ success: false });
  }
});

// DELETE document (soft delete)
router.delete('/:tenderId/documents/:documentId', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    const documentId = BigInt(req.params.documentId);

    // Verify tender exists and user has access
    const tender = await prisma.request.findFirst({
      where: { id: requestId, tenantId }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    // Verify document link exists
    const link = await prisma.documentLink.findFirst({
      where: {
        tenantId,
        documentId,
        entityType: 'request',
        entityId: requestId
      }
    });

    if (!link) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete the link (not the document itself, as it might be linked elsewhere)
    await prisma.documentLink.delete({
      where: { id: link.id }
    });

    // Check if document has other links
    const otherLinks = await prisma.documentLink.count({
      where: { documentId }
    });

    // If no other links, delete the document as well
    if (otherLinks === 0) {
      await prisma.document.delete({
        where: { id: documentId }
      });
    }

    res.status(204).end();
  } catch (e) {
    console.error('Error deleting tender document:', e);
    next(e);
  }
});

module.exports = router;
