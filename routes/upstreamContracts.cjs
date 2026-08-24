/**
 * Upstream Contract API Routes
 * Task 2.2: Contract terms when acting as subcontractor
 *
 * Routes:
 * - GET    /api/projects/:projectId/upstream-contract - Get upstream contract for project
 * - POST   /api/projects/:projectId/upstream-contract - Create upstream contract
 * - PUT    /api/projects/:projectId/upstream-contract - Update upstream contract
 * - DELETE /api/projects/:projectId/upstream-contract - Delete upstream contract
 * - GET    /api/upstream-contracts - List all upstream contracts
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma } = require('../lib/prisma.js');
const { addMonths } = require('date-fns/addMonths');

router.use(requireAuth);

/**
 * GET /api/projects/:projectId/upstream-contract
 * Get upstream contract for a specific project
 */
router.get('/projects/:projectId/upstream-contract', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Verify project exists and belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, projectRole: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get upstream contract
    const upstreamContract = await prisma.upstreamContract.findUnique({
      where: { projectId },
      include: {
        mainContractor: {
          select: { id: true, name: true, clientType: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        updatedBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!upstreamContract) {
      return res.status(404).json({ error: 'Upstream contract not found for this project' });
    }

    // Calculate auto fields
    const calculated = {
      ...upstreamContract,
      // Auto-calculate retention cap if enabled
      calculatedRetentionCap: upstreamContract.retentionCapAuto
        ? Number(upstreamContract.contractValue) * (Number(upstreamContract.retentionPercentage) / 100)
        : Number(upstreamContract.retentionCap || 0),
      // Calculate DLP end date if PC date and dlpMonths set
      calculatedDlpEndDate: upstreamContract.practicalCompletionDate && upstreamContract.dlpMonths
        ? addMonths(new Date(upstreamContract.practicalCompletionDate), upstreamContract.dlpMonths)
        : upstreamContract.dlpEndDate
    };

    res.json(calculated);
  } catch (error) {
    console.error('[Upstream Contract] Error fetching:', error);
    res.status(500).json({ error: 'Failed to fetch upstream contract', message: error.message });
  }
});

/**
 * POST /api/projects/:projectId/upstream-contract
 * Create upstream contract for a project
 */
router.post('/projects/:projectId/upstream-contract', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Verify project exists, belongs to tenant, and has appropriate role
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, projectRole: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only allow for SUBCONTRACTOR or DIRECT_TO_CLIENT projects
    if (project.projectRole !== 'SUBCONTRACTOR' && project.projectRole !== 'DIRECT_TO_CLIENT') {
      return res.status(400).json({
        error: 'Upstream contracts can only be created for SUBCONTRACTOR or DIRECT_TO_CLIENT projects'
      });
    }

    // Check if upstream contract already exists
    const existing = await prisma.upstreamContract.findUnique({
      where: { projectId }
    });

    if (existing) {
      return res.status(400).json({
        error: 'Upstream contract already exists for this project',
        existingId: existing.id
      });
    }

    // Validate required fields
    if (!req.body.contractValue) {
      return res.status(400).json({ error: 'contractValue is required' });
    }

    // Calculate retention cap if auto
    let retentionCap = req.body.retentionCap;
    if (req.body.retentionCapAuto !== false && req.body.retentionPercentage) {
      retentionCap = Number(req.body.contractValue) * (Number(req.body.retentionPercentage) / 100);
    }

    // Calculate DLP end date if possible
    let dlpEndDate = req.body.dlpEndDate;
    if (req.body.practicalCompletionDate && req.body.dlpMonths) {
      dlpEndDate = addMonths(new Date(req.body.practicalCompletionDate), Number(req.body.dlpMonths));
    }

    const upstreamContract = await prisma.upstreamContract.create({
      data: {
        tenantId,
        projectId,
        mainContractorId: req.body.mainContractorId ? Number(req.body.mainContractorId) : null,
        contractValue: req.body.contractValue,
        contractType: req.body.contractType || null,
        contractRef: req.body.contractRef || null,
        poNumber: req.body.poNumber || null,
        description: req.body.description || null,
        retentionPercentage: req.body.retentionPercentage || 0,
        retentionCap,
        retentionCapAuto: req.body.retentionCapAuto !== false,
        retentionReleasePC: req.body.retentionReleasePC || null,
        retentionReleaseDLP: req.body.retentionReleaseDLP || null,
        applicationDueDay: req.body.applicationDueDay || null,
        applicationDueDays: req.body.applicationDueDays || null,
        paymentTermsDays: req.body.paymentTermsDays || 30,
        payLessNoticeDays: req.body.payLessNoticeDays || null,
        paymentNoticeDays: req.body.paymentNoticeDays || null,
        mainContractorDiscount: req.body.mainContractorDiscount || 0,
        mcdDescription: req.body.mcdDescription || null,
        mcDeductsCIS: req.body.mcDeductsCIS || false,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        plannedCompletionDate: req.body.plannedCompletionDate ? new Date(req.body.plannedCompletionDate) : null,
        actualCompletionDate: req.body.actualCompletionDate ? new Date(req.body.actualCompletionDate) : null,
        practicalCompletionDate: req.body.practicalCompletionDate ? new Date(req.body.practicalCompletionDate) : null,
        dlpMonths: req.body.dlpMonths || null,
        dlpEndDate,
        status: req.body.status || 'ACTIVE',
        contractDocumentUrl: req.body.contractDocumentUrl || null,
        createdById: userId || null,
        updatedById: userId || null
      },
      include: {
        mainContractor: {
          select: { id: true, name: true, clientType: true }
        }
      }
    });

    console.log(`[Upstream Contract] Created for project ${projectId}`);
    res.status(201).json(upstreamContract);
  } catch (error) {
    console.error('[Upstream Contract] Error creating:', error);
    res.status(500).json({ error: 'Failed to create upstream contract', message: error.message });
  }
});

/**
 * PUT /api/projects/:projectId/upstream-contract
 * Update upstream contract for a project
 */
router.put('/projects/:projectId/upstream-contract', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Verify project exists and belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if upstream contract exists
    const existing = await prisma.upstreamContract.findUnique({
      where: { projectId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Upstream contract not found for this project' });
    }

    // Build update data
    const updateData = {};

    if (req.body.mainContractorId !== undefined) {
      updateData.mainContractorId = req.body.mainContractorId ? Number(req.body.mainContractorId) : null;
    }
    if (req.body.contractValue !== undefined) updateData.contractValue = req.body.contractValue;
    if (req.body.contractType !== undefined) updateData.contractType = req.body.contractType;
    if (req.body.contractRef !== undefined) updateData.contractRef = req.body.contractRef;
    if (req.body.poNumber !== undefined) updateData.poNumber = req.body.poNumber;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.retentionPercentage !== undefined) updateData.retentionPercentage = req.body.retentionPercentage;
    if (req.body.retentionCapAuto !== undefined) updateData.retentionCapAuto = req.body.retentionCapAuto;
    if (req.body.retentionReleasePC !== undefined) updateData.retentionReleasePC = req.body.retentionReleasePC;
    if (req.body.retentionReleaseDLP !== undefined) updateData.retentionReleaseDLP = req.body.retentionReleaseDLP;
    if (req.body.applicationDueDay !== undefined) updateData.applicationDueDay = req.body.applicationDueDay;
    if (req.body.applicationDueDays !== undefined) updateData.applicationDueDays = req.body.applicationDueDays;
    if (req.body.paymentTermsDays !== undefined) updateData.paymentTermsDays = req.body.paymentTermsDays;
    if (req.body.payLessNoticeDays !== undefined) updateData.payLessNoticeDays = req.body.payLessNoticeDays;
    if (req.body.paymentNoticeDays !== undefined) updateData.paymentNoticeDays = req.body.paymentNoticeDays;
    if (req.body.mainContractorDiscount !== undefined) updateData.mainContractorDiscount = req.body.mainContractorDiscount;
    if (req.body.mcdDescription !== undefined) updateData.mcdDescription = req.body.mcdDescription;
    if (req.body.mcDeductsCIS !== undefined) updateData.mcDeductsCIS = req.body.mcDeductsCIS;
    if (req.body.startDate !== undefined) updateData.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.plannedCompletionDate !== undefined) updateData.plannedCompletionDate = req.body.plannedCompletionDate ? new Date(req.body.plannedCompletionDate) : null;
    if (req.body.actualCompletionDate !== undefined) updateData.actualCompletionDate = req.body.actualCompletionDate ? new Date(req.body.actualCompletionDate) : null;
    if (req.body.practicalCompletionDate !== undefined) updateData.practicalCompletionDate = req.body.practicalCompletionDate ? new Date(req.body.practicalCompletionDate) : null;
    if (req.body.dlpMonths !== undefined) updateData.dlpMonths = req.body.dlpMonths;
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (req.body.contractDocumentUrl !== undefined) updateData.contractDocumentUrl = req.body.contractDocumentUrl;

    // Recalculate retention cap if auto
    if (updateData.retentionCapAuto !== false && (updateData.contractValue || updateData.retentionPercentage)) {
      const contractValue = updateData.contractValue || existing.contractValue;
      const retentionPercentage = updateData.retentionPercentage || existing.retentionPercentage;
      updateData.retentionCap = Number(contractValue) * (Number(retentionPercentage) / 100);
    } else if (req.body.retentionCap !== undefined) {
      updateData.retentionCap = req.body.retentionCap;
    }

    // Recalculate DLP end date if PC date or dlpMonths changed
    if (updateData.practicalCompletionDate || updateData.dlpMonths) {
      const pcDate = updateData.practicalCompletionDate || existing.practicalCompletionDate;
      const dlpMonths = updateData.dlpMonths !== undefined ? updateData.dlpMonths : existing.dlpMonths;
      if (pcDate && dlpMonths) {
        updateData.dlpEndDate = addMonths(new Date(pcDate), Number(dlpMonths));
      }
    } else if (req.body.dlpEndDate !== undefined) {
      updateData.dlpEndDate = req.body.dlpEndDate ? new Date(req.body.dlpEndDate) : null;
    }

    updateData.updatedById = userId || null;

    const updated = await prisma.upstreamContract.update({
      where: { projectId },
      data: updateData,
      include: {
        mainContractor: {
          select: { id: true, name: true, clientType: true }
        }
      }
    });

    console.log(`[Upstream Contract] Updated for project ${projectId}`);
    res.json(updated);
  } catch (error) {
    console.error('[Upstream Contract] Error updating:', error);
    res.status(500).json({ error: 'Failed to update upstream contract', message: error.message });
  }
});

/**
 * DELETE /api/projects/:projectId/upstream-contract
 * Delete upstream contract for a project
 */
router.delete('/projects/:projectId/upstream-contract', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const tenantId = req.user?.tenantId;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Verify project exists and belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if upstream contract exists
    const existing = await prisma.upstreamContract.findUnique({
      where: { projectId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Upstream contract not found for this project' });
    }

    // Delete the contract
    await prisma.upstreamContract.delete({
      where: { projectId }
    });

    console.log(`[Upstream Contract] Deleted for project ${projectId}`);
    res.json({ message: 'Upstream contract deleted successfully' });
  } catch (error) {
    console.error('[Upstream Contract] Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete upstream contract', message: error.message });
  }
});

/**
 * GET /api/upstream-contracts
 * List all upstream contracts for tenant (for dashboard/reporting)
 */
router.get('/upstream-contracts', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { status, mainContractorId, limit = 50, offset = 0 } = req.query;

    const where = { tenantId };
    if (status) where.status = status;
    if (mainContractorId) where.mainContractorId = Number(mainContractorId);

    const [total, contracts] = await Promise.all([
      prisma.upstreamContract.count({ where }),
      prisma.upstreamContract.findMany({
        where,
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, code: true, name: true, status: true }
          },
          mainContractor: {
            select: { id: true, name: true, clientType: true }
          }
        }
      })
    ]);

    res.json({ total, contracts });
  } catch (error) {
    console.error('[Upstream Contract] Error listing:', error);
    res.status(500).json({ error: 'Failed to list upstream contracts', message: error.message });
  }
});

module.exports = router;
