const express = require('express');
const router = express.Router();
const { requireAuth } = { requireAuth: (req,res,next)=>next() };
const { ensureFeature } = require('../middleware/featureGuard.js');
const svc = require('../services/afp.service.js');
const { validateCreateAfp, validateNoticePayload } = require('../validators/afp.js');

// Gate: auth and feature flag
router.use(require('../middleware/requireAuth.cjs'));
router.use(ensureFeature('afp'));

router.get('/', async (req, res) => {
  try {
    const { page, pageSize, projectId, supplierId, status, q } = req.query || {};
    const data = await svc.listAfps(req.user.tenantId || req.tenantId || req.user?.tenantId, { projectId, supplierId, status, q }, { page: Number(page || 1), pageSize: Number(pageSize || 25) });
    res.json(data);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const t = req.user.tenantId || req.tenantId || req.user?.tenantId;
    const data = await svc.getAfp(t, req.params.id);
    if (!data) return res.status(404).json({ message: 'Not found' });
    res.json(data);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    validateCreateAfp(req.body || {});
    const t = req.user.tenantId || req.tenantId || req.user?.tenantId;
    const created = await svc.createAfp(t, req.user?.id, req.body || {});
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const t = req.user.tenantId || req.tenantId || req.user?.tenantId;
    const updated = await svc.updateAfp(t, req.user?.id, req.params.id, req.body || {});
    res.json(updated);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/:id/notices', async (req, res) => {
  try {
    const { type, reason } = req.body || {};
    validateNoticePayload({ type, reason });
    const t = req.user.tenantId || req.tenantId || req.user?.tenantId;
    const updated = await svc.issueNotice(t, req.user?.id, req.params.id, { type, reason });
    res.json(updated);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/:id/certify', async (req, res) => {
  try {
    const t = req.user.tenantId || req.tenantId || req.user?.tenantId;
    const updated = await svc.certifyAfp(t, req.user?.id, req.params.id, req.body || {});
    res.json(updated);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

module.exports = router;

