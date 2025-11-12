const express = require('express');
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

// ============================================================================
// LEGACY: This is the OLD Tender module
// ============================================================================
// For NEW work, prefer the RFx/Request module:
//   - Backend: routes/rfx*.cjs, routes/requests.cjs
//   - Frontend: RequestInvite, RfxDetails, etc.
// This legacy code is kept for backwards compatibility only.
// ============================================================================

const router = express.Router();

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

// ==========================================
// TENDER CLARIFICATIONS (Q&A)
// ==========================================

// GET clarifications for a tender
router.get('/:tenderId/clarifications', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);

    // Verify tender exists
    const tender = await prisma.request.findFirst({
      where: { id: requestId, tenantId }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    // Get clarifications
    const clarifications = await prisma.tenderClarification.findMany({
      where: {
        tenantId,
        requestId: requestId,
        isPublic: true,
      },
      orderBy: [
        { status: 'asc' }, // pending first
        { askedAt: 'desc' },
      ],
    });

    res.json({ items: clarifications, total: clarifications.length });
  } catch (error) {
    console.error('[GET /tenders/:tenderId/clarifications] Error:', error);
    next(error);
  }
});

// POST - Submit question (supplier or buyer)
router.post('/:tenderId/clarifications', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const requestId = Number(req.params.tenderId);
    const { question } = req.body;
    const userId = req.user?.id;
    const supplierId = req.user?.supplierId;

    if (!question || question.trim().length < 10) {
      return res.status(400).json({ error: 'Question must be at least 10 characters' });
    }

    // Verify tender exists
    const tender = await prisma.request.findFirst({
      where: { id: requestId, tenantId }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    // Check clarification deadline (if set)
    if (tender.clarificationDeadline && new Date(tender.clarificationDeadline) < new Date()) {
      return res.status(400).json({ error: 'Clarification deadline has passed' });
    }

    // Create clarification
    const clarification = await prisma.tenderClarification.create({
      data: {
        tenantId,
        requestId: requestId,
        question: question.trim(),
        askedBy: supplierId || userId, // Store but don't expose to other suppliers
        askedAt: new Date(),
        status: 'pending',
        isPublic: true,
      }
    });

    // TODO: Notify buyer team via email
    console.log(`[Clarification] New question for tender ${requestId}`);

    res.status(201).json(clarification);
  } catch (error) {
    console.error('[POST /tenders/:tenderId/clarifications] Error:', error);
    next(error);
  }
});

// PUT - Answer question (buyer only)
router.put('/clarifications/:id/answer', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const clarificationId = Number(req.params.id);
    const { answer } = req.body;
    const userId = req.user?.id;

    if (!answer || answer.trim().length < 10) {
      return res.status(400).json({ error: 'Answer must be at least 10 characters' });
    }

    // Get clarification
    const clarification = await prisma.tenderClarification.findFirst({
      where: {
        id: clarificationId,
        tenantId,
      }
    });

    if (!clarification) {
      return res.status(404).json({ error: 'Clarification not found' });
    }

    // Update clarification
    const updated = await prisma.tenderClarification.update({
      where: { id: clarificationId },
      data: {
        answer: answer.trim(),
        answeredBy: userId,
        answeredAt: new Date(),
        status: 'answered',
      }
    });

    // Get invited suppliers for notification
    try {
      const invitations = await prisma.tenderInvitation.findMany({
        where: {
          tenantId,
          requestId: clarification.requestId,
          status: { not: 'cancelled' }
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }).catch(() => []);

      console.log(`[Clarification] Answer posted - would notify ${invitations.length} suppliers`);

      // TODO: Send email notifications to all suppliers
      // Mark as notified
      await prisma.tenderClarification.update({
        where: { id: clarificationId },
        data: {
          notifiedSuppliers: true,
          notifiedAt: new Date(),
        }
      }).catch(() => {
        // If these fields don't exist, that's okay
      });
    } catch (e) {
      console.error('Failed to notify suppliers:', e);
      // Don't fail the answer if notification fails
    }

    res.json(updated);
  } catch (error) {
    console.error('[PUT /clarifications/:id/answer] Error:', error);
    next(error);
  }
});

module.exports = router;
