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
    const { mode = 'group', prefixes = {} } = req.body || {};

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

    // Group lines
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
    for (const [name, lines] of groups.entries()) {
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

