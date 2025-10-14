const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

// POST /api/projects/:projectId/packages:seed
// Body: { mode: 'group' | 'prefix', prefixes: { '01-': 'Package A', '02-': 'Package B' } }
router.post('/projects/:projectId/packages:seed', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const projectId = Number(req.params.projectId);
    const { mode = 'group', prefixes = {}, only = [], groupId, costCodePrefix } = req.body || {};

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    // Load all budget lines with cost code and group name (if any)
    const budgets = await prisma.budgetLine.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        description: true,
        amount: true,
        group: { select: { name: true } },
        costCode: { select: { code: true } },
      },
      orderBy: [{ id: 'asc' }],
    });

    // Optional filtered modes: single groupId or single costCodePrefix
    if (groupId != null) {
      const gid = Number(groupId);
      const lines = budgets.filter(b => (b.group?.name ? true : (gid === 0 ? true : false)) || b.group?.id === gid);
      const name = gid === 0 ? 'Ungrouped' : (await prisma.budgetGroup.findFirst({ where: { tenantId, id: gid }, select: { name: true } }))?.name || `Group ${gid}`;
      if (!lines.length) return res.json({ createdCount: 0, packages: [] });
      const budgetAmount = lines.reduce((a, l) => a + Number(l.amount || 0), 0);
      const pkg = await prisma.package.create({ data: { projectId, name, budgetEstimate: Number(budgetAmount) || 0 } });
      // Enforce one-package-per-line at DB via unique constraint; catch duplicates
      try { await prisma.packageItem.createMany({ data: lines.map(l => ({ tenantId, packageId: pkg.id, budgetLineId: Number(l.id) })) }); }
      catch (e) { if (e?.code === 'P2002') return res.status(409).json({ error: 'LINES_ALREADY_COMMITTED' }); }
      return res.json({ createdCount: 1, packages: [{ id: pkg.id, name: pkg.name, count: lines.length, budgetAmount }] });
    }

    if (costCodePrefix != null) {
      const pref = String(costCodePrefix);
      const lines = budgets.filter(b => (b.costCode?.code || '').startsWith(pref));
      if (!lines.length) return res.json({ createdCount: 0, packages: [] });
      const budgetAmount = lines.reduce((a, l) => a + Number(l.amount || 0), 0);
      const pkg = await prisma.package.create({ data: { projectId, name: pref, budgetEstimate: Number(budgetAmount) || 0 } });
      try { await prisma.packageItem.createMany({ data: lines.map(l => ({ tenantId, packageId: pkg.id, budgetLineId: Number(l.id) })) }); }
      catch (e) { if (e?.code === 'P2002') return res.status(409).json({ error: 'LINES_ALREADY_COMMITTED' }); }
      return res.json({ createdCount: 1, packages: [{ id: pkg.id, name: pkg.name, count: lines.length, budgetAmount }] });
    }

    // Group lines (bulk modes)
    const groups = new Map(); // name -> array of lines
    for (const b of budgets) {
      let key;
      if (String(mode) === 'prefix') {
        const code = b.costCode?.code || '';
        const match = Object.keys(prefixes || {}).find((p) => code.startsWith(p));
        key = match ? String(prefixes[match]) : 'Other';
      } else {
        key = b.group?.name || 'Ungrouped';
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }

    // Create packages + join items
    const created = [];
    const onlyNames = Array.isArray(only) ? only.map(String) : null;
    for (const [name, lines] of groups.entries()) {
      if (onlyNames && onlyNames.length && !onlyNames.includes(String(name))) continue;
      if (!lines.length) continue;
      const budgetAmount = lines.reduce((a, l) => a + Number(l.amount || 0), 0);

      const pkg = await prisma.package.create({
        data: {
          projectId,
          name: String(name),
          tradeCategory: null,
          budgetEstimate: Number.isFinite(budgetAmount) ? budgetAmount : 0,
        },
        select: { id: true, name: true },
      });

      try {
        await prisma.packageItem.createMany({
          data: lines.map((l) => ({ tenantId, packageId: pkg.id, budgetLineId: Number(l.id) })),
        });
      } catch (_) {
        // If join table not present or createMany unsupported, try individual inserts
        for (const l of lines) {
          try { await prisma.packageItem.create({ data: { tenantId, packageId: pkg.id, budgetLineId: Number(l.id) } }); } catch (_) {}
        }
      }

      created.push({ id: pkg.id, name: pkg.name, count: lines.length, budgetAmount });
    }

    return res.json({ createdCount: created.length, packages: created });
  } catch (e) {
    console.error('[packages:seed]', e);
    res.status(500).json({ error: 'Failed to seed packages' });
  }
});

module.exports = router;
