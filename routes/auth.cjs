const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../utils/prisma.cjs');
const { sign } = require('../utils/jwt.cjs');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, tenantId } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const tId = tenantId || 'demo';
    const user = await prisma.user.findFirst({
      where: { email, tenantId: tId, isActive: true },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.passwordSHA) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const roles = user.userRoles.map((ur) => ur.role.name);
    const token = sign(
      { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, roles },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({
      token,
      user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, roles },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

