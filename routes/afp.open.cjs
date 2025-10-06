const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { prisma } = require('../utils/prisma.cjs');

// Open GET list for AFP without feature gating; keep auth + tenant scoping
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user && req.user.tenantId;
    const projectId = Number(req.query.projectId);
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId required' });

    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const itemsRaw = await prisma.applicationForPayment.findMany({
      where: { tenantId, projectId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const toStrYymm = (d) => {
      try { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; } catch { return null; }
    };
  const items = (itemsRaw || []).map((r) => ({
      id: r.id,
      projectId: project.id,
      period: toStrYymm(r.applicationDate),
      status: r.status,
      value: r.certifiedAmount != null ? Number(r.certifiedAmount) : (r.netClaimed != null ? Number(r.netClaimed) : null),
      updatedAt: r.updatedAt,
    }));
    // Add links for FE pills
    const { buildLinks } = require('../lib/buildLinks.cjs');
    const enriched = items.map(it => ({ ...it, links: buildLinks('afp', { ...it, project: { id: project.id, name: project.name } }) }));
    return res.json({ items: enriched });
  } catch (err) { next(err); }
});

module.exports = router;
