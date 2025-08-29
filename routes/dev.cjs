const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { sign } = require('../utils/jwt.cjs');
const { JWT_SECRET } = require('../middleware/auth.cjs');

const prisma = new PrismaClient();
const router = express.Router();

const TENANT_DEFAULT = process.env.TENANT_DEFAULT || 'demo';

// POST /api/dev/login?tenant=demo
router.post('/login', async (req, res) => {
  try {
    const tId = (req.query.tenant || TENANT_DEFAULT).toString();

    // Ensure a dev user exists for this tenant (unique email per tenant via suffix)
    const email = `dev+${tId}@local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { tenantId: tId, name: 'Dev User' },
      create: { email, name: 'Dev User', tenantId: tId, passwordSHA: '' },
    });

    // Ensure membership to all tenant projects for convenience
    const projects = await prisma.project.findMany({ where: { tenantId: tId }, select: { id: true } });
    await Promise.all(
      projects.map((p) =>
        prisma.projectMembership.upsert({
          where: { tenantId_projectId_userId: { tenantId: tId, projectId: p.id, userId: user.id } },
          update: {},
          create: { tenantId: tId, projectId: p.id, userId: user.id, role: 'Member' },
        })
      )
    );

    // Sign JWT matching middleware expectations
    const token = sign({ sub: String(user.id), tenantId: tId }, JWT_SECRET, {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
    });

    return res.json({ token, tenant: tId });
  } catch (e) {
    console.error('dev/login error', e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
