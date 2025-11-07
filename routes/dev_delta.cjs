const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { getCatalogHash, getDeltaPrompt } = require('../utils/apiCatalog.cjs');

// Apply requireAuth only to these specific routes, not globally
router.get('/api/__catalog/hash', requireAuth, (_req, res) => {
  res.json({ hash: getCatalogHash() });
});

router.get('/api/__delta', requireAuth, (_req, res) => {
  res.type('text/plain');
  res.send(getDeltaPrompt());
});

module.exports = router;
