const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth.cjs');
const { getCatalogHash, getDeltaPrompt } = require('../utils/apiCatalog.cjs');

router.use(requireAuth);

router.get('/api/__catalog/hash', (_req, res) => {
  res.json({ hash: getCatalogHash() });
});

router.get('/api/__delta', (_req, res) => {
  res.type('text/plain');
  res.send(getDeltaPrompt());
});

module.exports = router;
