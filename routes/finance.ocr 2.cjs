const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const requireFinanceRole = require('../middleware/requireFinanceRole.cjs');

router.use(requireAuth);
router.use(requireFinanceRole);


// Stub: trigger OCR retry for an invoice (no-op placeholder)
router.post('/finance/ocr/:invoiceId/retry', async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (!Number.isFinite(invoiceId)) return res.status(400).json({ error: 'Invalid invoiceId' });
    // Integrate with a worker/queue in future; for now respond success
    res.json({ ok: true, message: 'Queued OCR retry (stub)' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to queue OCR retry' });
  }
});

module.exports = router;
