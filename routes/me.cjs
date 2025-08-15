const express = require('express');
const { prisma } = require('../utils/prisma.cjs');
const { requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user.id, tenantId: req.user.tenantId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const roles = user.userRoles.map((ur) => ur.role.name);
    res.json({
      user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, roles },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

