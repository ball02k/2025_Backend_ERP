const express = require('express');
const router = express.Router();
const { getVATRates } = require('../services/vatCalculator.cjs');

/**
 * GET /api/vat/rates
 *
 * Get current UK VAT rates
 *
 * Response:
 * {
 *   standard: 20,
 *   reduced: 5,
 *   zero: 0
 * }
 */
router.get('/rates', (req, res) => {
  res.json(getVATRates());
});

module.exports = router;
