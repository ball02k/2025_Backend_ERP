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

const PROJECT_INFO_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  name: true,
  description: true,
  status: true,
  type: true,
  statusId: true,
  typeId: true,
  country: true,
  currency: true,
  unitSystem: true,
  taxScheme: true,
  contractForm: true,
  clientId: true,
  clientContactId: true,
  sitePostcode: true,
  siteLat: true,
  siteLng: true,
  contractType: true,
  paymentTermsDays: true,
  retentionPct: true,
  projectManagerId: true,
  projectManagerUserId: true,
  quantitySurveyorUserId: true,
  startPlanned: true,
  endPlanned: true,
  startActual: true,
  endActual: true,
  labels: true,
  budget: true,
  actualSpend: true,
  startDate: true,
  endDate: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true } },
  clientContact: { select: { id: true, firstName: true, lastName: true, email: true } },
  projectManager: { select: { id: true, name: true, email: true } },
  quantitySurveyor: { select: { id: true, name: true, email: true } },
};

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
      select: PROJECT_INFO_SELECT,
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
    out.projectRole = out.projectRole || 'PRINCIPAL_CONTRACTOR';

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
      select: PROJECT_INFO_SELECT,
    });

    const out = safeJson(updated);

    // Back-compat: expose projectCode alongside code
    if (out.code && !out.projectCode) {
      out.projectCode = out.code;
    }
    out.projectRole = out.projectRole || 'PRINCIPAL_CONTRACTOR';

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

// GET /api/projects/:projectId/role-summary → project role context and capabilities
// Task 2.1: Returns role-based context for workflow and UI
router.get('/projects/:projectId/role-summary', requireAuth, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res
        .status(400)
        .json({ error: { code: 'BAD_REQUEST', message: 'Invalid projectId' } });
    }

    const tenantId = req.user?.tenantId || req.tenantId || 'demo';

    // Fetch project with upstream party and contact details
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
      },
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const role = project.projectRole || 'PRINCIPAL_CONTRACTOR';

    // Build upstream party object
    let upstreamParty = null;
    if (project.upstreamParty && project.upstreamPartyType) {
      const contact = project.upstreamContact;
      upstreamParty = {
        type: project.upstreamPartyType,
        id: project.upstreamParty.id,
        name: project.upstreamParty.name,
        contactName: contact
          ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email
          : undefined,
        contactEmail: contact?.email,
        contractRef: project.upstreamContractRef || undefined,
        poNumber: project.upstreamPoNumber || undefined,
      };
    }

    // Calculate capabilities based on role
    const capabilities = {
      canRaiseApplications: role === 'SUBCONTRACTOR' || role === 'DIRECT_TO_CLIENT',
      canReceiveApplications: role === 'PRINCIPAL_CONTRACTOR' || role === 'DIRECT_TO_CLIENT',
      canCreateContracts: role === 'PRINCIPAL_CONTRACTOR' || role === 'DIRECT_TO_CLIENT',
      canIssuePOs: role === 'PRINCIPAL_CONTRACTOR' || role === 'DIRECT_TO_CLIENT',
      canReceiveCertificates: role === 'SUBCONTRACTOR',
    };

    // Determine terminology/labels
    const terminology = {
      upstreamLabel:
        role === 'SUBCONTRACTOR' ? 'Main Contractor' :
        role === 'DIRECT_TO_CLIENT' ? 'Client' :
        'Client',
      applicationDirection:
        role === 'SUBCONTRACTOR' || role === 'DIRECT_TO_CLIENT' ? 'outbound' : 'inbound',
      paymentSource:
        role === 'SUBCONTRACTOR' ? 'MC' :
        role === 'DIRECT_TO_CLIENT' ? 'Client' :
        'Subcontractors',
    };

    return res.json({
      projectRole: role,
      upstreamParty,
      capabilities,
      terminology,
    });
  } catch (e) {
    console.error('[projects/role-summary] ', e);
    return res.status(500).json({
      error: {
        code: e.code || 'INTERNAL',
        message: e.message || 'Failed to load project role summary',
      },
    });
  }
});

module.exports = router;
