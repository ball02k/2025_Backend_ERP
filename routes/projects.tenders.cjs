const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../lib/auth');
const { getTenantId } = require('../lib/tenant');

router.use(requireAuth);

// GET /api/projects/:id/tenders - List tenders for a project
router.get('/:id/tenders', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.id);

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all packages for this project
    const packages = await prisma.package.findMany({
      where: { projectId, tenantId },
      select: { id: true }
    });

    const packageIds = packages.map(p => p.id);

    // Build where clause for requests (tenders)
    const where = {
      tenantId,
      packageId: packageIds.length > 0 ? { in: packageIds } : undefined
    };

    // Add query filters
    if (req.query.search) {
      where.title = { contains: req.query.search, mode: 'insensitive' };
    }
    if (req.query.status) {
      where.status = req.query.status;
    }
    if (req.query.packageId) {
      where.packageId = Number(req.query.packageId);
    }
    if (req.query.after) {
      where.deadline = { ...where.deadline, gte: new Date(req.query.after) };
    }
    if (req.query.before) {
      where.deadline = { ...where.deadline, lte: new Date(req.query.before) };
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const skip = (page - 1) * pageSize;

    // Fetch tenders with package info
    const [items, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include: {
          package: {
            select: {
              id: true,
              name: true,
              projectId: true
            }
          }
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: pageSize
      }),
      prisma.request.count({ where })
    ]);

    res.json({
      items,
      page,
      pageSize,
      total
    });
  } catch (err) {
    console.error('GET /projects/:id/tenders error:', err);
    next(err);
  }
});

// POST /api/projects/:id/tenders - Create a tender for a project
router.post('/:id/tenders', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.id);

    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project belongs to tenant
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { title, packageId, deadlineAt, status, type } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // If packageId is provided, verify it belongs to this project
    if (packageId) {
      const pkg = await prisma.package.findFirst({
        where: {
          id: Number(packageId),
          projectId,
          tenantId
        }
      });

      if (!pkg) {
        return res.status(400).json({ error: 'Package not found or does not belong to this project' });
      }
    }

    // Create the tender (Request)
    const tender = await prisma.request.create({
      data: {
        tenantId,
        title: title.trim(),
        packageId: packageId ? Number(packageId) : null,
        deadline: deadlineAt ? new Date(deadlineAt) : null,
        status: status || 'draft',
        type: type || 'RFP'
      },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            projectId: true
          }
        }
      }
    });

    res.status(201).json(tender);
  } catch (err) {
    console.error('POST /projects/:id/tenders error:', err);
    next(err);
  }
});

module.exports = router;
