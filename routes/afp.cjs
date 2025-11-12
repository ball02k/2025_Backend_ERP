const express = require('express');
const router = express.Router();
const requireAuth = { requireAuth: (req,res,next)=>next() };
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

    // DEBUG: Log first item to see what data we have
    if (data.items && data.items.length > 0) {
      console.log('[AFP DEBUG] First item:', JSON.stringify(data.items[0], null, 2));
    }

    // Transform items to include proper links and values
    const transformedItems = (data.items || []).map(item => {
      const links = [];

      // Add contract link if available
      if (item.contract) {
        links.push({
          type: 'contract',
          id: item.contract.id,
          href: `/contracts/${item.contract.id}`,
          label: item.contract.contractRef || item.contract.reference || `Contract ${item.contract.id}`
        });
      }

      // Add supplier link if available
      if (item.supplier) {
        links.push({
          type: 'supplier',
          id: item.supplier.id,
          href: `/suppliers/${item.supplier.id}`,
          label: item.supplier.name || `Supplier ${item.supplier.id}`
        });
      }

      // Add project link if available
      if (item.project) {
        links.push({
          type: 'project',
          id: item.project.id,
          href: `/projects/${item.project.id}`,
          label: item.project.name || `Project ${item.project.id}`
        });
      }

      // Calculate the correct value (use claimedThisPeriod or fallback to netClaimed)
      const value = item.claimedThisPeriod || item.netClaimed || 0;

      // Format period
      const period = item.periodStart ?
        new Date(item.periodStart).toISOString().substring(0, 7) :
        (item.applicationDate ? new Date(item.applicationDate).toISOString().substring(0, 7) : null);

      return {
        id: item.id,
        projectId: item.projectId,
        contractId: item.contractId,
        supplierId: item.supplierId,
        applicationNo: item.applicationNo,
        period,
        status: item.status,
        value: Number(value) || 0,
        updatedAt: item.updatedAt,
        links
      };
    });

    res.json({ ...data, items: transformedItems });
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

// DEBUG route - return raw service data
router.get('/debug/raw', async (req, res) => {
  try {
    const { projectId } = req.query || {};
    const t = req.user.tenantId || req.tenantId || req.user?.tenantId;
    const data = await svc.listAfps(t, { projectId }, { page: 1, pageSize: 25 });
    res.json(data);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

module.exports = router;

