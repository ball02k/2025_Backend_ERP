// routes/equipment.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { generateEquipmentNumber } = require('../utils/autoNumbering.cjs');
const {
  equipmentQuerySchema,
  createEquipmentSchema,
  updateEquipmentSchema,
  checkAvailabilitySchema,
  logMaintenanceSchema,
  updateLocationSchema,
} = require('../lib/validation.equipment.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  // ============================================================================
  // GET /api/equipment - List equipment with filters
  // ============================================================================
  router.get('/', requirePerm('equipment:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const query = equipmentQuerySchema.parse(req.query);

      // Build where clause
      const where = {
        tenantId,
        isDeleted: false,
      };

      if (query.type) where.type = query.type;
      if (query.category) where.category = query.category;
      if (query.status) where.status = query.status;
      if (query.isActive !== undefined) where.isActive = query.isActive;

      // Maintenance due filtering
      if (query.maintenanceDue) {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        where.nextMaintenanceDate = {
          lte: thirtyDaysFromNow,
          gte: new Date(),
        };
      }

      // Search
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { equipmentNumber: { contains: query.search, mode: 'insensitive' } },
          { serialNumber: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      // Pagination
      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      // Get total count
      const total = await prisma.equipment.count({ where });

      // Get equipment
      const equipment = await prisma.equipment.findMany({
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
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      // Add maintenance status
      const equipmentWithStatus = equipment.map(eq => {
        const maintenanceDueSoon = eq.nextMaintenanceDate &&
          new Date(eq.nextMaintenanceDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const maintenanceOverdue = eq.nextMaintenanceDate &&
          new Date(eq.nextMaintenanceDate) < new Date();

        return {
          ...eq,
          maintenanceStatus: maintenanceOverdue ? 'overdue' : maintenanceDueSoon ? 'due_soon' : 'ok',
        };
      });

      res.json({
        success: true,
        data: equipmentWithStatus,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (error) {
      console.error('Error fetching equipment:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to fetch equipment',
      });
    }
  });

  // ============================================================================
  // GET /api/equipment/maintenance/due - Get equipment with upcoming maintenance
  // ============================================================================
  router.get('/maintenance/due', requirePerm('equipment:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      // Get equipment with maintenance due within 30 days
      const equipmentDue = await prisma.equipment.findMany({
        where: {
          tenantId,
          isDeleted: false,
          isActive: true,
          nextMaintenanceDate: {
            lte: thirtyDaysFromNow,
            gte: new Date(),
          },
        },
        orderBy: {
          nextMaintenanceDate: 'asc',
        },
      });

      // Get overdue equipment
      const equipmentOverdue = await prisma.equipment.findMany({
        where: {
          tenantId,
          isDeleted: false,
          isActive: true,
          nextMaintenanceDate: {
            lt: new Date(),
          },
        },
        orderBy: {
          nextMaintenanceDate: 'asc',
        },
      });

      res.json({
        success: true,
        data: {
          dueSoon: equipmentDue,
          overdue: equipmentOverdue,
          summary: {
            dueSoonCount: equipmentDue.length,
            overdueCount: equipmentOverdue.length,
          },
        },
      });
    } catch (error) {
      console.error('Error fetching maintenance due:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch maintenance schedule',
      });
    }
  });

  // ============================================================================
  // GET /api/equipment/:id - Get single equipment
  // ============================================================================
  router.get('/:id', requirePerm('equipment:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const equipment = await prisma.equipment.findFirst({
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
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                },
              },
            },
            orderBy: {
              startTime: 'desc',
            },
            take: 20,
          },
        },
      });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          error: 'Equipment not found',
        });
      }

      // Calculate maintenance status
      const maintenanceDueSoon = equipment.nextMaintenanceDate &&
        new Date(equipment.nextMaintenanceDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const maintenanceOverdue = equipment.nextMaintenanceDate &&
        new Date(equipment.nextMaintenanceDate) < new Date();

      res.json({
        success: true,
        data: {
          ...equipment,
          maintenanceStatus: maintenanceOverdue ? 'overdue' : maintenanceDueSoon ? 'due_soon' : 'ok',
        },
      });
    } catch (error) {
      console.error('Error fetching equipment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch equipment',
      });
    }
  });

  // ============================================================================
  // POST /api/equipment - Create new equipment
  // ============================================================================
  router.post('/', requirePerm('equipment:create'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const data = createEquipmentSchema.parse(req.body);

      // Check for duplicate serial number
      if (data.serialNumber) {
        const existingEquipment = await prisma.equipment.findFirst({
          where: {
            tenantId,
            serialNumber: data.serialNumber,
            isDeleted: false,
          },
        });

        if (existingEquipment) {
          return res.status(409).json({
            success: false,
            error: 'Equipment with this serial number already exists',
          });
        }
      }

      // Generate equipment number
      const equipmentNumber = await generateEquipmentNumber(tenantId);

      // Create equipment
      const equipment = await prisma.equipment.create({
        data: {
          ...data,
          tenantId,
          equipmentNumber,
          lastMaintenanceDate: data.lastMaintenanceDate ? new Date(data.lastMaintenanceDate) : undefined,
          nextMaintenanceDate: data.nextMaintenanceDate ? new Date(data.nextMaintenanceDate) : undefined,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        },
      });

      res.status(201).json({
        success: true,
        data: equipment,
        message: `Equipment ${equipmentNumber} created successfully`,
      });
    } catch (error) {
      console.error('Error creating equipment:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create equipment',
      });
    }
  });

  // ============================================================================
  // PATCH /api/equipment/:id - Update equipment
  // ============================================================================
  router.patch('/:id', requirePerm('equipment:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const data = updateEquipmentSchema.parse(req.body);

      // Check if equipment exists
      const existingEquipment = await prisma.equipment.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingEquipment) {
        return res.status(404).json({
          success: false,
          error: 'Equipment not found',
        });
      }

      // Check for duplicate serial number if being changed
      if (data.serialNumber && data.serialNumber !== existingEquipment.serialNumber) {
        const duplicateEquipment = await prisma.equipment.findFirst({
          where: {
            tenantId,
            serialNumber: data.serialNumber,
            isDeleted: false,
            id: { not: id },
          },
        });

        if (duplicateEquipment) {
          return res.status(409).json({
            success: false,
            error: 'Equipment with this serial number already exists',
          });
        }
      }

      // Update equipment
      const equipment = await prisma.equipment.update({
        where: { id },
        data: {
          ...data,
          lastMaintenanceDate: data.lastMaintenanceDate ? new Date(data.lastMaintenanceDate) : undefined,
          nextMaintenanceDate: data.nextMaintenanceDate ? new Date(data.nextMaintenanceDate) : undefined,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        },
      });

      res.json({
        success: true,
        data: equipment,
        message: 'Equipment updated successfully',
      });
    } catch (error) {
      console.error('Error updating equipment:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update equipment',
      });
    }
  });

  // ============================================================================
  // DELETE /api/equipment/:id - Soft delete equipment
  // ============================================================================
  router.delete('/:id', requirePerm('equipment:delete'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      // Check if equipment exists
      const existingEquipment = await prisma.equipment.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingEquipment) {
        return res.status(404).json({
          success: false,
          error: 'Equipment not found',
        });
      }

      // Check if equipment has upcoming schedules
      const upcomingSchedules = await prisma.jobSchedule.count({
        where: {
          tenantId,
          equipmentId: id,
          isDeleted: false,
          startTime: {
            gte: new Date(),
          },
        },
      });

      if (upcomingSchedules > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete equipment with ${upcomingSchedules} upcoming job schedules`,
        });
      }

      // Soft delete
      await prisma.equipment.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
        },
      });

      res.json({
        success: true,
        message: 'Equipment deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting equipment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete equipment',
      });
    }
  });

  // ============================================================================
  // GET /api/equipment/:id/availability - Check equipment availability
  // ============================================================================
  router.get('/:id/availability', requirePerm('equipment:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { startDate, endDate } = checkAvailabilitySchema.parse(req.query);

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Get equipment
      const equipment = await prisma.equipment.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          error: 'Equipment not found',
        });
      }

      // Check current status
      if (equipment.status === 'OUT_OF_SERVICE') {
        return res.json({
          success: true,
          data: {
            equipment: {
              id: equipment.id,
              equipmentNumber: equipment.equipmentNumber,
              name: equipment.name,
              status: equipment.status,
            },
            requestedPeriod: { startDate, endDate },
            isAvailable: false,
            reason: 'Equipment is out of service',
            conflicts: [],
          },
        });
      }

      if (equipment.status === 'MAINTENANCE') {
        return res.json({
          success: true,
          data: {
            equipment: {
              id: equipment.id,
              equipmentNumber: equipment.equipmentNumber,
              name: equipment.name,
              status: equipment.status,
            },
            requestedPeriod: { startDate, endDate },
            isAvailable: false,
            reason: 'Equipment is under maintenance',
            conflicts: [],
          },
        });
      }

      // Check for overlapping schedules
      const overlappingSchedules = await prisma.jobSchedule.findMany({
        where: {
          tenantId,
          equipmentId: id,
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

      const isAvailable = overlappingSchedules.length === 0;

      res.json({
        success: true,
        data: {
          equipment: {
            id: equipment.id,
            equipmentNumber: equipment.equipmentNumber,
            name: equipment.name,
            status: equipment.status,
          },
          requestedPeriod: { startDate, endDate },
          isAvailable,
          reason: isAvailable ? null : 'Equipment is already scheduled',
          conflicts: overlappingSchedules,
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
  // POST /api/equipment/:id/maintenance - Log maintenance
  // ============================================================================
  router.post('/:id/maintenance', requirePerm('equipment:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const data = logMaintenanceSchema.parse(req.body);

      // Get equipment
      const equipment = await prisma.equipment.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          error: 'Equipment not found',
        });
      }

      // Calculate next maintenance date if not provided
      let nextMaintenanceDate = data.nextMaintenanceDate ? new Date(data.nextMaintenanceDate) : null;

      if (!nextMaintenanceDate && equipment.maintenanceInterval) {
        const maintenanceDate = new Date(data.maintenanceDate);
        nextMaintenanceDate = new Date(maintenanceDate);
        nextMaintenanceDate.setDate(nextMaintenanceDate.getDate() + equipment.maintenanceInterval);
      }

      // Update equipment
      const updatedEquipment = await prisma.equipment.update({
        where: { id },
        data: {
          lastMaintenanceDate: new Date(data.maintenanceDate),
          nextMaintenanceDate,
          status: 'AVAILABLE',
        },
      });

      res.json({
        success: true,
        data: updatedEquipment,
        message: 'Maintenance logged successfully',
      });
    } catch (error) {
      console.error('Error logging maintenance:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to log maintenance',
      });
    }
  });

  // ============================================================================
  // POST /api/equipment/:id/location - Update equipment location
  // ============================================================================
  router.post('/:id/location', requirePerm('equipment:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { latitude, longitude, location } = updateLocationSchema.parse(req.body);

      // Update equipment location
      const equipment = await prisma.equipment.update({
        where: {
          id,
          tenantId,
        },
        data: {
          currentLatitude: latitude,
          currentLongitude: longitude,
          currentLocation: location,
        },
      });

      res.json({
        success: true,
        data: {
          equipmentId: equipment.id,
          equipmentNumber: equipment.equipmentNumber,
          latitude: equipment.currentLatitude,
          longitude: equipment.currentLongitude,
          location: equipment.currentLocation,
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
