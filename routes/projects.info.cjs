const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.js');
const { requireProjectMember } = require('../middleware/membership.cjs');

// GET /api/projects/:projectId/info → minimal project “info” snapshot
router.get('/:projectId/info', requireProjectMember, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res
        .status(400)
        .json({ error: { code: 'BAD_REQUEST', message: 'Invalid projectId' } });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
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

    return res.json({ data: payload });
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
