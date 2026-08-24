/**
 * Import Mapping API Routes (Task 2.3)
 *
 * Manage saved column mappings for budget imports
 *
 * Routes:
 * - GET    /api/import-mappings - List all mappings for tenant
 * - GET    /api/import-mappings/:id - Get specific mapping
 * - POST   /api/import-mappings - Create new mapping
 * - PUT    /api/import-mappings/:id - Update mapping
 * - DELETE /api/import-mappings/:id - Delete mapping
 * - GET    /api/import-mappings/by-contractor/:mainContractorId - Get mappings for specific MC
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma } = require('../lib/prisma.js');

router.use(requireAuth);

/**
 * GET /api/import-mappings
 * List all import mappings for tenant
 */
router.get('/import-mappings', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { mainContractorId } = req.query;

    const where = { tenantId };
    if (mainContractorId) {
      where.mainContractorId = Number(mainContractorId);
    }

    const mappings = await prisma.importMapping.findMany({
      where,
      include: {
        mainContractor: {
          select: { id: true, name: true }
        }
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    res.json({ mappings });
  } catch (error) {
    console.error('[Import Mappings] Error listing:', error);
    res.status(500).json({ error: 'Failed to list import mappings', message: error.message });
  }
});

/**
 * GET /api/import-mappings/by-contractor/:mainContractorId
 * Get mappings for a specific main contractor
 */
router.get('/import-mappings/by-contractor/:mainContractorId', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const mainContractorId = Number(req.params.mainContractorId);

    if (!Number.isFinite(mainContractorId)) {
      return res.status(400).json({ error: 'Invalid mainContractorId' });
    }

    const mappings = await prisma.importMapping.findMany({
      where: {
        tenantId,
        mainContractorId
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    res.json({ mappings });
  } catch (error) {
    console.error('[Import Mappings] Error fetching by contractor:', error);
    res.status(500).json({ error: 'Failed to fetch mappings', message: error.message });
  }
});

/**
 * GET /api/import-mappings/:id
 * Get a specific import mapping
 */
router.get('/import-mappings/:id', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const id = req.params.id;

    const mapping = await prisma.importMapping.findFirst({
      where: { id, tenantId },
      include: {
        mainContractor: {
          select: { id: true, name: true }
        }
      }
    });

    if (!mapping) {
      return res.status(404).json({ error: 'Import mapping not found' });
    }

    res.json(mapping);
  } catch (error) {
    console.error('[Import Mappings] Error fetching:', error);
    res.status(500).json({ error: 'Failed to fetch import mapping', message: error.message });
  }
});

/**
 * POST /api/import-mappings
 * Create a new import mapping
 */
router.post('/import-mappings', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { name, mainContractorId, mappings, isDefault = false } = req.body;

    if (!name || !mappings) {
      return res.status(400).json({ error: 'name and mappings are required' });
    }

    // If setting as default, unset other defaults for this MC
    if (isDefault && mainContractorId) {
      await prisma.importMapping.updateMany({
        where: {
          tenantId,
          mainContractorId: Number(mainContractorId),
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    const mapping = await prisma.importMapping.create({
      data: {
        tenantId,
        name,
        mainContractorId: mainContractorId ? Number(mainContractorId) : null,
        mappings,
        isDefault
      },
      include: {
        mainContractor: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`[Import Mappings] Created: ${mapping.name}`);
    res.status(201).json(mapping);
  } catch (error) {
    console.error('[Import Mappings] Error creating:', error);
    res.status(500).json({ error: 'Failed to create import mapping', message: error.message });
  }
});

/**
 * PUT /api/import-mappings/:id
 * Update an import mapping
 */
router.put('/import-mappings/:id', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const id = req.params.id;
    const { name, mainContractorId, mappings, isDefault } = req.body;

    // Verify mapping exists and belongs to tenant
    const existing = await prisma.importMapping.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Import mapping not found' });
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (mainContractorId !== undefined) {
      updateData.mainContractorId = mainContractorId ? Number(mainContractorId) : null;
    }
    if (mappings !== undefined) updateData.mappings = mappings;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    // If setting as default, unset other defaults for this MC
    if (isDefault && (mainContractorId !== undefined ? mainContractorId : existing.mainContractorId)) {
      const mcId = mainContractorId !== undefined ? Number(mainContractorId) : existing.mainContractorId;
      await prisma.importMapping.updateMany({
        where: {
          tenantId,
          mainContractorId: mcId,
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.importMapping.update({
      where: { id },
      data: updateData,
      include: {
        mainContractor: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`[Import Mappings] Updated: ${updated.name}`);
    res.json(updated);
  } catch (error) {
    console.error('[Import Mappings] Error updating:', error);
    res.status(500).json({ error: 'Failed to update import mapping', message: error.message });
  }
});

/**
 * DELETE /api/import-mappings/:id
 * Delete an import mapping
 */
router.delete('/import-mappings/:id', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const id = req.params.id;

    // Verify mapping exists and belongs to tenant
    const existing = await prisma.importMapping.findFirst({
      where: { id, tenantId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Import mapping not found' });
    }

    await prisma.importMapping.delete({
      where: { id }
    });

    console.log(`[Import Mappings] Deleted: ${existing.name}`);
    res.json({ message: 'Import mapping deleted successfully' });
  } catch (error) {
    console.error('[Import Mappings] Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete import mapping', message: error.message });
  }
});

module.exports = router;
