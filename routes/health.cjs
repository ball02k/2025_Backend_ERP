const express = require('express');
const router = express.Router();
const { assertProjectMember } = require('../middleware/membership.cjs');

// GET /api/health/overview-test?projectId=
router.get('/overview-test', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || 'demo';
    const userId = Number(req.user?.id);
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });
    const membership = await assertProjectMember({ userId, projectId, tenantId });
    if (!membership) return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('health overview-test error', err);
    return res.status(500).json({ error: 'Failed membership smoke test' });
  }
});

module.exports = router;

