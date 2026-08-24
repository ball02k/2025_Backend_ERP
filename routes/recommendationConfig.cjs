// routes/recommendationConfig.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  // =========================================================================
  // GET /api/recommendation-config - Get current tenant weights
  // =========================================================================
  router.get('/', requirePerm('settings:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;

      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { recommendationWeights: true }
      });

      // Default weights if not set
      const defaultWeights = {
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

      res.json({
        success: true,
        weights: settings?.recommendationWeights || defaultWeights
      });
    } catch (error) {
      console.error('Error fetching recommendation config:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch configuration' });
    }
  });

  // =========================================================================
  // PUT /api/recommendation-config - Update tenant-level weights
  // =========================================================================
  router.put('/', requirePerm('settings:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { weights } = req.body;

      if (!weights) {
        return res.status(400).json({ success: false, error: 'Weights object required' });
      }

      // Update or create tenant settings
      const updated = await prisma.tenantSettings.upsert({
        where: { tenantId },
        update: {
          recommendationWeights: weights
        },
        create: {
          tenantId,
          recommendationWeights: weights
        }
      });

      res.json({
        success: true,
        message: 'Recommendation weights updated successfully',
        weights: updated.recommendationWeights
      });
    } catch (error) {
      console.error('Error updating recommendation config:', error);
      res.status(500).json({ success: false, error: 'Failed to update configuration' });
    }
  });

  // =========================================================================
  // GET /api/recommendation-config/overrides - List all overrides
  // =========================================================================
  router.get('/overrides', requirePerm('settings:view'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { overrideType } = req.query;

      const where = {
        tenantId,
        isActive: true
      };

      if (overrideType) {
        where.overrideType = overrideType;
      }

      const overrides = await prisma.recommendationWeightOverride.findMany({
        where,
        orderBy: [
          { overrideType: 'asc' },
          { overrideKey: 'asc' }
        ]
      });

      res.json({
        success: true,
        overrides
      });
    } catch (error) {
      console.error('Error fetching overrides:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch overrides' });
    }
  });

  // =========================================================================
  // POST /api/recommendation-config/overrides - Create override
  // =========================================================================
  router.post('/overrides', requirePerm('settings:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { overrideType, overrideKey, weights, description } = req.body;

      if (!overrideType || !overrideKey || !weights) {
        return res.status(400).json({
          success: false,
          error: 'overrideType, overrideKey, and weights are required'
        });
      }

      // Validate overrideType
      const validTypes = ['job_type', 'trade', 'priority', 'client'];
      if (!validTypes.includes(overrideType)) {
        return res.status(400).json({
          success: false,
          error: `overrideType must be one of: ${validTypes.join(', ')}`
        });
      }

      const override = await prisma.recommendationWeightOverride.create({
        data: {
          tenantId,
          overrideType,
          overrideKey,
          weights,
          description,
          createdBy: String(userId)
        }
      });

      res.status(201).json({
        success: true,
        message: 'Override created successfully',
        override
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          error: 'Override for this type and key already exists'
        });
      }
      console.error('Error creating override:', error);
      res.status(500).json({ success: false, error: 'Failed to create override' });
    }
  });

  // =========================================================================
  // PUT /api/recommendation-config/overrides/:id - Update override
  // =========================================================================
  router.put('/overrides/:id', requirePerm('settings:update'), async (req, res) => {
    try {
      const { tenantId, id: userId } = req.user;
      const { id } = req.params;
      const { weights, description, isActive } = req.body;

      const existing = await prisma.recommendationWeightOverride.findFirst({
        where: { id, tenantId }
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Override not found' });
      }

      const updated = await prisma.recommendationWeightOverride.update({
        where: { id },
        data: {
          ...(weights && { weights }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive }),
          updatedBy: String(userId)
        }
      });

      res.json({
        success: true,
        message: 'Override updated successfully',
        override: updated
      });
    } catch (error) {
      console.error('Error updating override:', error);
      res.status(500).json({ success: false, error: 'Failed to update override' });
    }
  });

  // =========================================================================
  // DELETE /api/recommendation-config/overrides/:id - Delete override
  // =========================================================================
  router.delete('/overrides/:id', requirePerm('settings:update'), async (req, res) => {
    try {
      const { tenantId } = req.user;
      const { id } = req.params;

      const existing = await prisma.recommendationWeightOverride.findFirst({
        where: { id, tenantId }
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Override not found' });
      }

      await prisma.recommendationWeightOverride.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Override deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting override:', error);
      res.status(500).json({ success: false, error: 'Failed to delete override' });
    }
  });

  return router;
};
