const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.js');
const requireAuth = require('../middleware/requireAuth.cjs');

// GET /api/projects/:projectId/info → minimal project “info” snapshot
router.get('/projects/:projectId/info', requireAuth, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res
        .status(400)
        .json({ error: { code: 'BAD_REQUEST', message: 'Invalid projectId' } });
    }

    const tenantId = req.user?.tenantId || req.tenantId || 'demo';

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        budget: true,
        actualSpend: true,
        updatedAt: true,
        client: { select: { id: true, name: true } },
        _count: {
          select: {
            packages: true,
            tasks: true,
            contracts: true,
            invoices: true,
          },
        },
      },
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const payload = {
      id: project.id,
      name: project.name,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      value: project.budget ?? project.actualSpend ?? 0,
      client: project.client
        ? { id: project.client.id, name: project.client.name }
        : null,
      counts: project._count,
      updatedAt: project.updatedAt,
    };

    return res.json(payload);
  } catch (e) {
    console.error('[projects/info] ', e);
    return res.status(500).json({
      error: {
        code: e.code || 'INTERNAL',
        message: e.message || 'Failed to load project info',
      },
    });
  }
});

module.exports = router;
