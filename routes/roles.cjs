const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth.cjs');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const roles = await prisma.role.findMany({
    where: { tenantId: req.user.tenantId },
    select: { id: true, name: true, createdAt: true },
  });
  res.json({ roles });
});

module.exports = router;

