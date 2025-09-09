const express = require('express');
const crypto = require('crypto');
const { sign } = require('../utils/jwt.cjs');

const router = express.Router();

module.exports = (prisma) => {
  router.get('/dev-token', async (req, res) => {
    try {
      const { isDevAuthEnabled } = require('../utils/devFlags.cjs');
      if (!isDevAuthEnabled()) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const tenantId = process.env.DEMO_TENANT_ID || 'demo';
      const email = process.env.DEMO_USER_EMAIL || 'admin@demo.local';

      // Ensure a demo admin user exists in dev so this endpoint never 404s
      let user = await prisma.user.findFirst({
        where: { email, tenantId },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user) {
        // Create the admin role if missing
        const adminRole = await prisma.role.upsert({
          where: { tenantId_name: { tenantId, name: 'admin' } },
          update: {},
          create: { tenantId, name: 'admin' },
        });

        // Create the demo user with a known password hash (sha256 of 'dev')
        const passwordSHA = crypto.createHash('sha256').update('dev').digest('hex');
        user = await prisma.user.create({
          data: {
            tenantId,
            email,
            name: 'Demo Admin',
            passwordSHA,
            isActive: true,
            userRoles: {
              create: [{ tenantId, role: { connect: { id: adminRole.id } } }],
            },
          },
          include: { userRoles: { include: { role: true } } },
        });
      }

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
