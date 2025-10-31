// services/conflictDetection.cjs

/**
 * Conflict Detection Service
 * Checks for scheduling conflicts (worker/equipment overlap, time off, skill mismatches)
 */

class ConflictDetectionService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Check all types of conflicts for a schedule
   * @param {Object} input - Conflict check parameters
   * @param {string} input.tenantId - Tenant ID
   * @param {string} [input.workerId] - Worker ID (optional)
   * @param {string} [input.equipmentId] - Equipment ID (optional)
   * @param {Date} input.startTime - Schedule start time
   * @param {Date} input.endTime - Schedule end time
   * @param {string} [input.excludeScheduleId] - Schedule ID to exclude (for updates)
   * @param {string} input.jobId - Job ID
   * @returns {Promise<Object>} Conflict results
   */
  async checkConflicts(input) {
    const conflicts = [];

    // 1. Check worker conflicts
    if (input.workerId) {
      const workerConflicts = await this.checkWorkerConflicts(input);
      conflicts.push(...workerConflicts);
    }

    // 2. Check equipment conflicts
    if (input.equipmentId) {
      const equipmentConflicts = await this.checkEquipmentConflicts(input);
      conflicts.push(...equipmentConflicts);
    }

    // 3. Check skill requirements (if both worker and job specified)
    if (input.workerId && input.jobId) {
      const skillConflicts = await this.checkSkillRequirements(input);
      conflicts.push(...skillConflicts);
    }

    const hasCritical = conflicts.some(c => c.severity === 'CRITICAL');

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      canProceed: !hasCritical
    };
  }

  /**
   * Check worker-specific conflicts
   */
  async checkWorkerConflicts(input) {
    const conflicts = [];

    // Check for overlapping schedules
    const existingSchedules = await this.prisma.jobSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        workerId: input.workerId,
        isDeleted: false,
        status: {
          notIn: ['CANCELLED', 'COMPLETED']
        },
        ...(input.excludeScheduleId && {
          id: { not: input.excludeScheduleId }
        }),
        OR: [
          {
            // New schedule starts during existing
            AND: [
              { startTime: { lte: input.startTime } },
              { endTime: { gt: input.startTime } }
            ]
          },
          {
            // New schedule ends during existing
            AND: [
              { startTime: { lt: input.endTime } },
              { endTime: { gte: input.endTime } }
            ]
          },
          {
            // New schedule contains existing
            AND: [
              { startTime: { gte: input.startTime } },
              { endTime: { lte: input.endTime } }
            ]
          }
        ]
      },
      include: {
        job: {
          select: {
            jobNumber: true,
            title: true,
            siteAddress: true
          }
        }
      }
    });

    if (existingSchedules.length > 0) {
      conflicts.push({
        type: 'WORKER_OVERLAP',
        severity: 'HIGH',
        message: `Worker already scheduled for ${existingSchedules.length} job(s) during this time`,
        details: {
          overlappingSchedules: existingSchedules.map(s => ({
            scheduleId: s.id,
            jobNumber: s.job.jobNumber,
            jobTitle: s.job.title,
            location: s.job.siteAddress,
            start: s.startTime,
            end: s.endTime
          }))
        }
      });
    }

    // Check for time off / worker availability
    const timeOff = await this.prisma.workerAvailability.findMany({
      where: {
        tenantId: input.tenantId,
        workerId: input.workerId,
        status: 'approved',
        availabilityType: {
          in: ['time_off', 'vacation', 'sick_leave', 'personal', 'unavailable']
        },
        startDate: { lte: input.endTime },
        endDate: { gte: input.startTime }
      }
    });

    if (timeOff.length > 0) {
      conflicts.push({
        type: 'WORKER_UNAVAILABLE',
        severity: 'CRITICAL',
        message: 'Worker has approved time off during this period',
        details: {
          timeOffRequests: timeOff.map(t => ({
            id: t.id,
            type: t.availabilityType,
            startDate: t.startDate,
            endDate: t.endDate,
            reason: t.reason
          }))
        }
      });
    }

    return conflicts;
  }

  /**
   * Check equipment-specific conflicts
   */
  async checkEquipmentConflicts(input) {
    const conflicts = [];

    // Check equipment availability status
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: input.equipmentId }
    });

    if (!equipment) {
      conflicts.push({
        type: 'EQUIPMENT_UNAVAILABLE',
        severity: 'CRITICAL',
        message: 'Equipment not found',
        details: { equipmentId: input.equipmentId }
      });
      return conflicts;
    }

    if (equipment.status === 'OUT_OF_SERVICE') {
      conflicts.push({
        type: 'EQUIPMENT_UNAVAILABLE',
        severity: 'CRITICAL',
        message: 'Equipment is out of service',
        details: { status: equipment.status }
      });
      return conflicts;
    }

    if (equipment.status === 'MAINTENANCE') {
      conflicts.push({
        type: 'EQUIPMENT_UNAVAILABLE',
        severity: 'CRITICAL',
        message: 'Equipment is in maintenance',
        details: { status: equipment.status }
      });
      return conflicts;
    }

    // Check for overlapping equipment schedules
    const existingSchedules = await this.prisma.jobSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        equipmentId: input.equipmentId,
        isDeleted: false,
        status: {
          notIn: ['CANCELLED', 'COMPLETED']
        },
        ...(input.excludeScheduleId && {
          id: { not: input.excludeScheduleId }
        }),
        OR: [
          {
            AND: [
              { startTime: { lte: input.startTime } },
              { endTime: { gt: input.startTime } }
            ]
          },
          {
            AND: [
              { startTime: { lt: input.endTime } },
              { endTime: { gte: input.endTime } }
            ]
          },
          {
            AND: [
              { startTime: { gte: input.startTime } },
              { endTime: { lte: input.endTime } }
            ]
          }
        ]
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

    if (existingSchedules.length > 0) {
      conflicts.push({
        type: 'EQUIPMENT_OVERLAP',
        severity: 'HIGH',
        message: `Equipment already scheduled for ${existingSchedules.length} job(s)`,
        details: {
          overlappingSchedules: existingSchedules.map(s => ({
            scheduleId: s.id,
            jobNumber: s.job.jobNumber,
            jobTitle: s.job.title,
            start: s.startTime,
            end: s.endTime
          }))
        }
      });
    }

    return conflicts;
  }

  /**
   * Check if worker has required skills for job
   */
  async checkSkillRequirements(input) {
    const conflicts = [];

    // Get job's required skills
    const job = await this.prisma.job.findUnique({
      where: { id: input.jobId },
      select: {
        requiredSkills: true
      }
    });

    if (!job || !job.requiredSkills || job.requiredSkills.length === 0) {
      return conflicts; // No skill requirements
    }

    // Get worker's skills
    const worker = await this.prisma.worker.findUnique({
      where: { id: input.workerId },
      select: {
        skills: true
      }
    });

    if (!worker) {
      return conflicts;
    }

    const workerSkills = worker.skills || [];
    const requiredSkills = job.requiredSkills || [];

    // Find missing skills
    const missingSkills = requiredSkills.filter(
      skill => !workerSkills.includes(skill)
    );

    if (missingSkills.length > 0) {
      conflicts.push({
        type: 'SKILL_MISMATCH',
        severity: 'MEDIUM',
        message: `Worker missing ${missingSkills.length} required skill(s)`,
        details: {
          missingSkills: missingSkills.map(skill => ({
            skillName: skill,
            required: true
          })),
          workerSkills,
          requiredSkills
        }
      });
    }

    return conflicts;
  }
}

module.exports = ConflictDetectionService;
