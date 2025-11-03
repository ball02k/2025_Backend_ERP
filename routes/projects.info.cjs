const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.js');
const requireAuth = require('../middleware/requireAuth.cjs');
const { buildLinks } = require('../lib/buildLinks.cjs');

function safeJson(x) {
  return JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

// GET /api/projects/:projectId/info → project info snapshot
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
      include: {
        client: { select: { id: true, name: true } },
        clientContact: { select: { id: true, firstName: true, lastName: true, email: true } },
        projectManager: { select: { id: true, name: true, email: true } },
        quantitySurveyor: { select: { id: true, name: true, email: true } },
      },
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const out = safeJson(project);

    // Back-compat: expose projectCode alongside code
    if (out.code && !out.projectCode) {
      out.projectCode = out.code;
    }

    // Derive name for contact from firstName/lastName
    if (out.clientContact) {
      const { firstName, lastName, email } = out.clientContact;
      out.clientContact.name = firstName && lastName
        ? `${firstName} ${lastName}`.trim()
        : firstName || lastName || email || 'Unknown';
    }

    // Build links array for frontend
    out.links = buildLinks('projectInfo', {
      ...out,
      client: out.client,
      clientContact: out.clientContact,
      projectManager: out.projectManager,
      quantitySurveyor: out.quantitySurveyor,
    });

    return res.json(out);
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

    // Map allowed fields to actual Prisma columns
    const data = {};

    // Basic fields - map projectCode to code
    if ('projectCode' in body) data.code = body.projectCode;
    if ('name' in body) data.name = body.name;
    if ('status' in body) data.status = body.status;
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

    // Note: ribaStage and sector are NOT in the Prisma schema, so we ignore them

    // Update the project
    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
    });

    const out = safeJson(updated);

    // Back-compat: expose projectCode alongside code
    if (out.code && !out.projectCode) {
      out.projectCode = out.code;
    }

    return res.json(out);
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
