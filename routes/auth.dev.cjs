const express = require('express');
const { sign } = require('../utils/jwt.cjs');

const router = express.Router();

module.exports = (prisma) => {
  router.get('/dev-token', async (req, res) => {
    try {
      if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_DEV_AUTH !== '1') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const tenantId = process.env.DEMO_TENANT_ID || 'demo';
      const email = process.env.DEMO_USER_EMAIL || 'admin@demo.local';
      const user = await prisma.user.findFirst({
        where: { email, tenantId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user) return res.status(404).json({ error: 'Demo user not found' });

      const roles = (user.userRoles || []).map((ur) => ur.role?.name).filter(Boolean);
      const token = sign(
        {
          sub: String(user.id),
          email: user.email,
          tenantId: user.tenantId,
          roles,
        },
        process.env.JWT_SECRET,
        { expiresIn: 60 * 60 * 8 }
      );

      res.json({ token, user: { id: user.id, email: user.email, tenantId: user.tenantId } });
    } catch (e) {
      res.status(500).json({ error: 'Failed to issue dev token' });
    }
  });
  return router;
};

