const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth');
const { getTenantId } = require('../lib/tenant');

router.use(requireAuth);
const t = (req) => getTenantId(req);

// POST /tenders-create/:projectId/from-package
// Create a new RFX/tender seeded from a package
router.post('/:projectId/from-package', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const { packageId } = req.body;

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!packageId || !Number.isFinite(Number(packageId))) {
      return res.status(400).json({ error: 'packageId required' });
    }

    const tenantId = t(req);

    // Verify project exists and belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, name: true, code: true },
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify package exists and belongs to project
    const pkg = await prisma.package.findFirst({
      where: {
        id: Number(packageId),
        projectId,
        project: { tenantId },
      },
      select: {
        id: true,
        name: true,
        scopeSummary: true,
        trade: true,
        budgetEstimate: true,
      },
    });
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found or does not belong to this project' });
    }

    // Create the tender/Request (using existing Request table)
    const title = `${pkg.name}`;
    const addenda = pkg.scopeSummary || `Tender for package: ${pkg.name}`;

    const request = await prisma.request.create({
      data: {
        tenantId,
        packageId: pkg.id,
        title,
        addenda,
        type: 'RFP',
        status: 'draft',
        deadline: null,
        stage: 1,
        totalStages: 1,
      },
    });

    res.status(201).json({ id: request.id, title: request.title, status: request.status });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
