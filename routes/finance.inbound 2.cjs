const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');

// Provider webhook: for now, keep unauthenticated but you should add HMAC verification.
// If you prefer to protect, uncomment the next line and configure your provider accordingly.
// router.use(requireAuth);

const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');

router.get('/finance/inbound', requireAuth, requireFinanceRole, async (req, res) => {
  // Lightweight compatibility list endpoint
  res.json({ items: [], total: 0 });
});

router.get('/finance/inbound/email/aliases', requireAuth, requireFinanceRole, async (req, res) => {
  // Placeholder: derive alias from tenant; in production this would come from a Tenant table.
  const tenant = String(req.user?.tenantId || 'demo');
  const alias = `inv+${tenant}@inbound.example.local`;
  res.json({ alias });
});

router.post('/finance/inbound/email', async (req, res) => {
  // Normalize inbound payload here; at this stage, we only acknowledge receipt.
  // You can persist raw emails/attachments by integrating with your Documents storage and DB.
  res.json({ ok: true, status: 'accepted' });
});

module.exports = router;
