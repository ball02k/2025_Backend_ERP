// routes/subcontractor-portal.cjs
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

module.exports = (prisma) => {
  const router = express.Router();

  // ============================================================================
  // MIDDLEWARE - Subcontractor Authentication
  // ============================================================================

  const requireSubcontractorAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: { code: 'NO_TOKEN', message: 'Authentication required' },
        });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);

      // Validate session
      const session = await prisma.subcontractorPortalSession.findFirst({
        where: {
          token: decoded.sessionToken,
          expiresAt: { gt: new Date() },
        },
        include: {
          worker: {
            select: {
              id: true,
              tenantId: true,
              workerNumber: true,
              firstName: true,
              lastName: true,
              email: true,
              employmentType: true,
              portalEnabled: true,
              companyName: true,
              isActive: true,
              isDeleted: true,
            },
          },
        },
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_SESSION', message: 'Session expired or invalid' },
        });
      }

      if (!session.worker.portalEnabled || session.worker.isDeleted || !session.worker.isActive) {
        return res.status(403).json({
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'Portal access disabled' },
        });
      }

      // Update last activity
      await prisma.subcontractorPortalSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      });

      req.subcontractor = {
        workerId: session.worker.id,
        tenantId: session.worker.tenantId,
        workerNumber: session.worker.workerNumber,
        name: `${session.worker.firstName} ${session.worker.lastName}`,
        email: session.worker.email,
        employmentType: session.worker.employmentType,
        companyName: session.worker.companyName,
      };

      next();
    } catch (error) {
      console.error('[Subcontractor Auth Error]', error);
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Authentication failed' },
      });
    }
  };

  // Helper function for audit logging
  const logAudit = async (action, entityType, entityId, description, workerId, metadata = {}) => {
    try {
      await prisma.auditLog.create({
        data: {
          userId: null, // Using existing AuditLog model which uses userId
          entity: entityType,
          entityId: entityId || '',
          action,
          changes: {
            performerId: workerId,
            performerType: 'SUBCONTRACTOR',
            description,
            ...metadata,
          },
          ipAddress: metadata.ipAddress || null,
        },
      });
    } catch (error) {
      console.error('[Audit Log Error]', error);
    }
  };

  // ============================================================================
  // AUTHENTICATION ROUTES
  // ============================================================================

  // POST /api/subcontractor-portal/auth/request-magic-link
  router.post('/auth/request-magic-link', async (req, res, next) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: { message: 'Email is required' },
        });
      }

      const worker = await prisma.worker.findFirst({
        where: {
          email: email.toLowerCase(),
          portalEnabled: true,
          employmentType: { in: ['SUBCONTRACTOR', 'CONTRACTOR'] },
          isActive: true,
          isDeleted: false,
        },
      });

      // Always return success to prevent email enumeration
      if (!worker) {
        console.log('[Subcontractor Magic Link] Worker not found or not authorized:', email);
        return res.json({
          success: true,
          message: 'If the email exists in our system, a magic link has been sent.',
        });
      }

      // Generate magic link token
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.worker.update({
        where: { id: worker.id },
        data: {
          portalToken: token,
          tokenExpiry: expiry,
        },
      });

      // In production, send email here
      console.log('[Subcontractor Magic Link]', `Token for ${email}: ${token}`);
      console.log('[Subcontractor Magic Link]', `Link: http://localhost:5173/subcontractor/auth/verify?token=${token}`);

      // Audit log
      await logAudit(
        'MAGIC_LINK_REQUEST',
        'WORKER',
        worker.id,
        `Subcontractor ${worker.firstName} ${worker.lastName} requested magic link`,
        worker.id,
        { email, ipAddress: req.ip }
      );

      res.json({
        success: true,
        message: 'If the email exists in our system, a magic link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/auth/verify-magic-link
  router.post('/auth/verify-magic-link', async (req, res, next) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: { message: 'Token is required' },
        });
      }

      const worker = await prisma.worker.findFirst({
        where: {
          portalToken: token,
          tokenExpiry: { gt: new Date() },
          portalEnabled: true,
          isActive: true,
          isDeleted: false,
        },
      });

      if (!worker) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        });
      }

      // Create session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const session = await prisma.subcontractorPortalSession.create({
        data: {
          tenantId: worker.tenantId,
          workerId: worker.id,
          token: sessionToken,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          expiresAt,
        },
      });

      // Clear magic link token and update last login
      await prisma.worker.update({
        where: { id: worker.id },
        data: {
          portalToken: null,
          tokenExpiry: null,
          lastLoginAt: new Date(),
        },
      });

      // Generate JWT
      const jwtToken = jwt.sign(
        {
          sessionToken: session.token,
          workerId: worker.id,
          type: 'subcontractor',
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Audit log
      await logAudit(
        'LOGIN',
        'WORKER',
        worker.id,
        `Subcontractor ${worker.firstName} ${worker.lastName} logged in`,
        worker.id,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );

      res.json({
        success: true,
        data: {
          token: jwtToken,
          worker: {
            id: worker.id,
            workerNumber: worker.workerNumber,
            firstName: worker.firstName,
            lastName: worker.lastName,
            email: worker.email,
            companyName: worker.companyName,
            employmentType: worker.employmentType,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/auth/logout
  router.post('/auth/logout', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);

      await prisma.subcontractorPortalSession.deleteMany({
        where: { token: decoded.sessionToken },
      });

      // Audit log
      await logAudit(
        'LOGOUT',
        'WORKER',
        req.subcontractor.workerId,
        `Subcontractor ${req.subcontractor.name} logged out`,
        req.subcontractor.workerId
      );

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // JOB MANAGEMENT ROUTES
  // ============================================================================

  // GET /api/subcontractor-portal/jobs - List jobs assigned to this subcontractor
  router.get('/jobs', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      const where = {
        workerId: req.subcontractor.workerId,
        job: {
          tenantId: req.subcontractor.tenantId,
          isDeleted: false,
        },
      };

      if (status) {
        where.status = status;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [schedules, total] = await Promise.all([
        prisma.jobSchedule.findMany({
          where,
          skip,
          take,
          include: {
            job: {
              include: {
                client: {
                  select: { id: true, clientNumber: true, clientName: true, phone: true, email: true },
                },
                site: {
                  select: { id: true, siteName: true, address: true, city: true, postcode: true },
                },
              },
            },
          },
          orderBy: { startTime: 'desc' },
        }),
        prisma.jobSchedule.count({ where }),
      ]);

      res.json({
        success: true,
        data: schedules,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/subcontractor-portal/jobs/:id - Get single job details
  router.get('/jobs/:id', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { id } = req.params;

      const job = await prisma.job.findFirst({
        where: {
          id,
          tenantId: req.subcontractor.tenantId,
          isDeleted: false,
        },
        include: {
          client: {
            select: { id: true, clientNumber: true, clientName: true, phone: true, email: true },
          },
          site: {
            select: { id: true, siteName: true, address: true, city: true, postcode: true },
          },
          schedules: {
            where: { workerId: req.subcontractor.workerId },
            include: {
              worker: {
                select: { id: true, workerNumber: true, firstName: true, lastName: true },
              },
            },
          },
          materials: {
            where: { isDeleted: false },
          },
          notes: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: { message: 'Job not found' },
        });
      }

      // Check if subcontractor is assigned to this job
      const isAssigned = job.schedules.some((s) => s.workerId === req.subcontractor.workerId);

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'You are not assigned to this job' },
        });
      }

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/jobs/:id/accept - Accept job assignment
  router.post('/jobs/:id/accept', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const schedule = await prisma.jobSchedule.findFirst({
        where: {
          id,
          workerId: req.subcontractor.workerId,
          status: 'PENDING',
        },
        include: { job: true },
      });

      if (!schedule) {
        return res.status(404).json({
          success: false,
          error: { message: 'Job assignment not found or already processed' },
        });
      }

      const updatedSchedule = await prisma.jobSchedule.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          notes: notes || schedule.notes,
        },
        include: {
          job: true,
          worker: true,
        },
      });

      // Create job note
      await prisma.jobNote.create({
        data: {
          tenantId: req.subcontractor.tenantId,
          jobId: schedule.jobId,
          noteType: 'GENERAL',
          content: `Subcontractor ${req.subcontractor.name} accepted job assignment${notes ? ': ' + notes : ''}`,
          createdBy: `subcontractor-${req.subcontractor.workerId}`,
        },
      });

      // Audit log
      await logAudit(
        'JOB_ACCEPTED',
        'JOB_SCHEDULE',
        schedule.id,
        `Job ${schedule.job.jobNumber} accepted by subcontractor ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { jobId: schedule.jobId, jobNumber: schedule.job.jobNumber }
      );

      res.json({
        success: true,
        data: updatedSchedule,
        message: 'Job accepted successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/jobs/:id/reject - Reject job assignment
  router.post('/jobs/:id/reject', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: { message: 'Rejection reason is required' },
        });
      }

      const schedule = await prisma.jobSchedule.findFirst({
        where: {
          id,
          workerId: req.subcontractor.workerId,
          status: 'PENDING',
        },
        include: { job: true },
      });

      if (!schedule) {
        return res.status(404).json({
          success: false,
          error: { message: 'Job assignment not found or already processed' },
        });
      }

      const updatedSchedule = await prisma.jobSchedule.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: `Rejected by subcontractor: ${reason}`,
        },
      });

      // Create job note
      await prisma.jobNote.create({
        data: {
          tenantId: req.subcontractor.tenantId,
          jobId: schedule.jobId,
          noteType: 'GENERAL',
          content: `Subcontractor ${req.subcontractor.name} rejected job assignment. Reason: ${reason}`,
          createdBy: `subcontractor-${req.subcontractor.workerId}`,
        },
      });

      // Audit log
      await logAudit(
        'JOB_REJECTED',
        'JOB_SCHEDULE',
        schedule.id,
        `Job ${schedule.job.jobNumber} rejected by subcontractor ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { jobId: schedule.jobId, jobNumber: schedule.job.jobNumber, reason }
      );

      res.json({
        success: true,
        data: updatedSchedule,
        message: 'Job rejected',
      });
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/subcontractor-portal/jobs/:id/status - Update job status
  router.patch('/jobs/:id/status', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const allowedStatuses = ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD'];

      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { message: `Status must be one of: ${allowedStatuses.join(', ')}` },
        });
      }

      const schedule = await prisma.jobSchedule.findFirst({
        where: {
          id,
          workerId: req.subcontractor.workerId,
          status: { in: ['CONFIRMED', 'IN_PROGRESS', 'ON_HOLD'] },
        },
        include: { job: true },
      });

      if (!schedule) {
        return res.status(404).json({
          success: false,
          error: { message: 'Job assignment not found or cannot be updated' },
        });
      }

      const updatedSchedule = await prisma.jobSchedule.update({
        where: { id },
        data: {
          status,
          actualStartTime: status === 'IN_PROGRESS' && !schedule.actualStartTime ? new Date() : schedule.actualStartTime,
          actualEndTime: status === 'COMPLETED' ? new Date() : null,
        },
        include: { job: true },
      });

      // Update job status if completed
      if (status === 'COMPLETED') {
        await prisma.job.update({
          where: { id: schedule.jobId },
          data: { status: 'COMPLETED' },
        });
      }

      // Create job note
      if (notes) {
        await prisma.jobNote.create({
          data: {
            tenantId: req.subcontractor.tenantId,
            jobId: schedule.jobId,
            noteType: 'GENERAL',
            content: `Status update by ${req.subcontractor.name}: ${notes}`,
            createdBy: `subcontractor-${req.subcontractor.workerId}`,
          },
        });
      }

      // Audit log
      await logAudit(
        'JOB_STATUS_UPDATED',
        'JOB_SCHEDULE',
        schedule.id,
        `Job ${schedule.job.jobNumber} status updated to ${status} by ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { jobId: schedule.jobId, jobNumber: schedule.job.jobNumber, oldStatus: schedule.status, newStatus: status }
      );

      res.json({
        success: true,
        data: updatedSchedule,
        message: 'Job status updated successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/jobs/:id/notes - Add note to job
  router.post('/jobs/:id/notes', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content, noteType = 'GENERAL' } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: { message: 'Note content is required' },
        });
      }

      // Verify subcontractor is assigned to this job
      const schedule = await prisma.jobSchedule.findFirst({
        where: {
          jobId: id,
          workerId: req.subcontractor.workerId,
        },
        include: { job: true },
      });

      if (!schedule) {
        return res.status(403).json({
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'You are not assigned to this job' },
        });
      }

      const note = await prisma.jobNote.create({
        data: {
          tenantId: req.subcontractor.tenantId,
          jobId: id,
          noteType,
          content,
          createdBy: `subcontractor-${req.subcontractor.workerId}`,
        },
      });

      // Audit log
      await logAudit(
        'NOTE_ADDED',
        'JOB',
        id,
        `Note added to job ${schedule.job.jobNumber} by ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { jobId: id, jobNumber: schedule.job.jobNumber }
      );

      res.status(201).json({
        success: true,
        data: note,
        message: 'Note added successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // DOCUMENT MANAGEMENT ROUTES
  // ============================================================================

  // GET /api/subcontractor-portal/documents - List my documents
  router.get('/documents', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { documentType, status } = req.query;

      const where = {
        workerId: req.subcontractor.workerId,
        tenantId: req.subcontractor.tenantId,
      };

      if (documentType) where.documentType = documentType;
      if (status) where.status = status;

      const documents = await prisma.subcontractorDocument.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
      });

      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/documents - Upload document
  router.post('/documents', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const {
        documentType,
        documentName,
        fileName,
        fileUrl,
        fileSize,
        mimeType,
        expiryDate,
        issuer,
        referenceNo,
        description,
      } = req.body;

      if (!documentType || !documentName || !fileName || !fileUrl) {
        return res.status(400).json({
          success: false,
          error: { message: 'documentType, documentName, fileName, and fileUrl are required' },
        });
      }

      const document = await prisma.subcontractorDocument.create({
        data: {
          tenantId: req.subcontractor.tenantId,
          workerId: req.subcontractor.workerId,
          documentType,
          documentName,
          fileName,
          fileUrl,
          fileSize: fileSize || null,
          mimeType: mimeType || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          issuer: issuer || null,
          referenceNo: referenceNo || null,
          description: description || null,
          status: 'PENDING',
        },
      });

      // Audit log
      await logAudit(
        'DOCUMENT_UPLOADED',
        'SUBCONTRACTOR_DOCUMENT',
        document.id,
        `Document ${documentName} uploaded by ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { documentType, fileName }
      );

      res.status(201).json({
        success: true,
        data: document,
        message: 'Document uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/subcontractor-portal/documents/:id - Delete document
  router.delete('/documents/:id', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { id } = req.params;

      const document = await prisma.subcontractorDocument.findFirst({
        where: {
          id,
          workerId: req.subcontractor.workerId,
          tenantId: req.subcontractor.tenantId,
        },
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: { message: 'Document not found' },
        });
      }

      await prisma.subcontractorDocument.delete({
        where: { id },
      });

      // Audit log
      await logAudit(
        'DOCUMENT_DELETED',
        'SUBCONTRACTOR_DOCUMENT',
        id,
        `Document ${document.documentName} deleted by ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { documentType: document.documentType, fileName: document.fileName }
      );

      res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // PROFILE ROUTES
  // ============================================================================

  // GET /api/subcontractor-portal/profile - Get my profile
  router.get('/profile', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const worker = await prisma.worker.findUnique({
        where: { id: req.subcontractor.workerId },
        select: {
          id: true,
          workerNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          skills: true,
          certifications: true,
          employmentType: true,
          companyName: true,
          businessRegNo: true,
          vatNumber: true,
          insuranceProvider: true,
          insuranceExpiry: true,
          insurancePolicyNo: true,
          complianceNotes: true,
          hourlyRate: true,
          hireDate: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      res.json({
        success: true,
        data: worker,
      });
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/subcontractor-portal/profile - Update my profile
  router.patch('/profile', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { phone, skills, companyName, businessRegNo, vatNumber, insuranceProvider, insurancePolicyNo } = req.body;

      const updateData = {};
      if (phone !== undefined) updateData.phone = phone;
      if (skills !== undefined) updateData.skills = skills;
      if (companyName !== undefined) updateData.companyName = companyName;
      if (businessRegNo !== undefined) updateData.businessRegNo = businessRegNo;
      if (vatNumber !== undefined) updateData.vatNumber = vatNumber;
      if (insuranceProvider !== undefined) updateData.insuranceProvider = insuranceProvider;
      if (insurancePolicyNo !== undefined) updateData.insurancePolicyNo = insurancePolicyNo;

      const worker = await prisma.worker.update({
        where: { id: req.subcontractor.workerId },
        data: updateData,
        select: {
          id: true,
          workerNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          skills: true,
          employmentType: true,
          companyName: true,
          businessRegNo: true,
          vatNumber: true,
        },
      });

      // Audit log
      await logAudit(
        'PROFILE_UPDATED',
        'WORKER',
        req.subcontractor.workerId,
        `Profile updated by ${req.subcontractor.name}`,
        req.subcontractor.workerId,
        { changes: updateData }
      );

      res.json({
        success: true,
        data: worker,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // AVAILABILITY ROUTES
  // ============================================================================

  // GET /api/subcontractor-portal/availability - Get my availability
  router.get('/availability', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;

      const where = {
        workerId: req.subcontractor.workerId,
        tenantId: req.subcontractor.tenantId,
      };

      if (startDate && endDate) {
        where.date = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      }

      const availability = await prisma.workerAvailability.findMany({
        where,
        orderBy: { date: 'asc' },
      });

      res.json({
        success: true,
        data: availability,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/subcontractor-portal/availability - Set availability
  router.post('/availability', requireSubcontractorAuth, async (req, res, next) => {
    try {
      const { date, startTime, endTime, isAvailable, reason } = req.body;

      if (!date) {
        return res.status(400).json({
          success: false,
          error: { message: 'Date is required' },
        });
      }

      const availability = await prisma.workerAvailability.upsert({
        where: {
          workerId_date: {
            workerId: req.subcontractor.workerId,
            date: new Date(date),
          },
        },
        create: {
          tenantId: req.subcontractor.tenantId,
          workerId: req.subcontractor.workerId,
          date: new Date(date),
          startTime: startTime ? new Date(startTime) : null,
          endTime: endTime ? new Date(endTime) : null,
          isAvailable: isAvailable !== undefined ? isAvailable : true,
          reason: reason || null,
        },
        update: {
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          isAvailable: isAvailable !== undefined ? isAvailable : undefined,
          reason: reason || undefined,
        },
      });

      // Audit log
      await logAudit(
        'AVAILABILITY_UPDATED',
        'WORKER_AVAILABILITY',
        availability.id,
        `Availability updated by ${req.subcontractor.name} for ${date}`,
        req.subcontractor.workerId,
        { date, isAvailable }
      );

      res.status(201).json({
        success: true,
        data: availability,
        message: 'Availability updated successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
