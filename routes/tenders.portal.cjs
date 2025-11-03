const express = require('express');
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

// ============================================================================
// LEGACY: This is the OLD Tender module
// ============================================================================
// For NEW work, prefer the RFx/Request module:
//   - Backend: routes/rfx*.cjs, routes/requests.cjs
//   - Frontend: RequestInvite, RfxDetails, etc.
// This legacy code is kept for backwards compatibility only.
// ============================================================================

const router = express.Router();

async function loadSubmission(token) {
  return prisma.tenderSubmission.findUnique({
    where: { access_token: token },
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true
        }
      },
      items: true,
      tender: {
        include: {
          project: {
            select: {
              id: true,
              project_name: true
            }
          },
          criteria: true
        }
      }
    }
  });
}

function decimalOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Prisma.Decimal) return value;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(num)) return null;
  return new Prisma.Decimal(num);
}

router.get('/portal/:token', async (req, res) => {
  try {
    const submission = await loadSubmission(req.params.token);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const { tender } = submission;
    const response = {
      tender: {
        id: tender.id,
        package: tender.package,
        description: tender.description,
        status: tender.status,
        openDate: tender.open_date,
        closeDate: tender.close_date,
        project: tender.project,
        criteria: tender.criteria.map((criterion) => ({
          id: criterion.id,
          name: criterion.name,
          weight: criterion.weight,
          type: criterion.type
        }))
      },
      supplier: submission.supplier,
      submission: {
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submitted_at,
        formData: submission.form_data,
        totalPrice: submission.total_price,
        items: submission.items
      }
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load submission' });
  }
});

router.post('/portal/:token/save', async (req, res) => {
  const token = req.params.token;
  const { formData, items } = req.body || {};

  try {
    const submission = await loadSubmission(token);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.status === 'submitted') {
      return res.status(400).json({ error: 'Submission already finalised' });
    }

    const lineItems = Array.isArray(items) ? items : [];
    let total = new Prisma.Decimal(0);
    lineItems.forEach((item) => {
      const quantity = decimalOrNull(item.quantity) || new Prisma.Decimal(0);
      const unitPrice = decimalOrNull(item.unit_price) || new Prisma.Decimal(0);
      const explicitTotal = decimalOrNull(item.total);
      const rowTotal = explicitTotal ?? quantity.mul(unitPrice);
      total = total.add(rowTotal);
    });

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.tenderSubmission.update({
        where: { id: submission.id },
        data: {
          form_data: formData ?? null,
          status: 'draft',
          total_price: total
        }
      });

      await tx.tenderSubmissionItem.deleteMany({ where: { submission_id: submission.id } });

      if (lineItems.length) {
        await tx.tenderSubmissionItem.createMany({
          data: lineItems.map((item) => ({
            submission_id: submission.id,
            description: item.description || '',
            quantity: decimalOrNull(item.quantity),
            unit_price: decimalOrNull(item.unit_price),
            total: decimalOrNull(item.total)
          }))
        });
      }

      return result;
    });

    res.json({
      id: updated.id,
      status: updated.status,
      submittedAt: updated.submitted_at,
      totalPrice: updated.total_price
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

router.post('/portal/:token/submit', async (req, res) => {
  const token = req.params.token;
  try {
    const submission = await loadSubmission(token);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.status === 'submitted') {
      return res.status(400).json({ error: 'Submission already submitted' });
    }

    const now = new Date();
    if (submission.tender.close_date && now > submission.tender.close_date) {
      return res.status(400).json({ error: 'Tender has closed' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.tenderSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'submitted',
          submitted_at: now
        }
      });

      await tx.auditLog.create({
        data: {
          action: 'tender_submission_submitted',
          table_name: 'TenderSubmission',
          record_id: submission.id,
          user_id: null,
          changes: {
            status: 'submitted',
            submitted_at: now
          }
        }
      });

      return result;
    });

    res.json({
      id: updated.id,
      status: updated.status,
      submittedAt: updated.submitted_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit tender' });
  }
});

router.post('/portal/:token/qna', async (req, res) => {
  const token = req.params.token;
  const { question } = req.body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const submission = await loadSubmission(token);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const entry = await prisma.tenderQnA.create({
      data: {
        tender_id: submission.tender_id,
        submission_id: submission.id,
        question
      }
    });

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit question' });
  }
});

router.get('/portal/:token/qna', async (req, res) => {
  const token = req.params.token;
  try {
    const submission = await loadSubmission(token);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const items = await prisma.tenderQnA.findMany({
      where: {
        tender_id: submission.tender_id,
        supplierVisible: true,
        NOT: { answer: null }
      },
      orderBy: { answered_at: 'asc' }
    });

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch clarifications' });
  }
});

module.exports = router;
