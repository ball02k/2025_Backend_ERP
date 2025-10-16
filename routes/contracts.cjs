const router = require('express').Router();
const {
  listContracts,
  getContract,
  createContract,
  approveContract,
} = require('../services/contracts.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function getUserId(req) {
  const raw = req.user?.id ?? req.userId ?? null;
  return raw != null ? Number(raw) : null;
}

router.get('/contracts', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { projectId } = req.query || {};
    const contracts = await listContracts({ tenantId, projectId: projectId ? Number(projectId) : undefined });
    res.json(contracts);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post('/contracts', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const created = await createContract({ tenantId, userId, data: req.body || {}, req });
    res.status(201).json(created);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/contracts/:contractId', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const contractId = Number(req.params.contractId);
    const contract = await getContract({ tenantId, contractId });
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post('/contracts/:contractId/approve', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const contractId = Number(req.params.contractId);
    const updated = await approveContract({ tenantId, contractId, userId, req });
    res.json(updated);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
