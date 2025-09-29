const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { prisma } = require('../utils/prisma.cjs');

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_e) {
    return null;
  }
}

// GET /public/onboard/:token → validate token & return minimal supplier info
router.get('/onboard/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = verifyToken(token);
    if (!decoded) return res.status(400).json({ error: 'Invalid or expired link' });

    const tok = await prisma.supplierOnboardingToken.findFirst({
      where: { token, tenantId: decoded.tid, expiresAt: { gt: new Date() } },
      select: { supplierId: true, tenantId: true, expiresAt: true },
    });
    if (!tok) return res.status(400).json({ error: 'Invalid or expired link' });

    const sup = await prisma.supplier.findFirst({
      where: { id: tok.supplierId, tenantId: tok.tenantId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!sup) return res.status(404).json({ error: 'Supplier not found' });

    return res.json({ supplier: sup, expiresAt: tok.expiresAt.toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to open onboarding link' });
  }
});

// POST /public/onboard/:token → accept onboarding submission (minimal fields)
router.post('/onboard/:token', express.json(), async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = verifyToken(token);
    if (!decoded) return res.status(400).json({ error: 'Invalid or expired link' });

    const tok = await prisma.supplierOnboardingToken.findFirst({
      where: { token, tenantId: decoded.tid, expiresAt: { gt: new Date() } },
      select: { supplierId: true, tenantId: true },
    });
    if (!tok) return res.status(400).json({ error: 'Invalid or expired link' });

    const { email, phone, insurancePolicyNumber, insuranceExpiry } = req.body || {};
    await prisma.supplier.update({
      where: { id: tok.supplierId },
      data: {
        email: email || undefined,
        phone: phone || undefined,
        insurancePolicyNumber: insurancePolicyNumber || undefined,
        insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : undefined,
      },
    });

    // Optional single-use
    // await prisma.supplierOnboardingToken.deleteMany({ where: { token } });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit onboarding' });
  }
});

module.exports = router;

