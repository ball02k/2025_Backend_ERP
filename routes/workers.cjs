// routes/workers.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { generateWorkerNumber } = require('../utils/autoNumbering.cjs');
const {
  workerQuerySchema,
  createWorkerSchema,
  updateWorkerSchema,
  updateSkillsSchema,
  updateCertificationSchema,
  checkAvailabilitySchema,
  updateLocationSchema,
  timeOffRequestSchema,
  timeOffApprovalSchema,
} = require('../lib/validation.workers.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  // ============================================================================
  // GET /api/workers - List workers with filters
  // ============================================================================
  router.get('/', requirePerm('workers:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const query = workerQuerySchema.parse(req.query);

      // Build where clause
      const where = {
        tenantId,
        isDeleted: false,
      };

      if (query.role) where.role = query.role;
      if (query.department) where.department = query.department;
      if (query.availabilityStatus) where.availabilityStatus = query.availabilityStatus;
      if (query.isActive !== undefined) where.isActive = query.isActive;

      // Skills filtering
      if (query.skills) {
        const skillsArray = query.skills.split(',').map(s => s.trim());
        where.skills = {
          hasSome: skillsArray,
        };
      }

      // Search
      if (query.search) {
        where.OR = [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { workerNumber: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      // Pagination
      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      // Get total count
      const total = await prisma.worker.count({ where });

      // Get workers
      const workers = await prisma.worker.findMany({
        where,
        skip,
        take,
        orderBy: {
          [query.sort]: query.order,
        },
        include: {
          _count: {
            select: {
              schedules: true,
              timeEntries: true,
              availability: true,
            },
          },
          schedules: {
            where: {
              isDeleted: false,
              startTime: {
                gte: new Date(),
              },
            },
            take: 5,
            orderBy: {
              startTime: 'asc',
            },
            include: {
              job: {
                select: {
                  id: true,
                  jobNumber: true,
                  title: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      res.json({
        success: true,
        data: workers,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (error) {
      console.error('Error fetching workers:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to fetch workers',
      });
    }
  });

  // ============================================================================
  // GET /api/workers/:id - Get single worker
  // ============================================================================
  router.get('/:id', requirePerm('workers:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const worker = await prisma.worker.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false,
        },
        include: {
          schedules: {
            where: { isDeleted: false },
            include: {
              job: {
                select: {
                  id: true,
                  jobNumber: true,
                  title: true,
                  status: true,
                  siteAddress: true,
                  scheduledStartDate: true,
                  scheduledEndDate: true,
                },
              },
            },
            orderBy: {
              startTime: 'desc',
            },
            take: 20,
          },
          timeEntries: {
            where: { isDeleted: false },
            include: {
              job: {
                select: {
                  id: true,
                  jobNumber: true,
                  title: true,
                },
              },
            },
            orderBy: {
              clockIn: 'desc',
            },
            take: 20,
          },
          availability: {
            where: {
              endDate: {
                gte: new Date(),
              },
            },
            orderBy: {
              startDate: 'asc',
            },
          },
        },
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      res.json({
        success: true,
        data: worker,
      });
    } catch (error) {
      console.error('Error fetching worker:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch worker',
      });
    }
  });

  // ============================================================================
  // POST /api/workers - Create new worker
  // ============================================================================
  router.post('/', requirePerm('workers:create'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const data = createWorkerSchema.parse(req.body);

      // Check for duplicate email
      if (data.email) {
        const existingWorker = await prisma.worker.findFirst({
          where: {
            tenantId,
            email: data.email,
            isDeleted: false,
          },
        });

        if (existingWorker) {
          return res.status(409).json({
            success: false,
            error: 'Worker with this email already exists',
          });
        }
      }

      // Generate worker number
      const workerNumber = await generateWorkerNumber(tenantId);

      // Create worker
      const worker = await prisma.worker.create({
        data: {
          ...data,
          tenantId,
          workerNumber,
          hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        },
      });

      res.status(201).json({
        success: true,
        data: worker,
        message: `Worker ${workerNumber} created successfully`,
      });
    } catch (error) {
      console.error('Error creating worker:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create worker',
      });
    }
  });

  // ============================================================================
  // PATCH /api/workers/:id - Update worker
  // ============================================================================
  router.patch('/:id', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const data = updateWorkerSchema.parse(req.body);

      // Check if worker exists
      const existingWorker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingWorker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      // Check for duplicate email if email is being changed
      if (data.email && data.email !== existingWorker.email) {
        const duplicateWorker = await prisma.worker.findFirst({
          where: {
            tenantId,
            email: data.email,
            isDeleted: false,
            id: { not: id },
          },
        });

        if (duplicateWorker) {
          return res.status(409).json({
            success: false,
            error: 'Worker with this email already exists',
          });
        }
      }

      // Update worker
      const worker = await prisma.worker.update({
        where: { id },
        data: {
          ...data,
          hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        },
      });

      res.json({
        success: true,
        data: worker,
        message: 'Worker updated successfully',
      });
    } catch (error) {
      console.error('Error updating worker:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update worker',
      });
    }
  });

  // ============================================================================
  // DELETE /api/workers/:id - Soft delete worker
  // ============================================================================
  router.delete('/:id', requirePerm('workers:delete'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      // Check if worker exists
      const existingWorker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingWorker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      // Check if worker has upcoming schedules
      const upcomingSchedules = await prisma.jobSchedule.count({
        where: {
          tenantId,
          workerId: id,
          isDeleted: false,
          startTime: {
            gte: new Date(),
          },
        },
      });

      if (upcomingSchedules > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete worker with ${upcomingSchedules} upcoming job schedules`,
        });
      }

      // Soft delete
      await prisma.worker.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
        },
      });

      res.json({
        success: true,
        message: 'Worker deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting worker:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete worker',
      });
    }
  });

  // ============================================================================
  // POST /api/workers/:id/skills - Add or remove skills
  // ============================================================================
  router.post('/:id/skills', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { action, skills } = updateSkillsSchema.parse(req.body);

      // Get current worker
      const worker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      let updatedSkills = [...worker.skills];

      if (action === 'add') {
        skills.forEach(skill => {
          if (!updatedSkills.includes(skill)) {
            updatedSkills.push(skill);
          }
        });
      } else if (action === 'remove') {
        updatedSkills = updatedSkills.filter(skill => !skills.includes(skill));
      }

      // Update worker
      const updatedWorker = await prisma.worker.update({
        where: { id },
        data: {
          skills: updatedSkills,
        },
      });

      res.json({
        success: true,
        data: updatedWorker,
        message: `Skills ${action === 'add' ? 'added' : 'removed'} successfully`,
      });
    } catch (error) {
      console.error('Error updating skills:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update skills',
      });
    }
  });

  // ============================================================================
  // POST /api/workers/:id/certifications - Add or update certification
  // ============================================================================
  router.post('/:id/certifications', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { certificationName, certificationData } = updateCertificationSchema.parse(req.body);

      // Get current worker
      const worker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      // Update certifications
      const updatedCertifications = {
        ...(worker.certifications || {}),
        [certificationName]: certificationData,
      };

      const updatedWorker = await prisma.worker.update({
        where: { id },
        data: {
          certifications: updatedCertifications,
        },
      });

      res.json({
        success: true,
        data: updatedWorker,
        message: `Certification '${certificationName}' updated successfully`,
      });
    } catch (error) {
      console.error('Error updating certification:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update certification',
      });
    }
  });

  // ============================================================================
  // DELETE /api/workers/:id/certifications/:certName - Remove certification
  // ============================================================================
  router.delete('/:id/certifications/:certName', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id, certName } = req.params;

      // Get current worker
      const worker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      const certifications = worker.certifications || {};

      if (!certifications[certName]) {
        return res.status(404).json({
          success: false,
          error: 'Certification not found',
        });
      }

      // Remove certification
      delete certifications[certName];

      const updatedWorker = await prisma.worker.update({
        where: { id },
        data: {
          certifications,
        },
      });

      res.json({
        success: true,
        data: updatedWorker,
        message: `Certification '${certName}' removed successfully`,
      });
    } catch (error) {
      console.error('Error removing certification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove certification',
      });
    }
  });

  // ============================================================================
  // GET /api/workers/:id/availability - Check worker availability
  // ============================================================================
  router.get('/:id/availability', requirePerm('workers:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { startDate, endDate } = checkAvailabilitySchema.parse(req.query);

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Get worker
      const worker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      // Check for overlapping schedules
      const overlappingSchedules = await prisma.jobSchedule.findMany({
        where: {
          tenantId,
          workerId: id,
          isDeleted: false,
          OR: [
            {
              AND: [
                { startTime: { lte: start } },
                { endTime: { gte: start } },
              ],
            },
            {
              AND: [
                { startTime: { lte: end } },
                { endTime: { gte: end } },
              ],
            },
            {
              AND: [
                { startTime: { gte: start } },
                { endTime: { lte: end } },
              ],
            },
          ],
        },
        include: {
          job: {
            select: {
              id: true,
              jobNumber: true,
              title: true,
            },
          },
        },
      });

      // Check for time off/unavailability
      const timeOffRequests = await prisma.workerAvailability.findMany({
        where: {
          tenantId,
          workerId: id,
          status: 'approved',
          OR: [
            {
              AND: [
                { startDate: { lte: start } },
                { endDate: { gte: start } },
              ],
            },
            {
              AND: [
                { startDate: { lte: end } },
                { endDate: { gte: end } },
              ],
            },
            {
              AND: [
                { startDate: { gte: start } },
                { endDate: { lte: end } },
              ],
            },
          ],
        },
      });

      const isAvailable = overlappingSchedules.length === 0 && timeOffRequests.length === 0;

      res.json({
        success: true,
        data: {
          worker: {
            id: worker.id,
            workerNumber: worker.workerNumber,
            firstName: worker.firstName,
            lastName: worker.lastName,
            availabilityStatus: worker.availabilityStatus,
          },
          requestedPeriod: {
            startDate,
            endDate,
          },
          isAvailable,
          conflicts: {
            schedules: overlappingSchedules,
            timeOff: timeOffRequests,
          },
        },
      });
    } catch (error) {
      console.error('Error checking availability:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to check availability',
      });
    }
  });

  // ============================================================================
  // POST /api/workers/:id/time-off - Request time off
  // ============================================================================
  router.post('/:id/time-off', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = timeOffRequestSchema.parse(req.body);

      // Verify worker exists
      const worker = await prisma.worker.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      // Create time off request
      const timeOffRequest = await prisma.workerAvailability.create({
        data: {
          tenantId,
          workerId: id,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          allDay: data.allDay,
          availabilityType: data.availabilityType,
          reason: data.reason,
          status: 'pending',
        },
      });

      res.status(201).json({
        success: true,
        data: timeOffRequest,
        message: 'Time off request submitted successfully',
      });
    } catch (error) {
      console.error('Error creating time off request:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create time off request',
      });
    }
  });

  // ============================================================================
  // PATCH /api/workers/:id/time-off/:requestId - Approve/deny time off
  // ============================================================================
  router.patch('/:id/time-off/:requestId', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id, requestId } = req.params;
      const { status } = timeOffApprovalSchema.parse(req.body);

      // Update time off request
      const updatedRequest = await prisma.workerAvailability.update({
        where: {
          id: requestId,
          tenantId,
          workerId: id,
        },
        data: {
          status,
          approvedBy: String(userId),
          approvedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: updatedRequest,
        message: `Time off request ${status}`,
      });
    } catch (error) {
      console.error('Error updating time off request:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update time off request',
      });
    }
  });

  // ============================================================================
  // POST /api/workers/:id/location - Update current location (GPS)
  // ============================================================================
  router.post('/:id/location', requirePerm('workers:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { latitude, longitude } = updateLocationSchema.parse(req.body);

      // Update worker location
      const worker = await prisma.worker.update({
        where: {
          id,
          tenantId,
        },
        data: {
          currentLatitude: latitude,
          currentLongitude: longitude,
          lastLocationUpdate: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          workerId: worker.id,
          latitude: worker.currentLatitude,
          longitude: worker.currentLongitude,
          updatedAt: worker.lastLocationUpdate,
        },
        message: 'Location updated successfully',
      });
    } catch (error) {
      console.error('Error updating location:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update location',
      });
    }
  });

  return router;
};
