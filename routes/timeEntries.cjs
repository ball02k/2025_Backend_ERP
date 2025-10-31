// routes/timeEntries.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const {
  clockInSchema,
  clockOutSchema,
  startBreakSchema,
  submitSchema,
  approveSchema,
  rejectSchema,
  timeEntryQuerySchema,
  timesheetQuerySchema,
  updateTimeEntrySchema,
} = require('../lib/validation.timeEntries.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  // Helper: Calculate hours difference
  function calculateHours(start, end) {
    const diff = new Date(end) - new Date(start);
    return Number((diff / (1000 * 60 * 60)).toFixed(2));
  }

  // Helper: Check if date is weekend
  function isWeekend(date) {
    const day = new Date(date).getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  // Helper: Get worker for current user
  async function getWorkerForUser(tenantId, userId) {
    const worker = await prisma.worker.findFirst({
      where: {
        tenantId,
        userId: String(userId),
        isDeleted: false
      }
    });
    return worker;
  }

  // =========================================================================
  // POST /api/time-entries/clock-in - Clock in
  // =========================================================================
  router.post('/clock-in', requirePerm('timeentries:create'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const data = clockInSchema.parse(req.body);

      // Get worker for current user
      const worker = await getWorkerForUser(tenantId, userId);
      if (!worker) {
        return res.status(404).json({
          error: 'Worker profile not found for current user'
        });
      }

      // Check if worker already has an open time entry
      const openEntry = await prisma.timeEntry.findFirst({
        where: {
          tenantId,
          workerId: worker.id,
          clockOut: null,
          isDeleted: false
        }
      });

      if (openEntry) {
        return res.status(400).json({
          error: 'Worker already has an open time entry',
          openEntry: {
            id: openEntry.id,
            jobId: openEntry.jobId,
            clockIn: openEntry.clockIn
          }
        });
      }

      const clockIn = data.clockIn ? new Date(data.clockIn) : new Date();

      // Check if schedule exists and is valid
      let schedule = null;
      if (data.scheduleId) {
        schedule = await prisma.jobSchedule.findFirst({
          where: {
            id: data.scheduleId,
            tenantId,
            workerId: worker.id,
            isDeleted: false
          }
        });

        if (!schedule) {
          return res.status(404).json({
            error: 'Schedule not found or does not belong to this worker'
          });
        }

        // Update schedule status to IN_PROGRESS
        await prisma.jobSchedule.update({
          where: { id: data.scheduleId },
          data: { status: 'IN_PROGRESS' }
        });
      }

      const timeEntry = await prisma.timeEntry.create({
        data: {
          tenantId,
          scheduleId: data.scheduleId,
          jobId: data.jobId,
          workerId: worker.id,
          clockIn,
          clockInLatitude: data.latitude,
          clockInLongitude: data.longitude,
          notes: data.notes,
          isWeekend: isWeekend(clockIn)
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
              lastName: true
            }
          }
        }
      });

      // Update job status to IN_PROGRESS if it was SCHEDULED
      await prisma.job.updateMany({
        where: {
          id: data.jobId,
          tenantId,
          status: 'SCHEDULED'
        },
        data: {
          status: 'IN_PROGRESS'
        }
      });

      res.status(201).json({ timeEntry });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Clock in error:', error);
      res.status(500).json({ error: 'Failed to clock in' });
    }
  });

  // =========================================================================
  // POST /api/time-entries/:id/clock-out - Clock out
  // =========================================================================
  router.post('/:id/clock-out', requirePerm('timeentries:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = clockOutSchema.parse(req.body);

      const worker = await getWorkerForUser(tenantId, userId);
      if (!worker) {
        return res.status(404).json({ error: 'Worker profile not found' });
      }

      const timeEntry = await prisma.timeEntry.findFirst({
        where: {
          id,
          tenantId,
          workerId: worker.id,
          isDeleted: false
        },
        include: {
          breaks: true
        }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      if (timeEntry.clockOut) {
        return res.status(400).json({
          error: 'Already clocked out',
          clockOut: timeEntry.clockOut
        });
      }

      const clockOut = data.clockOut ? new Date(data.clockOut) : new Date();

      if (clockOut <= timeEntry.clockIn) {
        return res.status(400).json({
          error: 'Clock out time must be after clock in time'
        });
      }

      // Calculate total break time
      const totalBreakMinutes = timeEntry.breaks.reduce((sum, brk) => {
        if (brk.breakEnd) {
          return sum + brk.breakMinutes;
        }
        return sum;
      }, 0);

      // Calculate total hours worked (excluding breaks)
      const totalMinutes = Math.floor((clockOut - timeEntry.clockIn) / (1000 * 60));
      const workMinutes = totalMinutes - totalBreakMinutes;
      const totalHours = Number((workMinutes / 60).toFixed(2));

      // Calculate regular vs overtime (assuming 8 hours standard day)
      const STANDARD_HOURS = 8;
      let regularHours = totalHours;
      let overtimeHours = 0;
      let isOvertime = false;

      if (totalHours > STANDARD_HOURS) {
        regularHours = STANDARD_HOURS;
        overtimeHours = Number((totalHours - STANDARD_HOURS).toFixed(2));
        isOvertime = true;
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: {
          clockOut,
          clockOutLatitude: data.latitude,
          clockOutLongitude: data.longitude,
          workDescription: data.workDescription,
          totalBreakMinutes,
          totalHours,
          regularHours,
          overtimeHours,
          isOvertime
        },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true
            }
          },
          breaks: true
        }
      });

      // Update schedule status if exists
      if (timeEntry.scheduleId) {
        await prisma.jobSchedule.update({
          where: { id: timeEntry.scheduleId },
          data: { status: 'COMPLETED' }
        });
      }

      res.json({
        timeEntry: updated,
        summary: {
          totalHours,
          regularHours,
          overtimeHours,
          breakMinutes: totalBreakMinutes,
          isOvertime
        }
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Clock out error:', error);
      res.status(500).json({ error: 'Failed to clock out' });
    }
  });

  // =========================================================================
  // POST /api/time-entries/:id/break-start - Start break
  // =========================================================================
  router.post('/:id/break-start', requirePerm('timeentries:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = startBreakSchema.parse(req.body);

      const worker = await getWorkerForUser(tenantId, userId);
      if (!worker) {
        return res.status(404).json({ error: 'Worker profile not found' });
      }

      const timeEntry = await prisma.timeEntry.findFirst({
        where: {
          id,
          tenantId,
          workerId: worker.id,
          clockOut: null,
          isDeleted: false
        }
      });

      if (!timeEntry) {
        return res.status(404).json({
          error: 'Active time entry not found'
        });
      }

      // Check if there's an open break
      const openBreak = await prisma.timeEntryBreak.findFirst({
        where: {
          timeEntryId: id,
          breakEnd: null
        }
      });

      if (openBreak) {
        return res.status(400).json({
          error: 'Break already in progress',
          breakStart: openBreak.breakStart
        });
      }

      const breakEntry = await prisma.timeEntryBreak.create({
        data: {
          tenantId,
          timeEntryId: id,
          breakStart: new Date(),
          breakType: data.breakType
        }
      });

      res.status(201).json({ break: breakEntry });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Start break error:', error);
      res.status(500).json({ error: 'Failed to start break' });
    }
  });

  // =========================================================================
  // POST /api/time-entries/:id/break-end - End break
  // =========================================================================
  router.post('/:id/break-end', requirePerm('timeentries:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      const worker = await getWorkerForUser(tenantId, userId);
      if (!worker) {
        return res.status(404).json({ error: 'Worker profile not found' });
      }

      const timeEntry = await prisma.timeEntry.findFirst({
        where: {
          id,
          tenantId,
          workerId: worker.id,
          isDeleted: false
        }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      const openBreak = await prisma.timeEntryBreak.findFirst({
        where: {
          timeEntryId: id,
          breakEnd: null
        }
      });

      if (!openBreak) {
        return res.status(400).json({ error: 'No active break found' });
      }

      const breakEnd = new Date();
      const breakMinutes = Math.floor((breakEnd - openBreak.breakStart) / (1000 * 60));

      const updated = await prisma.timeEntryBreak.update({
        where: { id: openBreak.id },
        data: {
          breakEnd,
          breakMinutes
        }
      });

      res.json({
        break: updated,
        breakDuration: `${breakMinutes} minutes`
      });
    } catch (error) {
      console.error('End break error:', error);
      res.status(500).json({ error: 'Failed to end break' });
    }
  });

  // =========================================================================
  // POST /api/time-entries/:id/submit - Submit for approval
  // =========================================================================
  router.post('/:id/submit', requirePerm('timeentries:submit'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = submitSchema.parse(req.body);

      const worker = await getWorkerForUser(tenantId, userId);
      if (!worker) {
        return res.status(404).json({ error: 'Worker profile not found' });
      }

      const timeEntry = await prisma.timeEntry.findFirst({
        where: {
          id,
          tenantId,
          workerId: worker.id,
          isDeleted: false
        }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      if (!timeEntry.clockOut) {
        return res.status(400).json({
          error: 'Cannot submit time entry without clocking out'
        });
      }

      if (timeEntry.status !== 'DRAFT') {
        return res.status(400).json({
          error: `Cannot submit time entry with status ${timeEntry.status}`
        });
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          workDescription: data.workDescription || timeEntry.workDescription,
          notes: data.notes || timeEntry.notes
        },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true
            }
          }
        }
      });

      res.json({ timeEntry: updated });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Submit error:', error);
      res.status(500).json({ error: 'Failed to submit time entry' });
    }
  });

  // =========================================================================
  // POST /api/time-entries/:id/approve - Approve time entry
  // =========================================================================
  router.post('/:id/approve', requirePerm('timeentries:approve'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = approveSchema.parse(req.body);

      const timeEntry = await prisma.timeEntry.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false
        }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      if (timeEntry.status !== 'SUBMITTED') {
        return res.status(400).json({
          error: `Cannot approve time entry with status ${timeEntry.status}`
        });
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: String(userId)
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
              lastName: true,
              email: true
            }
          }
        }
      });

      res.json({ timeEntry: updated });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Approve error:', error);
      res.status(500).json({ error: 'Failed to approve time entry' });
    }
  });

  // =========================================================================
  // POST /api/time-entries/:id/reject - Reject time entry
  // =========================================================================
  router.post('/:id/reject', requirePerm('timeentries:approve'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const data = rejectSchema.parse(req.body);

      const timeEntry = await prisma.timeEntry.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false
        }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      if (timeEntry.status !== 'SUBMITTED') {
        return res.status(400).json({
          error: `Cannot reject time entry with status ${timeEntry.status}`
        });
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedBy: String(userId),
          rejectionReason: data.reason
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
              lastName: true,
              email: true
            }
          }
        }
      });

      res.json({ timeEntry: updated });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Reject error:', error);
      res.status(500).json({ error: 'Failed to reject time entry' });
    }
  });

  // =========================================================================
  // GET /api/time-entries - List time entries
  // =========================================================================
  router.get('/', requirePerm('timeentries:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const query = timeEntryQuerySchema.parse(req.query);

      const where = {
        tenantId,
        isDeleted: false
      };

      if (query.workerId) where.workerId = query.workerId;
      if (query.jobId) where.jobId = query.jobId;
      if (query.status) where.status = query.status;

      if (query.startDate && query.endDate) {
        where.clockIn = {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate)
        };
      }

      const skip = (query.page - 1) * query.limit;

      const [timeEntries, total] = await Promise.all([
        prisma.timeEntry.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { clockIn: 'desc' },
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
            },
            breaks: true
          }
        }),
        prisma.timeEntry.count({ where })
      ]);

      res.json({
        timeEntries,
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
      console.error('List time entries error:', error);
      res.status(500).json({ error: 'Failed to fetch time entries' });
    }
  });

  // =========================================================================
  // GET /api/time-entries/my-time - Get my time entries
  // =========================================================================
  router.get('/my-time', requirePerm('timeentries:view'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { startDate, endDate, status } = req.query;

      const worker = await getWorkerForUser(tenantId, userId);
      if (!worker) {
        return res.status(404).json({ error: 'Worker profile not found' });
      }

      const where = {
        tenantId,
        workerId: worker.id,
        isDeleted: false
      };

      if (status) where.status = status;

      if (startDate && endDate) {
        where.clockIn = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }

      const timeEntries = await prisma.timeEntry.findMany({
        where,
        orderBy: { clockIn: 'desc' },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true,
              siteAddress: true
            }
          },
          breaks: true
        }
      });

      // Calculate totals
      const totals = timeEntries.reduce((acc, entry) => {
        acc.totalHours += Number(entry.totalHours);
        acc.regularHours += Number(entry.regularHours);
        acc.overtimeHours += Number(entry.overtimeHours);
        return acc;
      }, {
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0
      });

      res.json({
        timeEntries,
        summary: totals
      });
    } catch (error) {
      console.error('Get my time entries error:', error);
      res.status(500).json({ error: 'Failed to fetch time entries' });
    }
  });

  // =========================================================================
  // GET /api/time-entries/pending-approval - Get pending approvals
  // =========================================================================
  router.get('/pending-approval', requirePerm('timeentries:approve'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [timeEntries, total] = await Promise.all([
        prisma.timeEntry.findMany({
          where: {
            tenantId,
            status: 'SUBMITTED',
            isDeleted: false
          },
          skip,
          take: limitNum,
          orderBy: { submittedAt: 'asc' },
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
                email: true,
                phone: true
              }
            },
            breaks: true
          }
        }),
        prisma.timeEntry.count({
          where: {
            tenantId,
            status: 'SUBMITTED',
            isDeleted: false
          }
        })
      ]);

      res.json({
        timeEntries,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error('Get pending approvals error:', error);
      res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
  });

  // =========================================================================
  // GET /api/time-entries/timesheet - Generate timesheet
  // =========================================================================
  router.get('/timesheet', requirePerm('timeentries:view'), async (req, res) => {
    try {
      const { tenantId, id: userId, role } = req.user;
      const query = timesheetQuerySchema.parse(req.query);

      const where = {
        tenantId,
        isDeleted: false,
        clockIn: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate)
        },
        status: {
          in: ['SUBMITTED', 'APPROVED', 'PAID']
        }
      };

      // If workerId provided, use it; otherwise if worker role, show only their data
      if (query.workerId) {
        where.workerId = query.workerId;
      } else if (role === 'worker') {
        const worker = await getWorkerForUser(tenantId, userId);
        if (worker) {
          where.workerId = worker.id;
        }
      }

      const timeEntries = await prisma.timeEntry.findMany({
        where,
        orderBy: [
          { workerId: 'asc' },
          { clockIn: 'asc' }
        ],
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
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              hourlyRate: true
            }
          },
          breaks: true
        }
      });

      // Group by worker
      const byWorker = {};
      timeEntries.forEach(entry => {
        const key = entry.workerId;
        if (!byWorker[key]) {
          byWorker[key] = {
            worker: entry.worker,
            entries: [],
            totals: {
              totalHours: 0,
              regularHours: 0,
              overtimeHours: 0,
              regularPay: 0,
              overtimePay: 0,
              totalPay: 0
            }
          };
        }

        byWorker[key].entries.push(entry);

        const regularHours = Number(entry.regularHours);
        const overtimeHours = Number(entry.overtimeHours);
        const hourlyRate = Number(entry.worker.hourlyRate || 0);
        const overtimeRate = hourlyRate * 1.5;

        byWorker[key].totals.totalHours += Number(entry.totalHours);
        byWorker[key].totals.regularHours += regularHours;
        byWorker[key].totals.overtimeHours += overtimeHours;
        byWorker[key].totals.regularPay += regularHours * hourlyRate;
        byWorker[key].totals.overtimePay += overtimeHours * overtimeRate;
        byWorker[key].totals.totalPay +=
          (regularHours * hourlyRate) +
          (overtimeHours * overtimeRate);
      });

      const workers = Object.values(byWorker);
      const grandTotals = workers.reduce((acc, worker) => {
        acc.totalHours += worker.totals.totalHours;
        acc.regularHours += worker.totals.regularHours;
        acc.overtimeHours += worker.totals.overtimeHours;
        acc.totalPay += worker.totals.totalPay;
        return acc;
      }, {
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        totalPay: 0
      });

      res.json({
        startDate: query.startDate,
        endDate: query.endDate,
        workers,
        grandTotals
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Generate timesheet error:', error);
      res.status(500).json({ error: 'Failed to generate timesheet' });
    }
  });

  // =========================================================================
  // GET /api/time-entries/:id - Get single time entry
  // =========================================================================
  router.get('/:id', requirePerm('timeentries:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const timeEntry = await prisma.timeEntry.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true,
              description: true,
              siteAddress: true,
              client: {
                select: {
                  name: true,
                  contactName: true
                }
              }
            }
          },
          worker: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              hourlyRate: true
            }
          },
          schedule: {
            select: {
              startTime: true,
              endTime: true,
              estimatedHours: true
            }
          },
          breaks: {
            orderBy: { breakStart: 'asc' }
          }
        }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      res.json({ timeEntry });
    } catch (error) {
      console.error('Get time entry error:', error);
      res.status(500).json({ error: 'Failed to fetch time entry' });
    }
  });

  // =========================================================================
  // PATCH /api/time-entries/:id - Update time entry
  // =========================================================================
  router.patch('/:id', requirePerm('timeentries:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const updateData = updateTimeEntrySchema.parse(req.body);

      const timeEntry = await prisma.timeEntry.findFirst({
        where: { id, tenantId, isDeleted: false }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: updateData,
        include: {
          job: {
            select: {
              jobNumber: true,
              title: true
            }
          }
        }
      });

      res.json({ timeEntry: updated });
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Update time entry error:', error);
      res.status(500).json({ error: 'Failed to update time entry' });
    }
  });

  // =========================================================================
  // DELETE /api/time-entries/:id - Soft delete time entry
  // =========================================================================
  router.delete('/:id', requirePerm('timeentries:delete'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;

      const timeEntry = await prisma.timeEntry.findFirst({
        where: { id, tenantId, isDeleted: false }
      });

      if (!timeEntry) {
        return res.status(404).json({ error: 'Time entry not found' });
      }

      if (timeEntry.status === 'PAID') {
        return res.status(400).json({
          error: 'Cannot delete time entry that has been paid'
        });
      }

      await prisma.timeEntry.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: String(userId)
        }
      });

      res.json({ message: 'Time entry deleted successfully' });
    } catch (error) {
      console.error('Delete time entry error:', error);
      res.status(500).json({ error: 'Failed to delete time entry' });
    }
  });

  return router;
};
