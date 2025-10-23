const router = require('express').Router();
const {
  listContracts,
  getContract,
} = require('../services/contracts.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

// Read-only contract endpoints (no auth required for public access)
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

module.exports = router;
