const express = require('express');
const { requireTenant } = require('../middleware/tenant.cjs');
const { writeAudit } = require('../lib/audit.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  router.get('/trades', async (req, res) => {
    let tenantId;
    try {
      tenantId = requireTenant(req);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
    }
    try {
      const items = await prisma.trade.findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      res.json({ items });
    } catch (err) {
      console.error('[trades.list] failed', err);
      res.status(500).json({ error: 'Failed to load trades' });
    }
  });

  router.post('/trades', async (req, res) => {
    let tenantId;
    try {
      tenantId = requireTenant(req);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
    }
    const roles = Array.isArray(req.user?.roles)
      ? req.user.roles
      : req.user?.role
      ? [req.user.role]
      : [];
    if (!roles.some((role) => String(role).toLowerCase() === 'admin')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const payload = req.body;
    const source = Array.isArray(payload?.trades)
      ? payload.trades
      : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
      ? payload
      : [];

    const entries = source
      .map((item) => {
        if (typeof item === 'string') {
          return { name: item };
        }
        if (item && typeof item.name === 'string') {
          return { name: item.name };
        }
        return null;
      })
      .filter(Boolean)
      .map((item) => ({ name: item.name.trim() }))
      .filter((item) => item.name.length > 0);

    if (!entries.length) {
      return res.status(400).json({ error: 'No trades supplied' });
    }

    const created = [];
    const skipped = [];

    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const existing = await tx.trade.findFirst({ where: { tenantId, name: entry.name } });
        if (existing) {
          skipped.push(entry.name);
          continue;
        }
        const row = await tx.trade.create({
          data: {
            tenantId,
            name: entry.name,
          },
        });
        created.push(row);
      }
    });

    if (created.length) {
      await writeAudit({
        prisma,
        req,
        entity: 'Trade',
        entityId: created[0].id,
        action: 'bulk_create',
        changes: { created: created.map((t) => ({ id: t.id, name: t.name })) },
      });
    }

    res.status(created.length ? 201 : 200).json({
      created,
      skipped,
    });
  });

  return router;
};
