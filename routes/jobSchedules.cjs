// routes/jobSchedules.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const ConflictDetectionService = require('../services/conflictDetection.cjs');
const {
  scheduleQuerySchema,
  calendarQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  bulkAssignSchema,
} = require('../lib/validation.jobSchedules.cjs');

module.exports = (prisma) => {
  const router = express.Router();
  const conflictService = new ConflictDetectionService(prisma);

  // Helper: Calculate estimated hours
  function calculateHours(startTime, endTime) {
    const diff = new Date(endTime) - new Date(startTime);
    return Number((diff / (1000 * 60 * 60)).toFixed(2));
  }

  // =========================================================================
  // GET /api/job-schedules - List schedules with filters
  // =========================================================================
  router.get('/', requirePerm('schedules:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const query = scheduleQuerySchema.parse(req.query);

      const where = {
        tenantId,
        isDeleted: false
      };

      if (query.jobId) where.jobId = query.jobId;
      if (query.workerId) where.workerId = query.workerId;
      if (query.equipmentId) where.equipmentId = query.equipmentId;
      if (query.status) where.status = query.status;
      if (query.hasConflicts !== undefined) where.hasConflicts = query.hasConflicts;

      if (query.startDate && query.endDate) {
        where.startTime = {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate)
        };
      }

      const skip = (query.page - 1) * query.limit;

      const [schedules, total] = await Promise.all([
        prisma.jobSchedule.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { startTime: 'asc' },
          include: {
            job: {
              select: {
                jobNumber: true,
                title: true,
                siteAddress: true,
                status: true,
                priority: true
              }
            },
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true
              }
            },
            equipment: {
              select: {
                id: true,
                name: true,
                type: true,
                status: true
              }
            }
          }
        }),
        prisma.jobSchedule.count({ where })
      ]);

      res.json({
        schedules,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit)
        }
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('List schedules error:', error);
      res.status(500).json({ error: 'Failed to fetch schedules' });
    }
  });

  // =========================================================================
  // GET /api/job-schedules/calendar - Calendar view
  // =========================================================================
  router.get('/calendar', requirePerm('schedules:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const query = calendarQuerySchema.parse(req.query);

      const where = {
        tenantId,
        isDeleted: false,
        startTime: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate)
        }
      };

      if (query.workerIds) {
        const ids = query.workerIds.split(',').map(id => id.trim());
        where.workerId = { in: ids };
      }

      if (query.equipmentIds) {
        const ids = query.equipmentIds.split(',').map(id => id.trim());
        where.equipmentId = { in: ids };
      }

      const schedules = await prisma.jobSchedule.findMany({
        where,
        orderBy: { startTime: 'asc' },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true,
              siteAddress: true,
              priority: true,
              status: true
            }
          },
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          equipment: {
            select: {
              id: true,
              name: true,
              type: true
            }
          }
        }
      });

      // Group by worker
      const byWorker = {};
      const byEquipment = {};

      schedules.forEach(schedule => {
        if (schedule.workerId) {
          if (!byWorker[schedule.workerId]) {
            byWorker[schedule.workerId] = {
              worker: schedule.worker,
              schedules: []
            };
          }
          byWorker[schedule.workerId].schedules.push(schedule);
        }

        if (schedule.equipmentId) {
          if (!byEquipment[schedule.equipmentId]) {
            byEquipment[schedule.equipmentId] = {
              equipment: schedule.equipment,
              schedules: []
            };
          }
          byEquipment[schedule.equipmentId].schedules.push(schedule);
        }
      });

      res.json({
        startDate: query.startDate,
        endDate: query.endDate,
        byWorker: Object.values(byWorker),
        byEquipment: Object.values(byEquipment),
        totalSchedules: schedules.length
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Calendar view error:', error);
      res.status(500).json({ error: 'Failed to fetch calendar view' });
    }
  });

  // =========================================================================
  // GET /api/job-schedules/unassigned-jobs - Jobs without schedules
  // =========================================================================
  router.get('/unassigned-jobs', requirePerm('schedules:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { page = '1', limit = '20' } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Find jobs with no active schedules
      const jobs = await prisma.job.findMany({
        where: {
          tenantId,
          isDeleted: false,
          status: {
            in: ['DRAFT', 'SCHEDULED', 'PENDING']
          },
          schedules: {
            none: {
              isDeleted: false,
              status: {
                notIn: ['CANCELLED', 'COMPLETED']
              }
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: [
          { priority: 'desc' },
          { scheduledStartDate: 'asc' }
        ],
        include: {
          client: {
            select: {
              name: true,
              contactName: true
            }
          }
        }
      });

      const total = await prisma.job.count({
        where: {
          tenantId,
          isDeleted: false,
          status: {
            in: ['DRAFT', 'SCHEDULED', 'PENDING']
          },
          schedules: {
            none: {
              isDeleted: false
            }
          }
        }
      });

      res.json({
        jobs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error('Unassigned jobs error:', error);
      res.status(500).json({ error: 'Failed to fetch unassigned jobs' });
    }
  });

  // =========================================================================
  // GET /api/job-schedules/worker/:workerId - Worker's schedules
  // =========================================================================
  router.get('/worker/:workerId', requirePerm('schedules:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { workerId } = req.params;
      const { startDate, endDate } = req.query;

      const where = {
        tenantId,
        workerId,
        isDeleted: false
      };

      if (startDate && endDate) {
        where.startTime = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }

      const schedules = await prisma.jobSchedule.findMany({
        where,
        orderBy: { startTime: 'asc' },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true,
              siteAddress: true,
              priority: true,
              client: {
                select: {
                  name: true,
                  contactName: true
                }
              }
            }
          }
        }
      });

      res.json({ schedules });
    } catch (error) {
      console.error('Worker schedules error:', error);
      res.status(500).json({ error: 'Failed to fetch worker schedules' });
    }
  });

  // =========================================================================
  // GET /api/job-schedules/:id - Get single schedule
  // =========================================================================
  router.get('/:id', requirePerm('schedules:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const schedule = await prisma.jobSchedule.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: {
          job: {
            select: {
              id: true,
              jobNumber: true,
              title: true,
              description: true,
              siteAddress: true,
              status: true,
              priority: true,
              client: {
                select: {
                  name: true,
                  contactName: true,
                  contactPhone: true
                }
              }
            }
          },
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              skills: true
            }
          },
          equipment: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              manufacturer: true,
              model: true
            }
          },
          timeEntries: {
            where: { isDeleted: false },
            orderBy: { clockIn: 'desc' }
          }
        }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      res.json({ schedule });
    } catch (error) {
      console.error('Get schedule error:', error);
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  });

  // =========================================================================
  // POST /api/job-schedules - Create schedule with conflict detection
  // =========================================================================
  router.post('/', requirePerm('schedules:create'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const data = createScheduleSchema.parse(req.body);

      const startTime = new Date(data.startTime);
      const endTime = new Date(data.endTime);

      // Validate dates
      if (endTime <= startTime) {
        return res.status(400).json({
          error: 'endTime must be after startTime'
        });
      }

      // Calculate estimated hours if not provided
      const estimatedHours = data.estimatedHours || calculateHours(startTime, endTime);

      // Check conflicts
      const conflictCheck = await conflictService.checkConflicts({
        tenantId,
        workerId: data.workerId,
        equipmentId: data.equipmentId,
        startTime,
        endTime,
        jobId: data.jobId
      });

      // Block if critical conflicts and not overriding
      if (!conflictCheck.canProceed && !data.ignoreConflicts) {
        return res.status(409).json({
          error: 'Cannot create schedule due to conflicts',
          conflicts: conflictCheck.conflicts,
          canOverride: false
        });
      }

      // Warn if conflicts but can proceed
      if (conflictCheck.hasConflicts && !data.ignoreConflicts) {
        return res.status(409).json({
          error: 'Schedule has conflicts',
          conflicts: conflictCheck.conflicts,
          canOverride: true,
          message: 'Set ignoreConflicts=true to create anyway'
        });
      }

      // Create schedule
      const schedule = await prisma.jobSchedule.create({
        data: {
          tenantId,
          jobId: data.jobId,
          workerId: data.workerId,
          equipmentId: data.equipmentId,
          startTime,
          endTime,
          estimatedHours,
          allDay: data.allDay || false,
          notes: data.notes,
          specialInstructions: data.specialInstructions,
          isCrewLead: data.isCrewLead || false,
          travelTimeMinutes: data.travelTimeMinutes || 0,
          setupTimeMinutes: data.setupTimeMinutes || 0,
          breakdownTimeMinutes: data.breakdownTimeMinutes || 0,
          assignedBy: String(userId),
          createdBy: String(userId),
          hasConflicts: conflictCheck.hasConflicts,
          conflictDetails: conflictCheck.hasConflicts ? conflictCheck.conflicts : null
        },
        include: {
          job: {
            select: {
              id: true,
              jobNumber: true,
              title: true,
              siteAddress: true
            }
          },
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          equipment: {
            select: {
              id: true,
              name: true,
              type: true
            }
          }
        }
      });

      // Update job status to SCHEDULED if it was DRAFT
      await prisma.job.updateMany({
        where: {
          id: data.jobId,
          tenantId,
          status: 'DRAFT'
        },
        data: {
          status: 'SCHEDULED'
        }
      });

      // Log conflicts if any
      if (conflictCheck.hasConflicts) {
        await prisma.scheduleConflict.createMany({
          data: conflictCheck.conflicts.map(c => ({
            tenantId,
            scheduleId: schedule.id,
            conflictType: c.type,
            severity: c.severity,
            resourceId: data.workerId || data.equipmentId,
            resourceType: data.workerId ? 'worker' : 'equipment',
            message: c.message,
            details: c.details
          }))
        });
      }

      res.status(201).json({
        schedule,
        conflicts: conflictCheck.hasConflicts ? conflictCheck.conflicts : []
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Create schedule error:', error);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  });

  // =========================================================================
  // POST /api/job-schedules/bulk-assign - Bulk assign schedules
  // =========================================================================
  router.post('/bulk-assign', requirePerm('schedules:create'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const data = bulkAssignSchema.parse(req.body);

      const results = {
        successful: [],
        failed: []
      };

      for (const assignment of data.assignments) {
        try {
          const startTime = new Date(assignment.startTime);
          const endTime = new Date(assignment.endTime);

          const estimatedHours = assignment.estimatedHours || calculateHours(startTime, endTime);

          // Check conflicts
          const conflictCheck = await conflictService.checkConflicts({
            tenantId,
            workerId: assignment.workerId,
            equipmentId: assignment.equipmentId,
            startTime,
            endTime,
            jobId: data.jobId
          });

          if (!conflictCheck.canProceed && data.stopOnConflict) {
            results.failed.push({
              assignment,
              error: 'Critical conflicts detected',
              conflicts: conflictCheck.conflicts
            });
            continue;
          }

          const schedule = await prisma.jobSchedule.create({
            data: {
              tenantId,
              jobId: data.jobId,
              workerId: assignment.workerId,
              equipmentId: assignment.equipmentId,
              startTime,
              endTime,
              estimatedHours,
              allDay: assignment.allDay || false,
              notes: assignment.notes,
              specialInstructions: assignment.specialInstructions,
              isCrewLead: assignment.isCrewLead || false,
              travelTimeMinutes: assignment.travelTimeMinutes || 0,
              setupTimeMinutes: assignment.setupTimeMinutes || 0,
              breakdownTimeMinutes: assignment.breakdownTimeMinutes || 0,
              assignedBy: String(userId),
              createdBy: String(userId),
              hasConflicts: conflictCheck.hasConflicts,
              conflictDetails: conflictCheck.hasConflicts ? conflictCheck.conflicts : null
            }
          });

          results.successful.push({
            schedule,
            conflicts: conflictCheck.conflicts
          });
        } catch (error) {
          results.failed.push({
            assignment,
            error: error.message
          });
        }
      }

      // Update job status if any schedules created
      if (results.successful.length > 0) {
        await prisma.job.updateMany({
          where: {
            id: data.jobId,
            tenantId,
            status: 'DRAFT'
          },
          data: {
            status: 'SCHEDULED'
          }
        });
      }

      res.status(207).json(results); // 207 Multi-Status
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Bulk assign error:', error);
      res.status(500).json({ error: 'Failed to bulk assign' });
    }
  });

  // =========================================================================
  // POST /api/job-schedules/:id/confirm - Confirm schedule
  // =========================================================================
  router.post('/:id/confirm', requirePerm('schedules:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      const schedule = await prisma.jobSchedule.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false
        }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      if (schedule.status === 'CONFIRMED') {
        return res.status(400).json({
          error: 'Schedule already confirmed'
        });
      }

      const updated = await prisma.jobSchedule.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy: String(userId),
          updatedBy: String(userId)
        },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true,
              siteAddress: true
            }
          },
          worker: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      res.json({ schedule: updated });
    } catch (error) {
      console.error('Confirm schedule error:', error);
      res.status(500).json({ error: 'Failed to confirm schedule' });
    }
  });

  // =========================================================================
  // PATCH /api/job-schedules/:id - Update schedule
  // =========================================================================
  router.patch('/:id', requirePerm('schedules:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      const updateData = updateScheduleSchema.parse(req.body);

      const schedule = await prisma.jobSchedule.findFirst({
        where: { id, tenantId, isDeleted: false }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      // If updating time, recheck conflicts
      let conflictCheck = null;
      if (updateData.startTime || updateData.endTime) {
        const newStart = updateData.startTime ?
          new Date(updateData.startTime) : schedule.startTime;
        const newEnd = updateData.endTime ?
          new Date(updateData.endTime) : schedule.endTime;

        conflictCheck = await conflictService.checkConflicts({
          tenantId,
          workerId: schedule.workerId,
          equipmentId: schedule.equipmentId,
          startTime: newStart,
          endTime: newEnd,
          jobId: schedule.jobId,
          excludeScheduleId: id
        });

        if (!conflictCheck.canProceed) {
          return res.status(409).json({
            error: 'Cannot update schedule due to conflicts',
            conflicts: conflictCheck.conflicts
          });
        }

        // Recalculate estimated hours if times changed
        if (!updateData.estimatedHours && (updateData.startTime || updateData.endTime)) {
          updateData.estimatedHours = calculateHours(newStart, newEnd);
        }
      }

      const updated = await prisma.jobSchedule.update({
        where: { id },
        data: {
          ...updateData,
          ...(updateData.startTime && {
            startTime: new Date(updateData.startTime)
          }),
          ...(updateData.endTime && {
            endTime: new Date(updateData.endTime)
          }),
          ...(conflictCheck && {
            hasConflicts: conflictCheck.hasConflicts,
            conflictDetails: conflictCheck.hasConflicts ?
              conflictCheck.conflicts : null
          }),
          updatedBy: String(userId)
        },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true
            }
          },
          worker: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      });

      res.json({
        schedule: updated,
        conflicts: conflictCheck?.conflicts || []
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Update schedule error:', error);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  // =========================================================================
  // DELETE /api/job-schedules/:id - Soft delete schedule
  // =========================================================================
  router.delete('/:id', requirePerm('schedules:delete'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      const schedule = await prisma.jobSchedule.findFirst({
        where: { id, tenantId, isDeleted: false }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      await prisma.jobSchedule.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: String(userId)
        }
      });

      res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
      console.error('Delete schedule error:', error);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  return router;
};
