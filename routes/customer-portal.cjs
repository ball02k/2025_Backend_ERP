// routes/customer-portal.cjs - Customer-facing portal API
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');

module.exports = (prisma) => {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET || 'customer-portal-secret-change-in-production';

  // ============================================================================
  // MIDDLEWARE - Customer Portal Authentication
  // ============================================================================

  const requireCustomerAuth = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET);

      // Check session
      const session = await prisma.customerPortalSession.findFirst({
        where: {
          token,
          expiresAt: { gte: new Date() },
        },
        include: {
          contact: {
            include: {
              client: true,
            },
          },
        },
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          error: { code: 'SESSION_EXPIRED', message: 'Session expired or invalid' },
        });
      }

      // Update last activity
      await prisma.customerPortalSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      });

      // Attach customer info to request
      req.customer = {
        contactId: session.contactId,
        clientId: session.contact.clientId,
        tenantId: session.contact.tenantId,
        contact: session.contact,
        client: session.contact.client,
      };

      next();
    } catch (error) {
      console.error('[Customer Portal Auth Error]', error);
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
      });
    }
  };

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  // POST /api/customer-portal/auth/request-magic-link - Request login link
  router.post('/auth/request-magic-link', async (req, res, next) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: { message: 'Email is required' },
        });
      }

      // Find contact with portal access
      const contact = await prisma.contact.findFirst({
        where: {
          email: email.toLowerCase(),
          portalEnabled: true,
        },
        include: { client: true },
      });

      // Always return success (prevent email enumeration)
      if (!contact) {
        return res.json({
          success: true,
          message: 'If the email exists in our system, a magic link has been sent.',
        });
      }

      // Generate magic link token
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          portalToken: token,
          tokenExpiry: expiry,
        },
      });

      // TODO: Send email with magic link
      // const magicLink = `${process.env.FRONTEND_URL}/customer-portal/auth/verify?token=${token}`;
      console.log('[Magic Link]', `Token for ${email}: ${token}`);

      res.json({
        success: true,
        message: 'If the email exists in our system, a magic link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/customer-portal/auth/verify-magic-link - Verify magic link and create session
  router.post('/auth/verify-magic-link', async (req, res, next) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: { message: 'Token is required' },
        });
      }

      // Find contact with valid token
      const contact = await prisma.contact.findFirst({
        where: {
          portalToken: token,
          tokenExpiry: { gte: new Date() },
          portalEnabled: true,
        },
        include: { client: true },
      });

      if (!contact) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        });
      }

      // Create session
      const sessionToken = jwt.sign(
        { contactId: contact.id, clientId: contact.clientId },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const session = await prisma.customerPortalSession.create({
        data: {
          contactId: contact.id,
          token: sessionToken,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Clear token and update last login
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          portalToken: null,
          tokenExpiry: null,
          lastLoginAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          token: sessionToken,
          contact: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            client: {
              id: contact.client.id,
              name: contact.client.name,
            },
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/customer-portal/auth/logout - Logout and destroy session
  router.post('/auth/logout', requireCustomerAuth, async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      await prisma.customerPortalSession.deleteMany({
        where: { token },
      });

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/customer-portal/auth/me - Get current customer info
  router.get('/auth/me', requireCustomerAuth, async (req, res) => {
    res.json({
      success: true,
      data: {
        contact: {
          id: req.customer.contact.id,
          firstName: req.customer.contact.firstName,
          lastName: req.customer.contact.lastName,
          email: req.customer.contact.email,
          phone: req.customer.contact.phone,
        },
        client: {
          id: req.customer.client.id,
          name: req.customer.client.name,
          address: {
            address1: req.customer.client.address1,
            city: req.customer.client.city,
            postcode: req.customer.client.postcode,
          },
        },
      },
    });
  });

  // ============================================================================
  // JOBS - Customer job management
  // ============================================================================

  // POST /api/customer-portal/jobs - Create a new job request
  router.post('/jobs', requireCustomerAuth, async (req, res, next) => {
    try {
      const { title, description, jobType, priority, siteAddress, scopeOfWork, preferredDate } = req.body;

      if (!title || !jobType) {
        return res.status(400).json({
          success: false,
          error: { message: 'Title and job type are required' },
        });
      }

      // Generate job number
      const count = await prisma.job.count({ where: { tenantId: req.customer.tenantId } });
      const jobNumber = `JOB-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

      const job = await prisma.job.create({
        data: {
          tenantId: req.customer.tenantId,
          jobNumber,
          title,
          description,
          jobType,
          priority: priority || 'NORMAL',
          status: 'DRAFT', // Starts as draft, admin will schedule
          siteAddress: siteAddress || req.customer.client.address1 || '',
          siteCity: req.customer.client.city,
          sitePostcode: req.customer.client.postcode,
          scopeOfWork,
          scheduledStartDate: preferredDate ? new Date(preferredDate) : null,
          clientId: req.customer.clientId,
          createdBy: `customer-${req.customer.contactId}`,
        },
      });

      res.status(201).json({
        success: true,
        data: job,
        message: 'Job request created successfully. Our team will contact you shortly.',
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/customer-portal/jobs - Get customer's jobs
  router.get('/jobs', requireCustomerAuth, async (req, res, next) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      const where = {
        tenantId: req.customer.tenantId,
        clientId: req.customer.clientId,
        isDeleted: false,
      };

      if (status) where.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            schedules: {
              where: { status: { not: 'CANCELLED' } },
              include: {
                worker: {
                  select: { id: true, firstName: true, lastName: true, phone: true },
                },
              },
              orderBy: { startTime: 'desc' },
              take: 1,
            },
          },
        }),
        prisma.job.count({ where }),
      ]);

      res.json({
        success: true,
        data: jobs,
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

  // GET /api/customer-portal/jobs/:id - Get job details
  router.get('/jobs/:id', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;

      const job = await prisma.job.findFirst({
        where: {
          id,
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
          isDeleted: false,
        },
        include: {
          schedules: {
            where: { status: { not: 'CANCELLED' } },
            include: {
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  email: true,
                },
              },
            },
            orderBy: { startTime: 'asc' },
          },
          materials: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'asc' },
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

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/customer-portal/jobs/:id/track - Track engineer location
  router.get('/jobs/:id/track', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;

      // Get job with active schedule
      const job = await prisma.job.findFirst({
        where: {
          id,
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
          isDeleted: false,
        },
        include: {
          schedules: {
            where: {
              status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
              startTime: { lte: new Date(Date.now() + 4 * 60 * 60 * 1000) }, // Within 4 hours
            },
            include: {
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
            },
            orderBy: { startTime: 'asc' },
            take: 1,
          },
        },
      });

      if (!job || !job.schedules.length) {
        return res.json({
          success: true,
          data: {
            trackingAvailable: false,
            message: 'No active job schedule found for tracking',
          },
        });
      }

      const schedule = job.schedules[0];

      // TODO: Get real-time location from worker's device/GPS
      // For now, return mock data
      res.json({
        success: true,
        data: {
          trackingAvailable: true,
          job: {
            id: job.id,
            jobNumber: job.jobNumber,
            title: job.title,
            status: job.status,
          },
          schedule: {
            id: schedule.id,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            status: schedule.status,
          },
          engineer: {
            name: `${schedule.worker.firstName} ${schedule.worker.lastName}`,
            phone: schedule.worker.phone,
          },
          location: {
            // Mock location - replace with real GPS data
            latitude: job.siteLatitude ? parseFloat(job.siteLatitude) : 51.5074,
            longitude: job.siteLongitude ? parseFloat(job.siteLongitude) : -0.1278,
            lastUpdated: new Date().toISOString(),
          },
          estimatedArrival: schedule.startTime,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // SCHEDULING - Appointment management
  // ============================================================================

  // GET /api/customer-portal/scheduling/slots - Get available appointment slots
  router.get('/scheduling/slots', requireCustomerAuth, async (req, res, next) => {
    try {
      const { startDate, endDate, duration = 2 } = req.query; // duration in hours

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Get all schedules in the date range
      const existingSchedules = await prisma.jobSchedule.findMany({
        where: {
          tenantId: req.customer.tenantId,
          status: { not: 'CANCELLED' },
          startTime: {
            gte: start,
            lte: end,
          },
        },
        include: {
          worker: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      // Get available workers
      const workers = await prisma.worker.findMany({
        where: {
          tenantId: req.customer.tenantId,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });

      // Generate time slots (9 AM - 5 PM, every 2 hours)
      const slots = [];
      const currentDate = new Date(start);

      while (currentDate <= end) {
        // Skip weekends
        if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        for (let hour = 9; hour <= 17; hour += parseInt(duration)) {
          const slotStart = new Date(currentDate);
          slotStart.setHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setHours(hour + parseInt(duration), 0, 0, 0);

          // Check availability
          const availableWorkers = workers.filter((worker) => {
            const hasConflict = existingSchedules.some(
              (schedule) =>
                schedule.workerId === worker.id &&
                schedule.startTime < slotEnd &&
                schedule.endTime > slotStart
            );
            return !hasConflict;
          });

          if (availableWorkers.length > 0) {
            slots.push({
              startTime: slotStart.toISOString(),
              endTime: slotEnd.toISOString(),
              available: true,
              availableWorkers: availableWorkers.length,
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json({
        success: true,
        data: {
          slots,
          totalSlots: slots.length,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/customer-portal/jobs/:id/reschedule - Request reschedule
  router.post('/jobs/:id/reschedule', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { newStartTime, reason } = req.body;

      if (!newStartTime) {
        return res.status(400).json({
          success: false,
          error: { message: 'newStartTime is required' },
        });
      }

      // Get job with existing schedule
      const job = await prisma.job.findFirst({
        where: {
          id,
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
          isDeleted: false,
        },
        include: {
          schedules: {
            where: { status: { in: ['PENDING', 'CONFIRMED'] } },
            orderBy: { startTime: 'asc' },
            take: 1,
          },
        },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: { message: 'Job not found' },
        });
      }

      if (!job.schedules.length) {
        return res.status(400).json({
          success: false,
          error: { message: 'No active schedule to reschedule' },
        });
      }

      const schedule = job.schedules[0];
      const currentScheduleTime = new Date(schedule.startTime);
      const requestedTime = new Date(newStartTime);
      const now = new Date();

      // Validation: Cannot reschedule within 24 hours
      const hoursUntilScheduled = (currentScheduleTime - now) / (1000 * 60 * 60);
      if (hoursUntilScheduled < 24) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TOO_LATE_TO_RESCHEDULE',
            message: 'Cannot reschedule within 24 hours of scheduled time. Please contact support.',
          },
        });
      }

      // Validation: New time must be in the future
      if (requestedTime <= now) {
        return res.status(400).json({
          success: false,
          error: { message: 'New schedule time must be in the future' },
        });
      }

      // Create a note on the job for reschedule request
      await prisma.jobNote.create({
        data: {
          tenantId: req.customer.tenantId,
          jobId: job.id,
          noteType: 'GENERAL',
          content: `Customer requested reschedule from ${currentScheduleTime.toISOString()} to ${requestedTime.toISOString()}. Reason: ${reason || 'Not provided'}`,
          createdBy: `customer-${req.customer.contactId}`,
        },
      });

      // TODO: Notify admin/dispatcher about reschedule request
      // TODO: Automatically update schedule if new time is available

      res.json({
        success: true,
        message: 'Reschedule request received. Our team will contact you to confirm the new time.',
        data: {
          currentSchedule: {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
          },
          requestedTime: newStartTime,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // INVOICES - View and pay invoices
  // ============================================================================

  // GET /api/customer-portal/invoices - Get customer's invoices
  router.get('/invoices', requireCustomerAuth, async (req, res, next) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      const where = {
        tenantId: req.customer.tenantId,
        isDeleted: false,
      };

      // Link invoices through project → client relationship
      // We need to get projects for this client first
      const clientProjects = await prisma.project.findMany({
        where: {
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
        },
        select: { id: true },
      });

      const projectIds = clientProjects.map((p) => p.id);

      if (projectIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 },
        });
      }

      where.projectId = { in: projectIds };
      if (status) where.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take,
          orderBy: { invoiceDate: 'desc' },
          include: {
            lines: true,
            project: {
              select: { id: true, name: true, code: true },
            },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      res.json({
        success: true,
        data: invoices,
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

  // GET /api/customer-portal/invoices/:id - Get invoice details
  router.get('/invoices/:id', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;

      // Get customer's projects
      const clientProjects = await prisma.project.findMany({
        where: {
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
        },
        select: { id: true },
      });

      const projectIds = clientProjects.map((p) => p.id);

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: parseInt(id),
          tenantId: req.customer.tenantId,
          projectId: { in: projectIds },
          isDeleted: false,
        },
        include: {
          lines: true,
          project: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: { message: 'Invoice not found' },
        });
      }

      res.json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/customer-portal/invoices/:id/pay - Initialize payment for invoice
  router.post('/invoices/:id/pay', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { paymentMethod = 'card' } = req.body;

      // Get customer's projects
      const clientProjects = await prisma.project.findMany({
        where: {
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
        },
        select: { id: true },
      });

      const projectIds = clientProjects.map((p) => p.id);

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: parseInt(id),
          tenantId: req.customer.tenantId,
          projectId: { in: projectIds },
          status: { not: 'PAID' },
          isDeleted: false,
        },
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: { message: 'Invoice not found or already paid' },
        });
      }

      // TODO: Integration with payment provider (Stripe, PayPal, etc.)
      // For now, return payment intent info
      const paymentIntent = {
        id: `pi_${crypto.randomBytes(16).toString('hex')}`,
        amount: parseFloat(invoice.totalAmount),
        currency: invoice.currency || 'GBP',
        status: 'requires_payment_method',
        clientSecret: `pi_secret_${crypto.randomBytes(16).toString('hex')}`,
      };

      res.json({
        success: true,
        data: {
          invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            currency: invoice.currency || 'GBP',
          },
          payment: paymentIntent,
          message: 'Payment initiated. Use clientSecret to complete payment.',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // QUOTES - View and approve quotes
  // ============================================================================

  // GET /api/customer-portal/quotes - Get customer's quotes (variations as quotes)
  router.get('/quotes', requireCustomerAuth, async (req, res, next) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      // Get client's projects
      const clientProjects = await prisma.project.findMany({
        where: {
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
        },
        select: { id: true },
      });

      const projectIds = clientProjects.map((p) => p.id);

      if (projectIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 },
        });
      }

      const where = {
        tenantId: req.customer.tenantId,
        projectId: { in: projectIds },
        isDeleted: false,
      };

      if (status) where.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [variations, total] = await Promise.all([
        prisma.variation.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            project: {
              select: { id: true, name: true, code: true },
            },
          },
        }),
        prisma.variation.count({ where }),
      ]);

      res.json({
        success: true,
        data: variations,
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

  // POST /api/customer-portal/quotes/:id/approve - Approve a quote
  router.post('/quotes/:id/approve', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { comments } = req.body;

      // Get client's projects
      const clientProjects = await prisma.project.findMany({
        where: {
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
        },
        select: { id: true },
      });

      const projectIds = clientProjects.map((p) => p.id);

      const variation = await prisma.variation.findFirst({
        where: {
          id: parseInt(id),
          tenantId: req.customer.tenantId,
          projectId: { in: projectIds },
          status: 'PENDING',
          isDeleted: false,
        },
      });

      if (!variation) {
        return res.status(404).json({
          success: false,
          error: { message: 'Quote not found or already processed' },
        });
      }

      // Update variation status to approved
      const updatedVariation = await prisma.variation.update({
        where: { id: parseInt(id) },
        data: {
          status: 'APPROVED',
          approvedDate: new Date(),
          approvalComments: comments,
        },
      });

      res.json({
        success: true,
        data: updatedVariation,
        message: 'Quote approved successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/customer-portal/quotes/:id/reject - Reject a quote
  router.post('/quotes/:id/reject', requireCustomerAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: { message: 'Rejection reason is required' },
        });
      }

      // Get client's projects
      const clientProjects = await prisma.project.findMany({
        where: {
          tenantId: req.customer.tenantId,
          clientId: req.customer.clientId,
        },
        select: { id: true },
      });

      const projectIds = clientProjects.map((p) => p.id);

      const variation = await prisma.variation.findFirst({
        where: {
          id: parseInt(id),
          tenantId: req.customer.tenantId,
          projectId: { in: projectIds },
          status: 'PENDING',
          isDeleted: false,
        },
      });

      if (!variation) {
        return res.status(404).json({
          success: false,
          error: { message: 'Quote not found or already processed' },
        });
      }

      // Update variation status to rejected
      const updatedVariation = await prisma.variation.update({
        where: { id: parseInt(id) },
        data: {
          status: 'REJECTED',
          rejectionDate: new Date(),
          rejectionReason: reason,
        },
      });

      res.json({
        success: true,
        data: updatedVariation,
        message: 'Quote rejected',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
