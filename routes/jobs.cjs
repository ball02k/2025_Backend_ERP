// routes/jobs.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { generateJobNumber } = require('../utils/autoNumbering.cjs');
const {
  jobQuerySchema,
  createJobSchema,
  updateJobSchema,
  changeStatusSchema,
} = require('../lib/validation.jobs.cjs');
const { sseEmitter, EventTypes } = require('../services/eventEmitter.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  function parseOptionalPositiveInt(value, label) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      const error = new Error(`${label} must be a positive integer`);
      error.statusCode = 400;
      throw error;
    }
    return parsed;
  }

  // ============================================================================
  // GET /api/jobs - List jobs with filters
  // ============================================================================
  router.get('/', requirePerm('jobs:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const query = jobQuerySchema.parse(req.query);

      // Build where clause
      const where = {
        tenantId,
        isDeleted: false,
      };

      if (query.status) {
        const statuses = String(query.status)
          .split(',')
          .map((status) => status.trim())
          .filter(Boolean);
        where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
      }
      if (query.priority) where.priority = query.priority;
      if (query.jobType) where.jobType = query.jobType;
      if (query.clientId) where.clientId = parseOptionalPositiveInt(query.clientId, 'clientId');
      if (query.projectId) where.projectId = parseOptionalPositiveInt(query.projectId, 'projectId');
      if (query.packageId) where.packageId = query.packageId;
      if (query.contractId) where.contractId = query.contractId;

      // Date filtering
      if (query.scheduledAfter || query.scheduledBefore) {
        where.scheduledStartDate = {};
        if (query.scheduledAfter) where.scheduledStartDate.gte = new Date(query.scheduledAfter);
        if (query.scheduledBefore) where.scheduledStartDate.lte = new Date(query.scheduledBefore);
      }

      // Search
      if (query.search) {
        where.OR = [
          { jobNumber: { contains: query.search, mode: 'insensitive' } },
          { title: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      // Pagination
      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      // Get total count
      const total = await prisma.job.count({ where });

      // Get jobs
      const jobs = await prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: {
          [query.sort]: query.order,
        },
        include: {
          schedules: {
            where: { isDeleted: false },
            include: {
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                },
              },
            },
          },
          _count: {
            select: {
              materials: true,
              timeEntries: true,
              notes: true,
              checklists: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: jobs,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (error) {
      console.error('Error fetching jobs:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to fetch jobs',
      });
    }
  });

  // ============================================================================
  // GET /api/jobs/:id - Get single job
  // ============================================================================
  router.get('/:id', requirePerm('jobs:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const job = await prisma.job.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false,
        },
        include: {
          schedules: {
            where: { isDeleted: false },
            include: {
              worker: true,
              equipment: true,
            },
          },
          materials: {
            where: { isDeleted: false },
          },
          timeEntries: {
            where: { isDeleted: false },
            include: {
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          notes: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
          },
          statusHistory: {
            orderBy: { changedAt: 'desc' },
          },
          documents: {
            where: { isDeleted: false },
          },
          checklists: {
            orderBy: { displayOrder: 'asc' },
          },
          jobAssets: {
            include: {
              asset: true,
            },
          },
        },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      console.error('Error fetching job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch job',
      });
    }
  });

  // ============================================================================
  // POST /api/jobs - Create new job
  // ============================================================================
  router.post('/', requirePerm('jobs:create'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { assetIds, ...jobData } = req.body;
      const data = createJobSchema.parse(jobData);

      // Generate job number
      const jobNumber = await generateJobNumber(tenantId);

      // Create job
      const job = await prisma.job.create({
        data: {
          ...data,
          tenantId,
          jobNumber,
          status: 'DRAFT',
          createdBy: String(userId),
          // Convert datetime strings to Date objects
          scheduledStartDate: data.scheduledStartDate ? new Date(data.scheduledStartDate) : undefined,
          scheduledEndDate: data.scheduledEndDate ? new Date(data.scheduledEndDate) : undefined,
        },
        include: {
          schedules: true,
          materials: true,
          jobAssets: {
            include: {
              asset: true,
            },
          },
        },
      });

      // Create job-asset relationships if assetIds provided
      if (assetIds && Array.isArray(assetIds) && assetIds.length > 0) {
        await prisma.jobAsset.createMany({
          data: assetIds.map((assetId) => ({
            tenantId,
            jobId: job.id,
            assetId,
            createdBy: String(userId),
          })),
        });
      }

      // Create initial status history
      await prisma.jobStatusHistory.create({
        data: {
          tenantId,
          jobId: job.id,
          oldStatus: 'DRAFT',
          newStatus: 'DRAFT',
          changeReason: 'Job created',
          changedBy: String(userId),
        },
      });

      // Fetch the complete job with assets
      const completeJob = await prisma.job.findUnique({
        where: { id: job.id },
        include: {
          schedules: true,
          materials: true,
          jobAssets: {
            include: {
              asset: true,
            },
          },
        },
      });

      // Emit real-time event
      sseEmitter.emitToTenant(tenantId, EventTypes.JOB_CREATED, {
        job: completeJob,
        jobId: completeJob.id,
        jobNumber: completeJob.jobNumber,
        status: completeJob.status,
      });

      res.status(201).json({
        success: true,
        data: completeJob,
        message: `Job ${jobNumber} created successfully`,
      });
    } catch (error) {
      console.error('Error creating job:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create job',
      });
    }
  });

  // ============================================================================
  // PATCH /api/jobs/:id - Update job
  // ============================================================================
  router.patch('/:id', requirePerm('jobs:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = updateJobSchema.parse(req.body);

      // Check if job exists
      const existingJob = await prisma.job.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      // Update job
      const job = await prisma.job.update({
        where: { id },
        data: {
          ...data,
          updatedBy: String(userId),
          // Convert datetime strings to Date objects
          scheduledStartDate: data.scheduledStartDate ? new Date(data.scheduledStartDate) : undefined,
          scheduledEndDate: data.scheduledEndDate ? new Date(data.scheduledEndDate) : undefined,
        },
        include: {
          schedules: true,
          materials: true,
        },
      });

      // Emit real-time event
      sseEmitter.emitToTenant(tenantId, EventTypes.JOB_UPDATED, {
        job,
        jobId: job.id,
        jobNumber: job.jobNumber,
        changes: Object.keys(data),
        oldJob: existingJob,
      });

      res.json({
        success: true,
        data: job,
        message: 'Job updated successfully',
      });
    } catch (error) {
      console.error('Error updating job:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update job',
      });
    }
  });

  // ============================================================================
  // DELETE /api/jobs/:id - Soft delete job
  // ============================================================================
  router.delete('/:id', requirePerm('jobs:delete'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      // Check if job exists
      const existingJob = await prisma.job.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      // Soft delete
      await prisma.job.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: String(userId),
        },
      });

      // Emit real-time event
      sseEmitter.emitToTenant(tenantId, EventTypes.JOB_DELETED, {
        jobId: id,
        jobNumber: existingJob.jobNumber,
        deletedBy: userId,
      });

      res.json({
        success: true,
        message: 'Job deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete job',
      });
    }
  });

  // ============================================================================
  // POST /api/jobs/:id/status - Change job status
  // ============================================================================
  router.post('/:id/status', requirePerm('jobs:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const { newStatus, reason } = changeStatusSchema.parse(req.body);

      // Get current job
      const job = await prisma.job.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      const oldStatus = job.status;

      // Update job status
      const updatedJob = await prisma.job.update({
        where: { id },
        data: {
          status: newStatus,
          updatedBy: String(userId),
          // Set timestamps based on status
          actualStartDate: newStatus === 'IN_PROGRESS' && !job.actualStartDate ? new Date() : job.actualStartDate,
          completedAt: newStatus === 'COMPLETED' && !job.completedAt ? new Date() : job.completedAt,
          cancelledAt: newStatus === 'CANCELLED' && !job.cancelledAt ? new Date() : job.cancelledAt,
        },
      });

      // Create status history record
      await prisma.jobStatusHistory.create({
        data: {
          tenantId,
          jobId: id,
          oldStatus,
          newStatus,
          changeReason: reason,
          changedBy: String(userId),
        },
      });

      // Emit real-time event
      sseEmitter.emitToTenant(tenantId, EventTypes.JOB_STATUS_CHANGED, {
        job: updatedJob,
        jobId: updatedJob.id,
        jobNumber: updatedJob.jobNumber,
        oldStatus,
        newStatus,
        reason,
        changedBy: userId,
      });

      res.json({
        success: true,
        data: updatedJob,
        message: `Job status changed from ${oldStatus} to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error changing job status:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to change job status',
      });
    }
  });

  // ============================================================================
  // POST /api/jobs/:id/duplicate - Duplicate job
  // ============================================================================
  router.post('/:id/duplicate', requirePerm('jobs:create'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      // Get original job
      const originalJob = await prisma.job.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: {
          materials: {
            where: { isDeleted: false },
          },
          checklists: true,
        },
      });

      if (!originalJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      // Generate new job number
      const jobNumber = await generateJobNumber(tenantId);

      // Prepare job data for duplication
      const {
        id: _,
        jobNumber: __,
        createdAt,
        updatedAt,
        schedules,
        materials,
        timeEntries,
        notes,
        statusHistory,
        documents,
        checklists,
        ...jobData
      } = originalJob;

      // Create duplicate job
      const newJob = await prisma.job.create({
        data: {
          ...jobData,
          jobNumber,
          title: `${originalJob.title} (Copy)`,
          status: 'DRAFT',
          createdBy: String(userId),
          updatedBy: null,
          actualStartDate: null,
          actualEndDate: null,
          completedAt: null,
          cancelledAt: null,
          materials: {
            create: originalJob.materials.map(({ id, jobId, createdAt, updatedAt, ...material }) => material),
          },
          checklists: {
            create: originalJob.checklists.map(({ id, jobId, createdAt, updatedAt, ...checklist }) => checklist),
          },
        },
        include: {
          materials: true,
          checklists: true,
        },
      });

      res.status(201).json({
        success: true,
        data: newJob,
        message: `Job duplicated as ${jobNumber}`,
      });
    } catch (error) {
      console.error('Error duplicating job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to duplicate job',
      });
    }
  });

  return router;
};
