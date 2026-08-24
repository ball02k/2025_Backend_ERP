const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { writeAudit } = require('../lib/audit.cjs');
const crypto = require('crypto');
const multer = require('multer');
const { storageService } = require('../services/storage.factory.cjs');

const prisma = new PrismaClient();
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * PUBLIC RFx Response API
 *
 * Allows suppliers to respond to RFx invitations via magic link (responseToken)
 * without authentication. All endpoints are tenant-scoped via the invite.
 *
 * Enhanced with:
 * - Audit logging (opened, saved, submitted)
 * - Token expiry and revocation checks
 * - Tracking timestamps (lastOpenedAt, lastSavedAt, submittedAt)
 * - Structured request logging
 * - 409 lock after submission
 */

// Helper to generate unique request ID for tracing
function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

// Helper to load invite and validate token
async function loadInviteByToken(responseToken) {
  if (!responseToken || typeof responseToken !== 'string') {
    return null;
  }

  const invite = await prisma.requestInvite.findFirst({
    where: { responseToken },
  });

  if (!invite) {
    return null;
  }

  // Check if token is revoked
  if (invite.revokedAt) {
    return { error: 'TOKEN_REVOKED', invite: null };
  }

  // Check if token is expired
  if (invite.expiresAt && new Date() > invite.expiresAt) {
    return { error: 'TOKEN_EXPIRED', invite: null };
  }

  // Fetch the associated Request with package/project details
  const request = await prisma.request.findFirst({
    where: { id: invite.requestId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      type: true,
      deadline: true,
      status: true,
      addenda: true,
      packageId: true,
      package: {
        select: {
          id: true,
          name: true,
          projectId: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!request) {
    return { error: 'RFX_NOT_FOUND', invite: null };
  }

  // Fetch sections and questions for this request
  const sections = await prisma.requestSection.findMany({
    where: {
      tenantId: invite.tenantId,
      requestId: request.id,
    },
    orderBy: { order: 'asc' },
  });

  const questions = await prisma.requestQuestion.findMany({
    where: {
      tenantId: invite.tenantId,
      requestId: request.id,
    },
    orderBy: { order: 'asc' },
  });

  // Attach sections and questions to request
  request.sections = sections;
  request.questions = questions;

  // Attach request to invite object for convenience
  invite.request = request;

  return { invite };
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
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const { responseToken } = req.params;

    console.log(`[${requestId}] [supplier_portal] GET /respond/:token - Loading invite`);

    const result = await loadInviteByToken(responseToken);

    if (!result) {
      console.log(`[${requestId}] [supplier_portal] Token not found: ${responseToken?.substring(0, 8)}...`);
      return res.status(404).json({ error: 'INVALID_TOKEN' });
    }

    if (result.error) {
      console.log(`[${requestId}] [supplier_portal] Token validation failed: ${result.error}`);
      return res.status(403).json({ error: result.error });
    }

    const invite = result.invite;

    // Check if Request exists
    if (!invite.request) {
      console.log(`[${requestId}] [supplier_portal] RFx not found for invite ${invite.id}`);
      return res.status(404).json({ error: 'RFX_NOT_FOUND' });
    }

    const request = invite.request;
    const tenantId = invite.tenantId;

    // Load existing submission if any
    const submission = await loadSubmission(tenantId, request.id, invite);

    // Update lastOpenedAt timestamp
    await prisma.requestInvite.update({
      where: { id: invite.id },
      data: { lastOpenedAt: new Date() },
    });

    // Audit log: supplier opened portal
    try {
      await writeAudit(
        tenantId,
        null, // No userId for supplier (they're not logged in)
        'supplier_invite_opened',
        'RequestInvite',
        invite.id,
        {
          requestId: request.id,
          requestTitle: request.title,
          supplierId: invite.supplierId,
          supplierName: invite.supplierName,
          email: invite.email,
          hasExistingSubmission: Boolean(submission),
          submissionStatus: submission?.status,
          actorType: 'supplier_portal',
          requestIdTrace: requestId,
        }
      );
    } catch (auditErr) {
      console.error(`[${requestId}] Audit log failed:`, auditErr.message);
    }

    console.log(`[${requestId}] [supplier_portal] Loaded RFx ${request.id} for tenant ${tenantId}, invite ${invite.id}, elapsed ${Date.now() - startTime}ms`);

    // Organize questions by section
    const sectionsMap = new Map();

    // First, create sections with empty questions arrays
    (request.sections || []).forEach(section => {
      sectionsMap.set(section.id, {
        ...section,
        questions: [],
      });
    });

    // Then, assign questions to their sections
    (request.questions || []).forEach(question => {
      if (question.sectionId && sectionsMap.has(question.sectionId)) {
        sectionsMap.get(question.sectionId).questions.push(question);
      }
    });

    // Convert map to array and sort by order
    const sectionsWithQuestions = Array.from(sectionsMap.values()).sort((a, b) => a.order - b.order);

    // Build response
    const rfxData = {
      id: request.id,
      title: request.title,
      type: request.type || 'RFP',
      description: request.addenda || null,
      deadline: request.deadline,
      status: request.status,
      projectName: request.package?.project?.name || null,
      packageName: request.package?.name || null,
      packageCode: request.package?.code || null,
      sections: sectionsWithQuestions,
      questions: request.questions || [], // Keep flat list for backwards compatibility
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
    console.error(`[${requestId || 'unknown'}] [rfx.public] GET /respond/:responseToken error:`, error);
    return res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// POST /api/public/rfx/respond/:responseToken/save
// Save draft response
router.post('/respond/:responseToken/save', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const { responseToken } = req.params;
    const body = req.body || {};

    console.log(`[${requestId}] [supplier_portal] POST /respond/:token/save - Saving draft`);

    const result = await loadInviteByToken(responseToken);

    if (!result) {
      return res.status(404).json({ error: 'INVALID_TOKEN' });
    }

    if (result.error) {
      return res.status(403).json({ error: result.error });
    }

    const invite = result.invite;

    if (!invite.request) {
      return res.status(404).json({ error: 'RFX_NOT_FOUND' });
    }

    const request = invite.request;
    const tenantId = invite.tenantId;
    const rfxId = request.id;

    // Check if already submitted - return 409 Conflict
    if (invite.submittedAt || invite.status === 'responded') {
      console.log(`[${requestId}] [supplier_portal] Cannot save - already submitted`);
      return res.status(409).json({
        error: 'ALREADY_SUBMITTED',
        message: 'This response has already been submitted and cannot be modified'
      });
    }

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

    // Extract file URLs from answers (keys like q_20 with URLs)
    const fileEntries = [];
    Object.entries(answers).forEach(([key, value]) => {
      if (key.startsWith('q_') && typeof value === 'string' && value.startsWith('/uploads/')) {
        fileEntries.push({
          questionKey: key,
          questionId: Number(key.replace('q_', '')),
          url: value,
        });
      }
    });

    const files = fileEntries.length > 0 ? { uploaded: fileEntries } : null;

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
          requestId: rfxId,
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
            files,
            status: submission.status === 'submitted' ? 'submitted' : 'in_progress',
          },
        });
      } else {
        // Create new
        submission = await prisma.requestResponse.create({
          data: {
            tenantId,
            requestId: rfxId,
            supplierId: -1, // Dummy for manual invites
            stage: 1,
            answers: { ...answers, inviteId: invite.id },
            files,
            status: 'in_progress',
          },
        });
      }
    } else {
      // Regular invite with supplierId
      submission = await prisma.requestResponse.findFirst({
        where: {
          tenantId,
          requestId: rfxId,
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
            files,
            status: submission.status === 'submitted' ? 'submitted' : 'in_progress',
          },
        });
      } else {
        // Create new
        submission = await prisma.requestResponse.create({
          data: {
            tenantId,
            requestId: rfxId,
            supplierId: invite.supplierId,
            stage: 1,
            answers,
            files,
            status: 'in_progress',
          },
        });
      }
    }

    // Update lastSavedAt on invite
    await prisma.requestInvite.update({
      where: { id: invite.id },
      data: { lastSavedAt: new Date() },
    });

    // Audit log: supplier saved draft
    try {
      await writeAudit(
        tenantId,
        null,
        'supplier_response_saved',
        'RequestResponse',
        submission.id,
        {
          requestId: rfxId,
          requestTitle: request.title,
          inviteId: invite.id,
          supplierId: invite.supplierId,
          supplierName: answers.supplierName,
          email: invite.email,
          totalPrice: answers.totalPrice,
          actorType: 'supplier_portal',
          requestIdTrace: requestId,
        }
      );
    } catch (auditErr) {
      console.error(`[${requestId}] Audit log failed:`, auditErr.message);
    }

    console.log(`[${requestId}] [supplier_portal] Saved draft for RFx ${rfxId}, invite ${invite.id}, submission ${submission.id}, elapsed ${Date.now() - startTime}ms`);

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
    console.error(`[${requestId || 'unknown'}] [rfx.public] POST /respond/:responseToken/save error:`, error);
    return res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// POST /api/public/rfx/respond/:responseToken/submit
// Submit final response
router.post('/respond/:responseToken/submit', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const { responseToken } = req.params;
    const body = req.body || {};

    console.log(`[${requestId}] [supplier_portal] POST /respond/:token/submit - Submitting final response`);

    const result = await loadInviteByToken(responseToken);

    if (!result) {
      return res.status(404).json({ error: 'INVALID_TOKEN' });
    }

    if (result.error) {
      return res.status(403).json({ error: result.error });
    }

    const invite = result.invite;

    if (!invite.request) {
      return res.status(404).json({ error: 'RFX_NOT_FOUND' });
    }

    const request = invite.request;
    const tenantId = invite.tenantId;
    const rfxId = request.id;

    // Check if already submitted
    if (invite.submittedAt || invite.status === 'responded') {
      console.log(`[${requestId}] [supplier_portal] Already submitted`);
      return res.status(409).json({
        error: 'ALREADY_SUBMITTED',
        message: 'This response has already been submitted'
      });
    }

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
    const now = new Date();
    inviteUpdates.status = 'responded';
    inviteUpdates.respondedAt = now;
    inviteUpdates.submittedAt = now;

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
          requestId: rfxId,
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
            requestId: rfxId,
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
          requestId: rfxId,
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
            requestId: rfxId,
            supplierId: invite.supplierId,
            stage: 1,
            answers,
            status: 'submitted',
            submittedAt: new Date(),
          },
        });
      }
    }

    // Audit log: supplier submitted response
    try {
      await writeAudit(
        tenantId,
        null,
        'supplier_response_submitted',
        'RequestResponse',
        submission.id,
        {
          requestId: rfxId,
          requestTitle: request.title,
          inviteId: invite.id,
          supplierId: invite.supplierId,
          supplierName: answers.supplierName,
          email: invite.email,
          totalPrice: answers.totalPrice,
          submittedAt: submission.submittedAt,
          actorType: 'supplier_portal',
          requestIdTrace: requestId,
        }
      );
    } catch (auditErr) {
      console.error(`[${requestId}] Audit log failed:`, auditErr.message);
    }

    console.log(`[${requestId}] [supplier_portal] Submitted response for RFx ${rfxId}, invite ${invite.id}, submission ${submission.id}, elapsed ${Date.now() - startTime}ms`);

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
    console.error(`[${requestId || 'unknown'}] [rfx.public] POST /respond/:responseToken/submit error:`, error);
    return res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// POST /respond/:token/upload-file - Upload file for supplier submission
router.post('/respond/:responseToken/upload-file', upload.single('file'), async (req, res) => {
  const requestId = generateRequestId();
  const { responseToken } = req.params;

  try {
    console.log(`[${requestId}] [supplier_portal] POST /respond/:token/upload-file - Uploading file`);

    // Validate token and load invite
    const invite = await loadInviteByToken(responseToken);
    if (!invite) {
      return res.status(404).json({ error: 'INVITE_NOT_FOUND' });
    }

    // Check if already submitted
    if (invite.status === 'responded') {
      return res.status(409).json({ error: 'ALREADY_SUBMITTED', message: 'Cannot upload files after submission' });
    }

    // Validate file
    if (!req.file) {
      return res.status(400).json({ error: 'NO_FILE', message: 'No file provided' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const ext = req.file.originalname.split('.').pop();
    const safeOriginalName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `rfx_${invite.rfxId}_${invite.supplierId}_${timestamp}_${random}.${ext}`;

    // Upload file using storage service
    const result = await storageService.uploadFile(req.file, filename);

    console.log(`[${requestId}] [supplier_portal] File uploaded: ${filename} for RFx ${invite.rfxId}`);

    // Audit log
    await writeAudit({
      tenantId: invite.tenantId,
      userId: null,
      action: 'supplier_file_uploaded',
      entityType: 'RequestInvite',
      entityId: invite.id,
      metadata: {
        requestId: invite.rfxId,
        supplierId: invite.supplierId,
        filename: result.filename,
        originalName: req.file.originalname,
        size: result.size,
        mimetype: result.mimetype,
        actorType: 'supplier_portal',
        requestIdTrace: requestId,
      },
    });

    return res.json({
      success: true,
      file: {
        url: result.url,
        filename: result.filename,
        originalName: req.file.originalname,
        size: result.size,
        mimetype: result.mimetype,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] [supplier_portal] File upload error:`, error);
    return res.status(500).json({ error: 'UPLOAD_FAILED', message: error.message });
  }
});

module.exports = router;
