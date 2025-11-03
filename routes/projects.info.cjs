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
        projectCode: true,
        name: true,
        status: true,
        ribaStage: true,
        sector: true,
        labels: true,
        startDate: true,
        endDate: true,
        budget: true,
        actualSpend: true,
        clientId: true,
        clientContactId: true,
        projectManagerUserId: true,
        quantitySurveyorUserId: true,
        contractType: true,
        contractForm: true,
        paymentTermsDays: true,
        retentionPct: true,
        currency: true,
        sitePostcode: true,
        siteLat: true,
        siteLng: true,
        country: true,
        updatedAt: true,
        client: { select: { id: true, name: true } },
        clientContact: { select: { id: true, name: true, email: true } },
        projectManager: { select: { id: true, name: true } },
        quantitySurveyor: { select: { id: true, name: true } },
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

    // Build links array for frontend
    const links = [];
    if (project.client) {
      links.push({
        type: 'client',
        id: project.client.id,
        name: project.client.name,
        href: `/clients/${project.client.id}`,
      });
    }
    if (project.clientContact) {
      links.push({
        type: 'contact',
        id: project.clientContact.id,
        name: project.clientContact.name,
        href: `/contacts/${project.clientContact.id}`,
      });
    }
    if (project.projectManager) {
      links.push({
        type: 'user',
        id: project.projectManager.id,
        name: project.projectManager.name,
        href: `/users/${project.projectManager.id}`,
      });
    }
    if (project.quantitySurveyor) {
      links.push({
        type: 'user',
        id: project.quantitySurveyor.id,
        name: project.quantitySurveyor.name,
        href: `/users/${project.quantitySurveyor.id}`,
      });
    }

    const payload = {
      id: project.id,
      projectCode: project.projectCode,
      name: project.name,
      status: project.status,
      ribaStage: project.ribaStage,
      sector: project.sector,
      labels: project.labels,
      startDate: project.startDate,
      endDate: project.endDate,
      value: project.budget ?? project.actualSpend ?? 0,
      clientId: project.clientId,
      clientContactId: project.clientContactId,
      projectManagerUserId: project.projectManagerUserId,
      quantitySurveyorUserId: project.quantitySurveyorUserId,
      contractType: project.contractType,
      contractForm: project.contractForm,
      paymentTermsDays: project.paymentTermsDays,
      retentionPct: project.retentionPct,
      currency: project.currency,
      sitePostcode: project.sitePostcode,
      siteLat: project.siteLat,
      siteLng: project.siteLng,
      country: project.country,
      client: project.client,
      clientContact: project.clientContact,
      projectManager: project.projectManager,
      quantitySurveyor: project.quantitySurveyor,
      counts: project._count,
      links,
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

// PATCH /api/projects/:projectId/info → update project info fields
router.patch('/projects/:projectId/info', requireAuth, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res
        .status(400)
        .json({ error: { code: 'BAD_REQUEST', message: 'Invalid projectId' } });
    }

    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const body = req.body || {};

    // Verify project exists and belongs to tenant
    const existing = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true }
    });

    if (!existing) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // Build update data from allowed fields
    const data = {};

    // Basic fields
    if ('projectCode' in body) data.projectCode = body.projectCode;
    if ('name' in body) data.name = body.name;
    if ('status' in body) data.status = body.status;
    if ('ribaStage' in body) data.ribaStage = body.ribaStage;
    if ('sector' in body) data.sector = body.sector;
    if ('labels' in body) data.labels = body.labels;

    // Client & contacts
    if ('clientId' in body) data.clientId = body.clientId ? Number(body.clientId) : null;
    if ('clientContactId' in body) data.clientContactId = body.clientContactId ? Number(body.clientContactId) : null;

    // Team members
    if ('projectManagerUserId' in body) data.projectManagerUserId = body.projectManagerUserId ? Number(body.projectManagerUserId) : null;
    if ('quantitySurveyorUserId' in body) data.quantitySurveyorUserId = body.quantitySurveyorUserId ? Number(body.quantitySurveyorUserId) : null;

    // Contract & commercial
    if ('contractType' in body) data.contractType = body.contractType;
    if ('contractForm' in body) data.contractForm = body.contractForm;
    if ('paymentTermsDays' in body) data.paymentTermsDays = body.paymentTermsDays ? Number(body.paymentTermsDays) : null;
    if ('retentionPct' in body) data.retentionPct = body.retentionPct ? Number(body.retentionPct) : null;
    if ('currency' in body) data.currency = body.currency;

    // Site location
    if ('sitePostcode' in body) data.sitePostcode = body.sitePostcode;
    if ('siteLat' in body) data.siteLat = body.siteLat ? Number(body.siteLat) : null;
    if ('siteLng' in body) data.siteLng = body.siteLng ? Number(body.siteLng) : null;
    if ('country' in body) data.country = body.country;

    // Update the project
    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
      select: {
        id: true,
        projectCode: true,
        name: true,
        status: true,
        ribaStage: true,
        sector: true,
        labels: true,
        clientId: true,
        clientContactId: true,
        projectManagerUserId: true,
        quantitySurveyorUserId: true,
        contractType: true,
        contractForm: true,
        paymentTermsDays: true,
        retentionPct: true,
        currency: true,
        sitePostcode: true,
        siteLat: true,
        siteLng: true,
        country: true,
        updatedAt: true,
      },
    });

    return res.json(updated);
  } catch (e) {
    console.error('[projects/info PATCH] ', e);
    return res.status(500).json({
      error: {
        code: e.code || 'INTERNAL',
        message: e.message || 'Failed to update project info',
      },
    });
  }
});

module.exports = router;
