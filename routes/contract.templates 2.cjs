const router = require('express').Router();
const { prisma } = require('../utils/prisma.cjs');
const { writeAudit } = require('../lib/audit.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function getUserId(req) {
  const raw = req.user?.id ?? req.userId ?? null;
  return raw != null ? Number(raw) : null;
}

// List contract templates
router.get('/contract-templates', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const items = await prisma.contractTemplate.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: 'desc' }],
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Get a specific contract template
router.get('/contract-templates/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const template = await prisma.contractTemplate.findFirst({
      where: {
        id: Number(req.params.id),
        tenantId,
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (err) {
    next(err);
  }
});

// Create contract template
router.post('/contract-templates', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { key, name, version, bodyHtml } = req.body || {};

    const created = await prisma.contractTemplate.create({
      data: {
        tenantId,
        key: String(key),
        name: String(name),
        version: version || null,
        bodyHtml: String(bodyHtml || ''),
      },
    });

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'ContractTemplate',
      entityId: created.id,
      action: 'TEMPLATE_CREATE',
      changes: { key, name, version },
    });

    res.status(201).json({ id: created.id });
  } catch (err) {
    next(err);
  }
});

// Update contract template
router.patch('/contract-templates/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = Number(req.params.id);
    const { name, version, bodyHtml } = req.body || {};

    const updated = await prisma.contractTemplate.update({
      where: { id },
      data: {
        name,
        version,
        bodyHtml,
      },
    });

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'ContractTemplate',
      entityId: id,
      action: 'TEMPLATE_UPDATE',
      changes: { name, version },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete contract template
router.delete('/contract-templates/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = Number(req.params.id);

    await prisma.contractTemplate.delete({
      where: { id },
    });

    await writeAudit({
      prisma,
      req,
      userId,
      entity: 'ContractTemplate',
      entityId: id,
      action: 'TEMPLATE_DELETE',
      changes: {},
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
