const express = require('express');
const { fetchCompanyProfile } = require('../services/companiesHouse');
const { checkVat } = require('../services/hmrcVat');

module.exports = () => {
  const router = express.Router();

  router.get('/companies-house/:companyNumber/profile', async (req, res) => {
    const { companyNumber } = req.params;
    const profile = await fetchCompanyProfile(companyNumber);
    if (!profile || profile.error === 'rate_limited') {
      const status = profile && profile.error === 'rate_limited' ? 429 : 404;
      return res.status(status).json({ error: profile ? profile.error : 'not_found' });
    }
    res.json(profile);
  });

  router.get('/hmrc/vat/:vrn/check', async (req, res) => {
    const { vrn } = req.params;
    const result = await checkVat(vrn);
    if (!result.valid && result.error) return res.status(result.error === 'rate_limited' ? 429 : 400).json(result);
    res.json(result);
  });

  return router;
};
