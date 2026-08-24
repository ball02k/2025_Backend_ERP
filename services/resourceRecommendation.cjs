// services/resourceRecommendation.cjs
/**
 * Resource Recommendation Service
 * Ranks workers and equipment based on multiple factors:
 * - Preferred engineer
 * - Skills/certifications match
 * - Proximity to job site
 * - Cost (hourly rate + travel time)
 * - SLA compliance
 * - Availability
 */

class ResourceRecommendationService {
  constructor(prisma) {
    this.prisma = prisma;

    // Default weights (fallback if no tenant settings)
    this.defaultWeights = {
      workers: {
        preferredEngineer: 30,
        skillsMatch: 25,
        certsMatch: 20,
        proximity: 15,
        cost: 15,
        availability: 20
      },
      equipment: {
        availability: 40,
        proximity: 30,
        cost: 20,
        maintenance: 10
      },
      priorityMultipliers: {
        LOW: 0.9,
        NORMAL: 1.0,
        HIGH: 1.15,
        URGENT: 1.3,
        CRITICAL: 1.5
      }
    };
  }

  /**
   * Load custom weights for a tenant with optional overrides
   * @param {string} tenantId
   * @param {Object} context - { jobType, trade, clientId, priority }
   * @returns {Object} Merged weights object
   */
  async loadWeights(tenantId, context = {}) {
    // Start with default weights
    let weights = JSON.parse(JSON.stringify(this.defaultWeights));

    try {
      // Load tenant-level weights
      const tenantSettings = await this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { recommendationWeights: true }
      });

      if (tenantSettings?.recommendationWeights) {
        weights = this.mergeWeights(weights, tenantSettings.recommendationWeights);
      }

      // Load context-specific overrides (in order of specificity)
      const overrideConditions = [];

      if (context.jobType) {
        overrideConditions.push({ overrideType: 'job_type', overrideKey: context.jobType });
      }
      if (context.trade) {
        overrideConditions.push({ overrideType: 'trade', overrideKey: context.trade });
      }
      if (context.clientId) {
        overrideConditions.push({ overrideType: 'client', overrideKey: context.clientId });
      }
      if (context.priority) {
        overrideConditions.push({ overrideType: 'priority', overrideKey: context.priority });
      }

      if (overrideConditions.length > 0) {
        const overrides = await this.prisma.recommendationWeightOverride.findMany({
          where: {
            tenantId,
            isActive: true,
            OR: overrideConditions
          },
          orderBy: { createdAt: 'asc' } // Earlier created = lower priority
        });

        // Apply overrides in order
        for (const override of overrides) {
          weights = this.mergeWeights(weights, override.weights);
        }
      }

      return weights;
    } catch (error) {
      console.error('Error loading custom weights:', error);
      return weights; // Return defaults on error
    }
  }

  /**
   * Deep merge two weight objects
   */
  mergeWeights(base, override) {
    const merged = JSON.parse(JSON.stringify(base));

    if (typeof override === 'object' && override !== null) {
      for (const [key, value] of Object.entries(override)) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          merged[key] = this.mergeWeights(merged[key] || {}, value);
        } else {
          merged[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  toRad(value) {
    return (value * Math.PI) / 180;
  }

  /**
   * Calculate travel time in minutes based on distance
   * Assumes average speed of 50 km/h
   */
  calculateTravelTime(distanceKm) {
    const avgSpeedKmh = 50;
    return Math.round((distanceKm / avgSpeedKmh) * 60);
  }

  /**
   * Calculate total cost including hourly rate and travel time
   */
  calculateTotalCost(hourlyRate, estimatedHours, travelTimeMinutes) {
    const travelHours = travelTimeMinutes / 60;
    const totalHours = (estimatedHours || 0) + travelHours;
    return hourlyRate * totalHours;
  }

  /**
   * Check if worker has required skills
   */
  checkSkillsMatch(workerSkills, requiredSkills) {
    if (!requiredSkills || requiredSkills.length === 0) {
      return { score: 1.0, matchedCount: 0, totalRequired: 0 };
    }

    const matched = requiredSkills.filter(skill =>
      workerSkills.some(ws => ws.toLowerCase() === skill.toLowerCase())
    );

    return {
      score: matched.length / requiredSkills.length,
      matchedCount: matched.length,
      totalRequired: requiredSkills.length
    };
  }

  /**
   * Check if worker has required certifications
   */
  checkCertsMatch(workerCerts, requiredCerts) {
    if (!requiredCerts || requiredCerts.length === 0) {
      return { score: 1.0, matchedCount: 0, totalRequired: 0 };
    }

    if (!workerCerts || typeof workerCerts !== 'object') {
      return { score: 0, matchedCount: 0, totalRequired: requiredCerts.length };
    }

    const workerCertNames = Object.keys(workerCerts).map(c => c.toLowerCase());
    const matched = requiredCerts.filter(cert =>
      workerCertNames.includes(cert.toLowerCase())
    );

    return {
      score: matched.length / requiredCerts.length,
      matchedCount: matched.length,
      totalRequired: requiredCerts.length
    };
  }

  /**
   * Check worker availability during the requested time period
   */
  async checkWorkerAvailability(workerId, tenantId, startTime, endTime) {
    // Check existing schedules
    const conflictingSchedules = await this.prisma.jobSchedule.findMany({
      where: {
        workerId,
        tenantId,
        isDeleted: false,
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } }
            ]
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } }
            ]
          },
          {
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } }
            ]
          }
        ]
      }
    });

    // Check worker availability records (time off, etc.)
    const unavailablePeriods = await this.prisma.workerAvailability.findMany({
      where: {
        workerId,
        tenantId,
        status: 'approved',
        OR: [
          {
            AND: [
              { startDate: { lte: startTime } },
              { endDate: { gt: startTime } }
            ]
          },
          {
            AND: [
              { startDate: { lt: endTime } },
              { endDate: { gte: endTime } }
            ]
          },
          {
            AND: [
              { startDate: { gte: startTime } },
              { endDate: { lte: endTime } }
            ]
          }
        ]
      }
    });

    const hasConflicts = conflictingSchedules.length > 0 || unavailablePeriods.length > 0;

    return {
      available: !hasConflicts,
      conflicts: conflictingSchedules.length,
      unavailablePeriods: unavailablePeriods.length,
      score: hasConflicts ? 0 : 1.0
    };
  }

  /**
   * Check equipment availability during the requested time period
   */
  async checkEquipmentAvailability(equipmentId, tenantId, startTime, endTime) {
    const conflictingSchedules = await this.prisma.jobSchedule.findMany({
      where: {
        equipmentId,
        tenantId,
        isDeleted: false,
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } }
            ]
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } }
            ]
          },
          {
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } }
            ]
          }
        ]
      }
    });

    return {
      available: conflictingSchedules.length === 0,
      conflicts: conflictingSchedules.length,
      score: conflictingSchedules.length === 0 ? 1.0 : 0
    };
  }

  /**
   * Calculate SLA compliance score
   * Higher score for resources that can help meet SLA deadlines
   */
  calculateSlaScore(slaDueDate, scheduledStartDate) {
    if (!slaDueDate) {
      return 1.0; // No SLA constraint
    }

    const now = new Date();
    const timeToSla = slaDueDate.getTime() - now.getTime();
    const timeToStart = scheduledStartDate ? scheduledStartDate.getTime() - now.getTime() : 0;

    // If SLA is already overdue
    if (timeToSla < 0) {
      return 2.0; // Urgent - double score
    }

    // If scheduled start is close to SLA deadline
    const slaBuffer = timeToSla - timeToStart;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (slaBuffer < oneDayMs) {
      return 1.8; // Very urgent
    } else if (slaBuffer < 3 * oneDayMs) {
      return 1.5; // Urgent
    } else if (slaBuffer < 7 * oneDayMs) {
      return 1.2; // Important
    }

    return 1.0; // Normal
  }

  /**
   * Recommend workers for a job
   * @param {Object} params
   * @returns {Array} Ranked list of workers with scores
   */
  async recommendWorkers(params) {
    const {
      tenantId,
      jobId,
      jobType,
      trade,
      clientId,
      siteLatitude,
      siteLongitude,
      requiredSkills = [],
      requiredCerts = [],
      estimatedHours,
      scheduledStartDate,
      scheduledEndDate,
      preferredEngineerId,
      slaDueDate,
      priority = 'NORMAL',
      limit = 10
    } = params;

    // Load custom weights for this tenant/job context
    const weights = await this.loadWeights(tenantId, { jobType, trade, clientId, priority });
    const workerWeights = weights.workers;
    const priorityMultiplier = weights.priorityMultipliers[priority] || 1.0;

    // Parse dates if strings
    const startTime = scheduledStartDate ? new Date(scheduledStartDate) : new Date();
    const endTime = scheduledEndDate ? new Date(scheduledEndDate) : new Date(startTime.getTime() + (estimatedHours || 1) * 60 * 60 * 1000);

    // Fetch all active workers
    const workers = await this.prisma.worker.findMany({
      where: {
        tenantId,
        isActive: true,
        isDeleted: false,
        availabilityStatus: 'AVAILABLE'
      },
      include: {
        schedules: {
          where: {
            isDeleted: false,
            startTime: { lte: endTime },
            endTime: { gte: startTime }
          }
        }
      }
    });

    // Score each worker
    const scoredWorkers = await Promise.all(
      workers.map(async (worker) => {
        let totalScore = 0;
        const breakdown = {};

        // 1. Preferred Engineer Bonus (configurable weight)
        if (preferredEngineerId && worker.id === preferredEngineerId) {
          breakdown.preferredEngineer = workerWeights.preferredEngineer;
          totalScore += workerWeights.preferredEngineer;
        } else {
          breakdown.preferredEngineer = 0;
        }

        // 2. Skills Match (configurable weight)
        const skillsMatch = this.checkSkillsMatch(worker.skills || [], requiredSkills);
        breakdown.skillsMatch = skillsMatch.score * workerWeights.skillsMatch;
        totalScore += breakdown.skillsMatch;
        breakdown.skillsMatchDetails = skillsMatch;

        // 3. Certifications Match (configurable weight)
        const certsMatch = this.checkCertsMatch(worker.certifications, requiredCerts);
        breakdown.certsMatch = certsMatch.score * workerWeights.certsMatch;
        totalScore += breakdown.certsMatch;
        breakdown.certsMatchDetails = certsMatch;

        // 4. Proximity (configurable weight)
        let distance = null;
        let travelTime = null;
        if (siteLatitude && siteLongitude && worker.currentLatitude && worker.currentLongitude) {
          distance = this.calculateDistance(
            parseFloat(worker.currentLatitude),
            parseFloat(worker.currentLongitude),
            parseFloat(siteLatitude),
            parseFloat(siteLongitude)
          );
          travelTime = this.calculateTravelTime(distance);

          // Closer = higher score (max at 0km, min at 200km+)
          const proximityScore = Math.max(0, workerWeights.proximity * (1 - distance / 200));
          breakdown.proximity = proximityScore;
          totalScore += proximityScore;
        } else {
          breakdown.proximity = workerWeights.proximity / 2; // Neutral score if no location data
          totalScore += workerWeights.proximity / 2;
        }

        // 5. Cost Efficiency (configurable weight)
        const hourlyRate = parseFloat(worker.hourlyRate || 0);
        const totalCost = this.calculateTotalCost(hourlyRate, estimatedHours, travelTime || 0);

        // Lower cost = higher score (max at £0, min at £500+)
        const costScore = Math.max(0, workerWeights.cost * (1 - totalCost / 500));
        breakdown.cost = costScore;
        breakdown.costDetails = {
          hourlyRate,
          travelTime,
          estimatedHours,
          totalCost: totalCost.toFixed(2)
        };
        totalScore += costScore;

        // 6. Availability (configurable weight)
        const availability = await this.checkWorkerAvailability(
          worker.id,
          tenantId,
          startTime,
          endTime
        );
        breakdown.availability = availability.score * workerWeights.availability;
        breakdown.availabilityDetails = availability;
        totalScore += breakdown.availability;

        // 7. SLA Compliance Multiplier
        const slaMultiplier = this.calculateSlaScore(slaDueDate, startTime);
        breakdown.slaMultiplier = slaMultiplier;
        totalScore *= slaMultiplier;

        // 8. Priority Multiplier (configurable)
        breakdown.priorityMultiplier = priorityMultiplier;
        totalScore *= priorityMultiplier;

        return {
          worker: {
            id: worker.id,
            workerNumber: worker.workerNumber,
            firstName: worker.firstName,
            lastName: worker.lastName,
            email: worker.email,
            phone: worker.phone,
            role: worker.role,
            skills: worker.skills,
            certifications: worker.certifications,
            hourlyRate: worker.hourlyRate,
            availabilityStatus: worker.availabilityStatus,
            currentLatitude: worker.currentLatitude,
            currentLongitude: worker.currentLongitude
          },
          score: Math.round(totalScore * 100) / 100,
          breakdown,
          distance: distance ? Math.round(distance * 10) / 10 : null,
          travelTime,
          estimatedCost: totalCost ? totalCost.toFixed(2) : null,
          available: availability.available,
          conflicts: availability.conflicts
        };
      })
    );

    // Sort by score (descending) and limit results
    return scoredWorkers
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Recommend equipment for a job
   * @param {Object} params
   * @returns {Array} Ranked list of equipment with scores
   */
  async recommendEquipment(params) {
    const {
      tenantId,
      jobType,
      trade,
      clientId,
      equipmentType,
      siteLatitude,
      siteLongitude,
      estimatedHours,
      scheduledStartDate,
      scheduledEndDate,
      slaDueDate,
      priority = 'NORMAL',
      limit = 10
    } = params;

    // Load custom weights for this tenant/job context
    const weights = await this.loadWeights(tenantId, { jobType, trade, clientId, priority });
    const equipmentWeights = weights.equipment;
    const priorityMultiplier = weights.priorityMultipliers[priority] || 1.0;

    const startTime = scheduledStartDate ? new Date(scheduledStartDate) : new Date();
    const endTime = scheduledEndDate ? new Date(scheduledEndDate) : new Date(startTime.getTime() + (estimatedHours || 1) * 60 * 60 * 1000);

    // Build where clause
    const where = {
      tenantId,
      isActive: true,
      isDeleted: false,
      status: {
        in: ['AVAILABLE', 'IN_USE'] // Include in-use equipment (might become available)
      }
    };

    if (equipmentType) {
      where.type = equipmentType;
    }

    const equipment = await this.prisma.equipment.findMany({
      where,
      include: {
        schedules: {
          where: {
            isDeleted: false,
            startTime: { lte: endTime },
            endTime: { gte: startTime }
          }
        }
      }
    });

    const scoredEquipment = await Promise.all(
      equipment.map(async (item) => {
        let totalScore = 0;
        const breakdown = {};

        // 1. Availability (configurable weight - most important for equipment)
        const availability = await this.checkEquipmentAvailability(
          item.id,
          tenantId,
          startTime,
          endTime
        );
        breakdown.availability = availability.score * equipmentWeights.availability;
        breakdown.availabilityDetails = availability;
        totalScore += breakdown.availability;

        // 2. Proximity (configurable weight)
        let distance = null;
        let travelTime = null;
        if (siteLatitude && siteLongitude && item.currentLatitude && item.currentLongitude) {
          distance = this.calculateDistance(
            parseFloat(item.currentLatitude),
            parseFloat(item.currentLongitude),
            parseFloat(siteLatitude),
            parseFloat(siteLongitude)
          );
          travelTime = this.calculateTravelTime(distance);

          const proximityScore = Math.max(0, equipmentWeights.proximity * (1 - distance / 200));
          breakdown.proximity = proximityScore;
          totalScore += proximityScore;
        } else {
          breakdown.proximity = equipmentWeights.proximity / 2;
          totalScore += equipmentWeights.proximity / 2;
        }

        // 3. Cost Efficiency (configurable weight)
        const hourlyRate = parseFloat(item.hourlyRate || item.dailyRate / 8 || 0);
        const totalCost = this.calculateTotalCost(hourlyRate, estimatedHours, travelTime || 0);

        const costScore = Math.max(0, equipmentWeights.cost * (1 - totalCost / 300));
        breakdown.cost = costScore;
        breakdown.costDetails = {
          hourlyRate,
          dailyRate: item.dailyRate,
          travelTime,
          estimatedHours,
          totalCost: totalCost.toFixed(2)
        };
        totalScore += costScore;

        // 4. Maintenance Status (configurable weight)
        const now = new Date();
        const maintenanceScore = item.nextMaintenanceDate && new Date(item.nextMaintenanceDate) > now
          ? equipmentWeights.maintenance
          : equipmentWeights.maintenance / 2;
        breakdown.maintenance = maintenanceScore;
        totalScore += maintenanceScore;

        // 5. SLA Compliance Multiplier
        const slaMultiplier = this.calculateSlaScore(slaDueDate, startTime);
        breakdown.slaMultiplier = slaMultiplier;
        totalScore *= slaMultiplier;

        // 6. Priority Multiplier (configurable)
        breakdown.priorityMultiplier = priorityMultiplier;
        totalScore *= priorityMultiplier;

        return {
          equipment: {
            id: item.id,
            equipmentNumber: item.equipmentNumber,
            name: item.name,
            type: item.type,
            category: item.category,
            manufacturer: item.manufacturer,
            model: item.model,
            status: item.status,
            hourlyRate: item.hourlyRate,
            dailyRate: item.dailyRate,
            currentLatitude: item.currentLatitude,
            currentLongitude: item.currentLongitude,
            lastMaintenanceDate: item.lastMaintenanceDate,
            nextMaintenanceDate: item.nextMaintenanceDate
          },
          score: Math.round(totalScore * 100) / 100,
          breakdown,
          distance: distance ? Math.round(distance * 10) / 10 : null,
          travelTime,
          estimatedCost: totalCost ? totalCost.toFixed(2) : null,
          available: availability.available,
          conflicts: availability.conflicts
        };
      })
    );

    return scoredEquipment
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

module.exports = ResourceRecommendationService;
