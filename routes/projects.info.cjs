const router = require('express').Router({ mergeParams: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildLinks } = require('../lib/buildLinks.cjs');

function safeJson(x) {
  return JSON.parse(
    JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

// GET /projects/:projectId/info (enriched)
router.get('/projects/:projectId/info', async (req, res, next) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    const projectId = Number(req.params.projectId);
    const p = await prisma.project.findFirst({
      where: { tenantId, id: projectId },
      include: {
        client: { select: { id: true, name: true } },
        clientContact: { select: { id: true, email: true } },
        projectManager: { select: { id: true, name: true, email: true } },
        quantitySurveyor: { select: { id: true, name: true, email: true } },
      },
    });
    if (!p) return res.status(404).json({ error: 'Not found' });
    const out = safeJson(p);
    // derive a simple name for contact if consumer expects it
    if (out.clientContact && !out.clientContact.name && out.clientContact.email) {
      out.clientContact.name = out.clientContact.email;
    }
    // Back-compat: expose projectCode alongside code
    if (out.code && !out.projectCode) out.projectCode = out.code;
    out.links = buildLinks('projectInfo', {
      ...out,
      client: out.client,
      clientContact: out.clientContact,
      projectManager: out.projectManager,
      quantitySurveyor: out.quantitySurveyor,
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// PATCH /projects/:projectId/info (safe partial)
router.patch('/projects/:projectId/info', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const body = req.body || {};
    // Map allowed fields to actual columns; ignore unsupported
    const data = {};
    if ('projectCode' in body) data.code = body.projectCode;
    if ('name' in body) data.name = body.name;
    if ('status' in body) data.status = body.status;
    if ('labels' in body) data.labels = body.labels;
    if ('clientId' in body) data.clientId = body.clientId;
    if ('clientContactId' in body) data.clientContactId = body.clientContactId;
    if ('projectManagerUserId' in body) data.projectManagerUserId = body.projectManagerUserId;
    if ('quantitySurveyorUserId' in body) data.quantitySurveyorUserId = body.quantitySurveyorUserId;
    if ('contractType' in body) data.contractType = body.contractType;
    if ('contractForm' in body) data.contractForm = body.contractForm;
    if ('paymentTermsDays' in body) data.paymentTermsDays = body.paymentTermsDays;
    if ('retentionPct' in body) data.retentionPct = body.retentionPct;
    if ('currency' in body) data.currency = body.currency;
    if ('sitePostcode' in body) data.sitePostcode = body.sitePostcode;
    if ('siteLat' in body) data.siteLat = body.siteLat;
    if ('siteLng' in body) data.siteLng = body.siteLng;
    if ('country' in body) data.country = body.country;
    if ('procurementMode' in body) {
      const allowed = new Set(['internal','external','hybrid']);
      const v = String(body.procurementMode || '').toLowerCase();
      if (!allowed.has(v)) return res.status(400).json({ error: 'Invalid procurementMode' });
      data.procurementMode = v;
    }

    const upd = await prisma.project.update({ where: { id: projectId }, data });
    res.json(safeJson(upd));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
