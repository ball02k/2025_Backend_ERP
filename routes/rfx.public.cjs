const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

/**
 * PUBLIC RFx Response API
 *
 * Allows suppliers to respond to RFx invitations via magic link (responseToken)
 * without authentication. All endpoints are tenant-scoped via the invite.
 */

// Helper to load invite and validate token
async function loadInviteByToken(responseToken) {
  if (!responseToken || typeof responseToken !== 'string') {
    return null;
  }

  const invite = await prisma.requestInvite.findFirst({
    where: { responseToken },
    include: {
      request: {
        select: {
          id: true,
          tenantId: true,
          title: true,
          description: true,
          deadline: true,
          status: true,
          packageId: true,
          package: {
            select: {
              id: true,
              name: true,
              code: true,
              project: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return invite;
}

// Helper to load or find submission for an invite
async function loadSubmission(tenantId, requestId, invite) {
  // Try to find existing submission
  // Match by (tenantId, requestId, supplierId if present)
  const where = {
    tenantId,
    requestId,
    stage: 1, // Default to stage 1 for now
  };

  // If invite has supplierId, match by that
  if (invite.supplierId) {
    where.supplierId = invite.supplierId;
  } else {
    // For manual invites without supplierId, we need to find by email
    // Since RequestResponse doesn't have email field, we'll create a dummy supplierId
    // or store email in answers. For now, let's use supplierId if available,
    // otherwise we'll need to check answers JSON for email match
    // This is a limitation - for manual invites we may need to add inviteId to RequestResponse
    // For now, return null if no supplierId
    return null;
  }

  const submission = await prisma.requestResponse.findFirst({
    where,
    orderBy: { id: 'desc' },
  });

  return submission;
}

// GET /api/public/rfx/respond/:responseToken
// Load RFx details, invite info, and existing submission (if any)
router.get('/respond/:responseToken', async (req, res) => {
  try {
    const { responseToken } = req.params;

    const invite = await loadInviteByToken(responseToken);

    if (!invite) {
      return res.status(404).json({ error: 'INVALID_TOKEN' });
    }

    // Check if Request exists
    if (!invite.request) {
      return res.status(404).json({ error: 'RFX_NOT_FOUND' });
    }

    const request = invite.request;
    const tenantId = invite.tenantId;

    // Load existing submission if any
    const submission = await loadSubmission(tenantId, request.id, invite);

    // Build response
    const rfxData = {
      id: request.id,
      title: request.title,
      description: request.description || null,
      deadline: request.deadline,
      status: request.status,
      projectName: request.package?.project?.name || null,
      packageName: request.package?.name || null,
      packageCode: request.package?.code || null,
    };

    const inviteData = {
      id: invite.id,
      supplierId: invite.supplierId || null,
      supplierName: invite.supplierName || null,
      contactFirstName: invite.contactFirstName || null,
      contactLastName: invite.contactLastName || null,
      email: invite.email,
      hasFullContact: Boolean(
        (invite.supplierName) &&
        invite.contactFirstName &&
        invite.contactLastName
      ),
    };

    let submissionData = null;
    if (submission) {
      const answers = submission.answers || {};
      submissionData = {
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
        // Extract common fields from answers JSON
        totalPrice: answers.totalPrice || null,
        programmeStart: answers.programmeStart || null,
        programmeEnd: answers.programmeEnd || null,
        methodStatement: answers.methodStatement || null,
        hsqNotes: answers.hsqNotes || null,
        clarifications: answers.clarifications || null,
        // Include full answers for custom fields
        answers: answers,
      };
    }

    return res.json({
      rfx: rfxData,
      invite: inviteData,
      submission: submissionData,
    });
  } catch (error) {
    console.error('[rfx.public] GET /respond/:responseToken error:', error);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/public/rfx/respond/:responseToken/save
// Save draft response
router.post('/respond/:responseToken/save', async (req, res) => {
  try {
    const { responseToken } = req.params;
    const body = req.body || {};

    const invite = await loadInviteByToken(responseToken);

    if (!invite) {
      return res.status(404).json({ error: 'INVALID_TOKEN' });
    }

    if (!invite.request) {
      return res.status(404).json({ error: 'RFX_NOT_FOUND' });
    }

    const request = invite.request;
    const tenantId = invite.tenantId;
    const requestId = request.id;

    // Extract supplier/contact info from body
    const {
      supplierName,
      contactFirstName,
      contactLastName,
      totalPrice,
      programmeStart,
      programmeEnd,
      methodStatement,
      hsqNotes,
      clarifications,
      ...otherAnswers
    } = body;

    // Update invite with supplier/contact info if provided and currently missing
    const inviteUpdates = {};
    if (supplierName && !invite.supplierName) {
      inviteUpdates.supplierName = supplierName;
    }
    if (contactFirstName && !invite.contactFirstName) {
      inviteUpdates.contactFirstName = contactFirstName;
    }
    if (contactLastName && !invite.contactLastName) {
      inviteUpdates.contactLastName = contactLastName;
    }

    if (Object.keys(inviteUpdates).length > 0) {
      await prisma.requestInvite.update({
        where: { id: invite.id },
        data: inviteUpdates,
      });
    }

    // Build answers JSON
    const answers = {
      supplierName: supplierName || invite.supplierName || null,
      contactFirstName: contactFirstName || invite.contactFirstName || null,
      contactLastName: contactLastName || invite.contactLastName || null,
      totalPrice: totalPrice != null ? Number(totalPrice) : null,
      programmeStart: programmeStart || null,
      programmeEnd: programmeEnd || null,
      methodStatement: methodStatement || null,
      hsqNotes: hsqNotes || null,
      clarifications: clarifications || null,
      ...otherAnswers,
    };

    // Upsert submission
    let submission;

    if (!invite.supplierId) {
      // Manual invite without supplierId - we have a problem because RequestResponse requires supplierId
      // For now, create a placeholder or return error
      // Let's use supplierId = -1 for manual invites or store inviteId in answers
      // Better: store inviteId in answers and use a dummy supplierId
      submission = await prisma.requestResponse.findFirst({
        where: {
          tenantId,
          requestId,
          supplierId: -1, // Dummy for manual invites
          stage: 1,
        },
      });

      if (submission) {
        // Update existing
        submission = await prisma.requestResponse.update({
          where: { id: submission.id },
          data: {
            answers: { ...answers, inviteId: invite.id },
            status: submission.status === 'submitted' ? 'submitted' : 'in_progress',
          },
        });
      } else {
        // Create new
        submission = await prisma.requestResponse.create({
          data: {
            tenantId,
            requestId,
            supplierId: -1, // Dummy for manual invites
            stage: 1,
            answers: { ...answers, inviteId: invite.id },
            status: 'in_progress',
          },
        });
      }
    } else {
      // Regular invite with supplierId
      submission = await prisma.requestResponse.findFirst({
        where: {
          tenantId,
          requestId,
          supplierId: invite.supplierId,
          stage: 1,
        },
      });

      if (submission) {
        // Update existing
        submission = await prisma.requestResponse.update({
          where: { id: submission.id },
          data: {
            answers,
            status: submission.status === 'submitted' ? 'submitted' : 'in_progress',
          },
        });
      } else {
        // Create new
        submission = await prisma.requestResponse.create({
          data: {
            tenantId,
            requestId,
            supplierId: invite.supplierId,
            stage: 1,
            answers,
            status: 'in_progress',
          },
        });
      }
    }

    // Return saved submission
    const submissionData = {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      totalPrice: answers.totalPrice,
      programmeStart: answers.programmeStart,
      programmeEnd: answers.programmeEnd,
      methodStatement: answers.methodStatement,
      hsqNotes: answers.hsqNotes,
      clarifications: answers.clarifications,
      answers: submission.answers,
    };

    return res.json({
      ok: true,
      submission: submissionData,
    });
  } catch (error) {
    console.error('[rfx.public] POST /respond/:responseToken/save error:', error);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/public/rfx/respond/:responseToken/submit
// Submit final response
router.post('/respond/:responseToken/submit', async (req, res) => {
  try {
    const { responseToken } = req.params;
    const body = req.body || {};

    const invite = await loadInviteByToken(responseToken);

    if (!invite) {
      return res.status(404).json({ error: 'INVALID_TOKEN' });
    }

    if (!invite.request) {
      return res.status(404).json({ error: 'RFX_NOT_FOUND' });
    }

    const request = invite.request;
    const tenantId = invite.tenantId;
    const requestId = request.id;

    // Extract supplier/contact info from body
    const {
      supplierName,
      contactFirstName,
      contactLastName,
      totalPrice,
      programmeStart,
      programmeEnd,
      methodStatement,
      hsqNotes,
      clarifications,
      ...otherAnswers
    } = body;

    // Validate required fields
    if (totalPrice == null || totalPrice === '') {
      return res.status(400).json({ error: 'Total price is required' });
    }

    const finalSupplierName = supplierName || invite.supplierName;
    const finalContactFirst = contactFirstName || invite.contactFirstName;
    const finalContactLast = contactLastName || invite.contactLastName;

    if (!finalSupplierName || !finalContactFirst || !finalContactLast) {
      return res.status(400).json({
        error: 'Supplier name and contact details (first name, last name) are required'
      });
    }

    // Update invite with supplier/contact info if provided
    const inviteUpdates = {};
    if (supplierName && !invite.supplierName) {
      inviteUpdates.supplierName = supplierName;
    }
    if (contactFirstName && !invite.contactFirstName) {
      inviteUpdates.contactFirstName = contactFirstName;
    }
    if (contactLastName && !invite.contactLastName) {
      inviteUpdates.contactLastName = contactLastName;
    }
    // Update invite status to 'responded'
    inviteUpdates.status = 'responded';
    inviteUpdates.respondedAt = new Date();

    if (Object.keys(inviteUpdates).length > 0) {
      await prisma.requestInvite.update({
        where: { id: invite.id },
        data: inviteUpdates,
      });
    }

    // Build answers JSON
    const answers = {
      supplierName: finalSupplierName,
      contactFirstName: finalContactFirst,
      contactLastName: finalContactLast,
      totalPrice: Number(totalPrice),
      programmeStart: programmeStart || null,
      programmeEnd: programmeEnd || null,
      methodStatement: methodStatement || null,
      hsqNotes: hsqNotes || null,
      clarifications: clarifications || null,
      ...otherAnswers,
    };

    // Upsert submission
    let submission;

    if (!invite.supplierId) {
      // Manual invite without supplierId
      submission = await prisma.requestResponse.findFirst({
        where: {
          tenantId,
          requestId,
          supplierId: -1,
          stage: 1,
        },
      });

      if (submission) {
        // Update existing
        submission = await prisma.requestResponse.update({
          where: { id: submission.id },
          data: {
            answers: { ...answers, inviteId: invite.id },
            status: 'submitted',
            submittedAt: new Date(),
          },
        });
      } else {
        // Create new
        submission = await prisma.requestResponse.create({
          data: {
            tenantId,
            requestId,
            supplierId: -1,
            stage: 1,
            answers: { ...answers, inviteId: invite.id },
            status: 'submitted',
            submittedAt: new Date(),
          },
        });
      }
    } else {
      // Regular invite with supplierId
      submission = await prisma.requestResponse.findFirst({
        where: {
          tenantId,
          requestId,
          supplierId: invite.supplierId,
          stage: 1,
        },
      });

      if (submission) {
        // Update existing
        submission = await prisma.requestResponse.update({
          where: { id: submission.id },
          data: {
            answers,
            status: 'submitted',
            submittedAt: new Date(),
          },
        });
      } else {
        // Create new
        submission = await prisma.requestResponse.create({
          data: {
            tenantId,
            requestId,
            supplierId: invite.supplierId,
            stage: 1,
            answers,
            status: 'submitted',
            submittedAt: new Date(),
          },
        });
      }
    }

    // Return final submission
    const submissionData = {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      totalPrice: answers.totalPrice,
      programmeStart: answers.programmeStart,
      programmeEnd: answers.programmeEnd,
      methodStatement: answers.methodStatement,
      hsqNotes: answers.hsqNotes,
      clarifications: answers.clarifications,
      answers: submission.answers,
    };

    return res.json({
      ok: true,
      submission: submissionData,
    });
  } catch (error) {
    console.error('[rfx.public] POST /respond/:responseToken/submit error:', error);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;
