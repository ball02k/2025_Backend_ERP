const express = require('express');
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user.tenantId },
      select: { id: true, email: true, name: true, isActive: true },
    });
    res.json({ users });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

