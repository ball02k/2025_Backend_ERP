const express = require('express');
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      where: { tenantId: req.user.tenantId },
    });
    res.json({ roles });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

