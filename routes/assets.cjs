// routes/assets.cjs
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/assets:
 *   get:
 *     summary: List assets with optional filters
 *     tags: [Assets]
 *     parameters:
 *       - in: query
 *         name: siteId
 *         schema:
 *           type: string
 *         description: Filter by site ID
 *       - in: query
 *         name: assetType
 *         schema:
 *           type: string
 *         description: Filter by asset type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, description, or asset number
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of assets
 */
router.get('/', async (req, res, next) => {
  try {
    const { siteId, assetType, status, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {
      tenantId: req.user.tenantId,
      isDeleted: false,
    };

    if (siteId) {
      where.siteId = siteId;
    }

    if (assetType) {
      where.assetType = assetType;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { assetNumber: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute queries
    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { jobAssets: true },
          },
        },
      }),
      prisma.asset.count({ where }),
    ]);

    res.json({
      success: true,
      data: assets,
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

/**
 * @swagger
 * /api/assets/{id}:
 *   get:
 *     summary: Get asset by ID
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Asset details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
      include: {
        jobAssets: {
          include: {
            job: {
              select: {
                id: true,
                jobNumber: true,
                title: true,
                status: true,
                scheduledStartDate: true,
              },
            },
          },
        },
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { message: 'Asset not found' },
      });
    }

    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/assets:
 *   post:
 *     summary: Create a new asset
 *     tags: [Assets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - assetType
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               assetType:
 *                 type: string
 *               category:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *               model:
 *                 type: string
 *               serialNumber:
 *                 type: string
 *               siteId:
 *                 type: string
 *               siteName:
 *                 type: string
 *               siteAddress:
 *                 type: string
 *               location:
 *                 type: string
 *               status:
 *                 type: string
 *               criticalityLevel:
 *                 type: string
 *     responses:
 *       201:
 *         description: Asset created
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      description,
      assetType,
      category,
      manufacturer,
      model,
      serialNumber,
      siteId,
      siteName,
      siteAddress,
      location,
      status,
      criticalityLevel,
      specifications,
    } = req.body;

    // Generate asset number
    const lastAsset = await prisma.asset.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { assetNumber: true },
    });

    let assetNumber;
    if (lastAsset && lastAsset.assetNumber) {
      const lastNumber = parseInt(lastAsset.assetNumber.split('-')[2]);
      assetNumber = `AST-${new Date().getFullYear()}-${String(lastNumber + 1).padStart(4, '0')}`;
    } else {
      assetNumber = `AST-${new Date().getFullYear()}-0001`;
    }

    const asset = await prisma.asset.create({
      data: {
        tenantId: req.user.tenantId,
        assetNumber,
        name,
        description,
        assetType,
        category,
        manufacturer,
        model,
        serialNumber,
        siteId,
        siteName,
        siteAddress,
        location,
        status: status || 'OPERATIONAL',
        criticalityLevel: criticalityLevel || 'MEDIUM',
        specifications,
        createdBy: req.user.id,
      },
    });

    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/assets/{id}:
 *   patch:
 *     summary: Update an asset
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Asset updated
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { message: 'Asset not found' },
      });
    }

    const updated = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        updatedBy: req.user.id,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/assets/{id}:
 *   delete:
 *     summary: Delete an asset (soft delete)
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Asset deleted
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { message: 'Asset not found' },
      });
    }

    await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    res.json({ success: true, data: { message: 'Asset deleted successfully' } });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/assets/{id}/update-from-job:
 *   post:
 *     summary: Update asset condition and maintenance from job completion
 *     description: Engineers can update asset condition, maintenance dates, and notes after completing a job
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jobId:
 *                 type: string
 *                 description: Job ID that triggered this update
 *               condition:
 *                 type: string
 *                 enum: [EXCELLENT, GOOD, FAIR, POOR, CRITICAL]
 *                 description: Current condition of the asset
 *               lastMaintenanceDate:
 *                 type: string
 *                 format: date
 *                 description: Date of last maintenance performed
 *               nextMaintenanceDate:
 *                 type: string
 *                 format: date
 *                 description: Date of next scheduled maintenance
 *               maintenanceNotes:
 *                 type: string
 *                 description: Notes about maintenance performed or required
 *               hoursUsed:
 *                 type: number
 *                 description: Operating hours recorded
 *     responses:
 *       200:
 *         description: Asset updated successfully with history entry created
 */
router.post('/:id/update-from-job', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      jobId,
      condition,
      lastMaintenanceDate,
      nextMaintenanceDate,
      maintenanceNotes,
      hoursUsed,
    } = req.body;

    // Verify asset exists and belongs to tenant
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Asset not found' },
      });
    }

    // Verify job exists if provided
    if (jobId) {
      const job = await prisma.job.findFirst({
        where: {
          id: jobId,
          tenantId: req.user.tenantId,
          isDeleted: false,
        },
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job not found' },
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (condition) updateData.condition = condition;
    if (lastMaintenanceDate) updateData.lastMaintenanceDate = new Date(lastMaintenanceDate);
    if (nextMaintenanceDate) updateData.nextMaintenanceDate = new Date(nextMaintenanceDate);
    if (maintenanceNotes) updateData.maintenanceNotes = maintenanceNotes;
    if (hoursUsed !== undefined) updateData.hoursUsed = hoursUsed;
    updateData.updatedBy = req.user.id;

    // Update asset and create history entry in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the asset
      const updatedAsset = await tx.asset.update({
        where: { id },
        data: updateData,
      });

      // Create history entry
      await tx.assetHistory.create({
        data: {
          tenantId: req.user.tenantId,
          assetId: id,
          jobId: jobId || null,
          action: 'MAINTENANCE_UPDATE',
          performedBy: req.user.id,
          condition: condition || asset.condition,
          maintenanceDate: lastMaintenanceDate ? new Date(lastMaintenanceDate) : null,
          hoursUsed: hoursUsed || null,
          notes: maintenanceNotes || null,
          changes: updateData,
        },
      });

      return updatedAsset;
    });

    res.json({
      success: true,
      data: result,
      message: 'Asset updated successfully and history entry created',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/assets/{id}/history:
 *   get:
 *     summary: Get asset maintenance and update history
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Asset history entries
 */
router.get('/:id/history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Verify asset exists
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Asset not found' },
      });
    }

    // Fetch history entries
    const [history, total] = await Promise.all([
      prisma.assetHistory.findMany({
        where: {
          assetId: id,
          tenantId: req.user.tenantId,
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          job: {
            select: {
              id: true,
              jobNumber: true,
              jobTitle: true,
            },
          },
        },
      }),
      prisma.assetHistory.count({
        where: {
          assetId: id,
          tenantId: req.user.tenantId,
        },
      }),
    ]);

    res.json({
      success: true,
      data: history,
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

/**
 * @swagger
 * /api/assets/{id}/maintenance:
 *   get:
 *     summary: Get upcoming maintenance events for an asset
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *     responses:
 *       200:
 *         description: Asset maintenance information
 */
router.get('/:id/maintenance', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify asset exists and get maintenance info
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        assetNumber: true,
        condition: true,
        lastMaintenanceDate: true,
        nextMaintenanceDate: true,
        maintenanceNotes: true,
        maintenanceInterval: true,
        hoursUsed: true,
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Asset not found' },
      });
    }

    // Calculate maintenance status
    const now = new Date();
    let maintenanceStatus = 'OK';
    let daysUntilMaintenance = null;

    if (asset.nextMaintenanceDate) {
      const nextDate = new Date(asset.nextMaintenanceDate);
      daysUntilMaintenance = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntilMaintenance < 0) {
        maintenanceStatus = 'OVERDUE';
      } else if (daysUntilMaintenance <= 7) {
        maintenanceStatus = 'DUE_SOON';
      } else if (daysUntilMaintenance <= 30) {
        maintenanceStatus = 'UPCOMING';
      }
    }

    // Get recent maintenance history (last 5 entries)
    const recentHistory = await prisma.assetHistory.findMany({
      where: {
        assetId: id,
        tenantId: req.user.tenantId,
        action: 'MAINTENANCE_UPDATE',
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          select: {
            id: true,
            jobNumber: true,
            jobTitle: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        asset,
        maintenanceStatus,
        daysUntilMaintenance,
        recentHistory,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
