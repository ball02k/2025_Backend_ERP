const router = require('express').Router({ mergeParams: true });
const { projectIntegrity } = require('./diag.service.cjs');
const { recomputeProject } = require('./recompute.cjs');

// GET /mvp/diag/projects/:projectId (mounted under /api/mvp)
router.get('/diag/projects/:projectId', async (req, res, next) => {
  try { const out = await projectIntegrity(req.tenantId, Number(req.params.projectId)); res.json(out); } catch (e) { next(e); }
});

// POST /mvp/diag/projects/:projectId/recompute
router.post('/diag/projects/:projectId/recompute', async (req, res, next) => {
  try { const totals = await recomputeProject(req.tenantId, Number(req.params.projectId)); res.json({ totals }); } catch (e) { next(e); }
});

// Alias: POST /mvp/projects/:projectId/recompute for convenience
router.post('/projects/:projectId/recompute', async (req, res, next) => {
  try { const totals = await recomputeProject(req.tenantId, Number(req.params.projectId)); res.json({ totals }); } catch (e) { next(e); }
});

module.exports = router;

