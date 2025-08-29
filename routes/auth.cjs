const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sign } = require('../utils/jwt.cjs');
const { JWT_SECRET } = require('../middleware/auth.cjs');

const prisma = new PrismaClient();
const router = express.Router();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

router.post('/login', async (req, res) => {
  try {
    const { email, password, tenantId } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });
    const tId = tenantId || 'demo';
    const user = await prisma.user.findFirst({
      where: { tenantId: tId, email, isActive: true },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.passwordSHA !== sha256(password))
      return res.status(401).json({ error: 'Invalid credentials' });

    const roles = user.userRoles.map((ur) => ur.role.name);
    const token = sign(
      { sub: user.id, tenantId: user.tenantId, email: user.email, roles },
      JWT_SECRET,
      { expiresIn: 60 * 60 * 8 }
    );
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        roles,
      },
    });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
