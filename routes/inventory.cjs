// routes/inventory.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { z } = require('zod');

module.exports = (prisma) => {
  const router = express.Router();

  // ============================================================================
  // INVENTORY ITEMS CRUD
  // ============================================================================

  // GET /api/inventory - List inventory items
  router.get('/', requirePerm('inventory:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const {
        page = 1,
        limit = 50,
        category,
        status,
        lowStock,
        search
      } = req.query;

      const where = {
        tenantId,
        isDeleted: false,
      };

      if (category) where.category = category;
      if (status) where.status = status;
      if (lowStock === 'true') {
        where.quantityAvailable = { lt: prisma.$queryRaw`reorder_level` };
      }
      if (search) {
        where.OR = [
          { itemName: { contains: search, mode: 'insensitive' } },
          { itemNumber: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [items, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where,
          skip,
          take,
          orderBy: { itemName: 'asc' },
        }),
        prisma.inventoryItem.count({ where }),
      ]);

      res.json({
        success: true,
        data: items,
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

  // GET /api/inventory/:id - Get single inventory item
  router.get('/:id', requirePerm('inventory:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const item = await prisma.inventoryItem.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false,
        },
        include: {
          reservations: {
            where: { status: { in: ['RESERVED', 'ALLOCATED'] } },
            include: {
              job: {
                select: { id: true, jobNumber: true, title: true },
              },
            },
          },
          jobMaterials: {
            where: { status: { in: ['pending', 'allocated'] } },
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: { message: 'Inventory item not found' },
        });
      }

      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/inventory - Create inventory item
  router.post('/', requirePerm('inventory:create'), async (req, res, next) => {
    try {
      const { tenantId, userId } = req.user;

      const data = {
        ...req.body,
        tenantId,
      };

      // Generate item number if not provided
      if (!data.itemNumber) {
        const count = await prisma.inventoryItem.count({ where: { tenantId } });
        data.itemNumber = `INV-${String(count + 1).padStart(6, '0')}`;
      }

      // Calculate available quantity
      data.quantityAvailable = (data.quantityInStock || 0) - (data.quantityReserved || 0);

      const item = await prisma.inventoryItem.create({ data });

      res.status(201).json({
        success: true,
        data: item,
        message: 'Inventory item created successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/inventory/:id - Update inventory item
  router.patch('/:id', requirePerm('inventory:update'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const existingItem = await prisma.inventoryItem.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!existingItem) {
        return res.status(404).json({
          success: false,
          error: { message: 'Inventory item not found' },
        });
      }

      // Recalculate available quantity if stock or reserved changes
      const updateData = { ...req.body };
      if (updateData.quantityInStock !== undefined || updateData.quantityReserved !== undefined) {
        updateData.quantityAvailable =
          (updateData.quantityInStock ?? existingItem.quantityInStock) -
          (updateData.quantityReserved ?? existingItem.quantityReserved);
      }

      const item = await prisma.inventoryItem.update({
        where: { id },
        data: updateData,
      });

      res.json({
        success: true,
        data: item,
        message: 'Inventory item updated successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/inventory/:id - Soft delete inventory item
  router.delete('/:id', requirePerm('inventory:delete'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const item = await prisma.inventoryItem.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: { message: 'Inventory item not found' },
        });
      }

      await prisma.inventoryItem.update({
        where: { id },
        data: { isDeleted: true },
      });

      res.json({
        success: true,
        message: 'Inventory item deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // STOCK RESERVATIONS
  // ============================================================================

  // POST /api/inventory/reserve - Reserve stock for a job
  router.post('/reserve', requirePerm('inventory:reserve'), async (req, res, next) => {
    try {
      const { tenantId, userId } = req.user;
      const { inventoryItemId, jobId, quantityReserved, jobMaterialId, requiredByDate, notes } = req.body;

      // Validation
      if (!inventoryItemId || !jobId || !quantityReserved) {
        return res.status(400).json({
          success: false,
          error: { message: 'inventoryItemId, jobId, and quantityReserved are required' },
        });
      }

      // Check if inventory item exists and has sufficient stock
      const item = await prisma.inventoryItem.findFirst({
        where: { id: inventoryItemId, tenantId, isDeleted: false },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: { message: 'Inventory item not found' },
        });
      }

      if (parseFloat(item.quantityAvailable) < parseFloat(quantityReserved)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Insufficient stock available',
            details: {
              available: item.quantityAvailable,
              requested: quantityReserved,
            },
          },
        });
      }

      // Check if job exists
      const job = await prisma.job.findFirst({
        where: { id: jobId, tenantId, isDeleted: false },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: { message: 'Job not found' },
        });
      }

      // Create reservation and update inventory in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create reservation
        const reservation = await tx.inventoryReservation.create({
          data: {
            tenantId,
            inventoryItemId,
            jobId,
            jobMaterialId,
            quantityReserved: parseFloat(quantityReserved),
            requiredByDate: requiredByDate ? new Date(requiredByDate) : null,
            notes,
            reservedBy: userId,
            status: 'RESERVED',
          },
          include: {
            inventoryItem: true,
            job: {
              select: { id: true, jobNumber: true, title: true },
            },
          },
        });

        // Update inventory item quantities
        const updatedItem = await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: {
            quantityReserved: { increment: parseFloat(quantityReserved) },
            quantityAvailable: { decrement: parseFloat(quantityReserved) },
          },
        });

        // Create stock movement record
        await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId,
            movementType: 'JOB_ALLOCATION',
            quantityChange: -parseFloat(quantityReserved),
            quantityBefore: parseFloat(item.quantityAvailable),
            quantityAfter: parseFloat(updatedItem.quantityAvailable),
            referenceType: 'JOB',
            referenceId: jobId,
            jobId,
            reason: `Reserved for job ${job.jobNumber}`,
            performedBy: userId,
            notes,
          },
        });

        // Check if stock is below reorder level and auto-PO is enabled
        if (updatedItem.autoGeneratePO &&
            parseFloat(updatedItem.quantityAvailable) <= parseFloat(updatedItem.reorderLevel)) {
          // Auto-generate purchase order (handled in next endpoint)
          // This will be implemented in the PO creation logic
        }

        return reservation;
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Stock reserved successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/inventory/reserve/:id/release - Release a reservation
  router.post('/reserve/:id/release', requirePerm('inventory:reserve'), async (req, res, next) => {
    try {
      const { tenantId, userId } = req.user;
      const { id } = req.params;
      const { quantityToRelease, reason } = req.body;

      const reservation = await prisma.inventoryReservation.findFirst({
        where: { id, tenantId },
        include: { inventoryItem: true, job: true },
      });

      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: { message: 'Reservation not found' },
        });
      }

      if (reservation.status === 'RELEASED' || reservation.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Reservation is already released or cancelled' },
        });
      }

      const releaseQty = quantityToRelease ? parseFloat(quantityToRelease) : parseFloat(reservation.quantityReserved);

      if (releaseQty > parseFloat(reservation.quantityReserved) - parseFloat(reservation.quantityReleased)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Release quantity exceeds reserved quantity' },
        });
      }

      // Release reservation and update inventory
      const result = await prisma.$transaction(async (tx) => {
        const updatedReservation = await tx.inventoryReservation.update({
          where: { id },
          data: {
            quantityReleased: { increment: releaseQty },
            status: (parseFloat(reservation.quantityReleased) + releaseQty >= parseFloat(reservation.quantityReserved))
              ? 'RELEASED'
              : 'RESERVED',
            releasedDate: new Date(),
            notes: reason ? `${reservation.notes || ''}\nReleased: ${reason}` : reservation.notes,
          },
        });

        const updatedItem = await tx.inventoryItem.update({
          where: { id: reservation.inventoryItemId },
          data: {
            quantityReserved: { decrement: releaseQty },
            quantityAvailable: { increment: releaseQty },
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId: reservation.inventoryItemId,
            movementType: 'JOB_RETURN',
            quantityChange: releaseQty,
            quantityBefore: parseFloat(reservation.inventoryItem.quantityAvailable),
            quantityAfter: parseFloat(updatedItem.quantityAvailable),
            referenceType: 'JOB',
            referenceId: reservation.jobId,
            jobId: reservation.jobId,
            reason: reason || `Released from job ${reservation.job.jobNumber}`,
            performedBy: userId,
          },
        });

        return updatedReservation;
      });

      res.json({
        success: true,
        data: result,
        message: 'Reservation released successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/inventory/reserve/:id/use - Mark reserved stock as used
  router.post('/reserve/:id/use', requirePerm('inventory:reserve'), async (req, res, next) => {
    try {
      const { tenantId, userId } = req.user;
      const { id } = req.params;
      const { quantityUsed, notes } = req.body;

      const reservation = await prisma.inventoryReservation.findFirst({
        where: { id, tenantId },
        include: { inventoryItem: true, job: true },
      });

      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: { message: 'Reservation not found' },
        });
      }

      const useQty = quantityUsed ? parseFloat(quantityUsed) : parseFloat(reservation.quantityReserved);
      const availableToUse = parseFloat(reservation.quantityReserved) - parseFloat(reservation.quantityUsed);

      if (useQty > availableToUse) {
        return res.status(400).json({
          success: false,
          error: { message: 'Usage quantity exceeds reserved quantity' },
        });
      }

      const updatedReservation = await prisma.$transaction(async (tx) => {
        const updated = await tx.inventoryReservation.update({
          where: { id },
          data: {
            quantityUsed: { increment: useQty },
            status: (parseFloat(reservation.quantityUsed) + useQty >= parseFloat(reservation.quantityReserved))
              ? 'USED'
              : 'ALLOCATED',
            notes: notes ? `${reservation.notes || ''}\nUsed: ${notes}` : reservation.notes,
          },
        });

        // Update inventory: reduce reserved quantity since it's now used
        await tx.inventoryItem.update({
          where: { id: reservation.inventoryItemId },
          data: {
            quantityReserved: { decrement: useQty },
            quantityInStock: { decrement: useQty },
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId: reservation.inventoryItemId,
            movementType: 'JOB_ALLOCATION',
            quantityChange: -useQty,
            quantityBefore: parseFloat(reservation.inventoryItem.quantityInStock),
            quantityAfter: parseFloat(reservation.inventoryItem.quantityInStock) - useQty,
            referenceType: 'JOB',
            referenceId: reservation.jobId,
            jobId: reservation.jobId,
            reason: notes || `Used in job ${reservation.job.jobNumber}`,
            performedBy: userId,
          },
        });

        return updated;
      });

      res.json({
        success: true,
        data: updatedReservation,
        message: 'Stock usage recorded successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/inventory/reserve - List reservations
  router.get('/reserve', requirePerm('inventory:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { page = 1, limit = 50, jobId, inventoryItemId, status } = req.query;

      const where = { tenantId };
      if (jobId) where.jobId = jobId;
      if (inventoryItemId) where.inventoryItemId = inventoryItemId;
      if (status) where.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [reservations, total] = await Promise.all([
        prisma.inventoryReservation.findMany({
          where,
          skip,
          take,
          include: {
            inventoryItem: {
              select: { id: true, itemNumber: true, itemName: true, sku: true },
            },
            job: {
              select: { id: true, jobNumber: true, title: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.inventoryReservation.count({ where }),
      ]);

      res.json({
        success: true,
        data: reservations,
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

  // ============================================================================
  // STOCK MOVEMENTS / HISTORY
  // ============================================================================

  // GET /api/inventory/:id/movements - Get stock movement history
  router.get('/:id/movements', requirePerm('inventory:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [movements, total] = await Promise.all([
        prisma.stockMovement.findMany({
          where: { inventoryItemId: id, tenantId },
          skip,
          take,
          include: {
            job: {
              select: { id: true, jobNumber: true, title: true },
            },
          },
          orderBy: { performedAt: 'desc' },
        }),
        prisma.stockMovement.count({ where: { inventoryItemId: id, tenantId } }),
      ]);

      res.json({
        success: true,
        data: movements,
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

  // POST /api/inventory/:id/adjust - Manual stock adjustment
  router.post('/:id/adjust', requirePerm('inventory:adjust'), async (req, res, next) => {
    try {
      const { tenantId, userId } = req.user;
      const { id } = req.params;
      const { quantityChange, reason, notes } = req.body;

      if (!quantityChange || !reason) {
        return res.status(400).json({
          success: false,
          error: { message: 'quantityChange and reason are required' },
        });
      }

      const item = await prisma.inventoryItem.findFirst({
        where: { id, tenantId, isDeleted: false },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: { message: 'Inventory item not found' },
        });
      }

      const qtyChange = parseFloat(quantityChange);
      const newInStock = parseFloat(item.quantityInStock) + qtyChange;
      const newAvailable = parseFloat(item.quantityAvailable) + qtyChange;

      if (newInStock < 0 || newAvailable < 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Adjustment would result in negative stock' },
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedItem = await tx.inventoryItem.update({
          where: { id },
          data: {
            quantityInStock: newInStock,
            quantityAvailable: newAvailable,
            lastRestockedAt: qtyChange > 0 ? new Date() : item.lastRestockedAt,
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId: id,
            movementType: 'ADJUSTMENT',
            quantityChange: qtyChange,
            quantityBefore: parseFloat(item.quantityInStock),
            quantityAfter: newInStock,
            referenceType: 'ADJUSTMENT',
            reason,
            notes,
            performedBy: userId,
          },
        });

        return updatedItem;
      });

      res.json({
        success: true,
        data: result,
        message: 'Stock adjusted successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
