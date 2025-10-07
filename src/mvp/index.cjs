const router = require('express').Router({ mergeParams: true });
const { requireProjectMember } = require('../../middleware/membership.cjs');

// Tenant scoping: prefer X-Tenant-Id header, else req.user.tenantId
router.use((req, _res, next) => {
  req.tenantId = req.get('X-Tenant-Id') || req.user?.tenantId || null;
  next();
});

// Mount MVP routes
router.use(require('./mvp.costCodes.cjs'));
router.use(require('./mvp.rfx.templates.cjs'));
router.use(require('./mvp.rfx.responses.cjs'));
router.use(require('./mvp.rfx.analysis.cjs'));
router.use(require('./mvp.rfx.email.cjs'));
router.use(require('./mvp.contracts.cjs'));
router.use(require('./mvp.overview.cjs'));

module.exports = router;

