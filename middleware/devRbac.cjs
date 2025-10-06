const { prisma } = require('../utils/prisma.cjs');

// DEV-ONLY middleware to ensure admin privileges and project membership
// Mounted after attachUser/devAuth. Removes easily for production.
module.exports = async function devRbac(req, _res, next) {
  try {
    // Only run in non-production and when a user is attached
    const { isDevEnv } = require('../utils/devFlags.cjs');
    if (!isDevEnv() || !req.user) return next();

    // Force admin role on the request user (in-memory)
    req.user.role = 'admin';
    req.user.roles = Array.from(new Set([...(req.user.roles || []), 'admin']));

    /* Ensure DEV user + RBAC rows exist to avoid FKs */
    let tenantIdSafe = req.tenantId || req.user.tenantId || 'demo';
    let userIdSafe;

    try {
      if (prisma.user?.upsert && prisma.role?.upsert && prisma.userRole?.upsert) {
        const email = req.user.email || 'dev@local';
        const name = req.user.name || 'Dev Admin';

        // Ensure a concrete User exists and align req.user.id with DB id
        const user = await prisma.user.upsert({
          where: { email },
          update: { tenantId: tenantIdSafe, name },
          create: { email, name, tenantId: tenantIdSafe, passwordSHA: '' },
        });
        req.user.id = user.id;
        userIdSafe = user.id;

        // Ensure 'admin' Role exists for tenant
        const role = await prisma.role.upsert({
          where: { tenantId_name: { tenantId: tenantIdSafe, name: 'admin' } },
          update: {},
          create: { tenantId: tenantIdSafe, name: 'admin' },
        });

        // Ensure UserRole exists (prevents P2003 on missing user)
        await prisma.userRole.upsert({
          where: {
            tenantId_userId_roleId: {
              tenantId: tenantIdSafe,
              userId: userIdSafe,
              roleId: role.id,
            },
          },
          update: {},
          create: { tenantId: tenantIdSafe, userId: userIdSafe, roleId: role.id },
        });
      }
    } catch (e) {
      if (e?.code === 'P2021') {
        console.warn('[devRbac] Skipping RBAC bootstrap: tables not present yet.');
      } else {
        throw e; // keep other errors loud
      }
    }

    // If hitting /api/projects/:id/* ensure project membership as PM
    const m = /^\/api\/projects\/(\d+)/.exec(req.path);
    if (m) {
      const projectId = Number(m[1]);
      const tenantId = tenantIdSafe;
      const userId = Number(userIdSafe || req.user.id);
      if (Number.isFinite(projectId) && Number.isFinite(userId)) {
        await prisma.projectMembership.upsert({
          where: {
            tenantId_projectId_userId: { tenantId, projectId, userId },
          },
          update: { role: 'PM' },
          create: { tenantId, projectId, userId, role: 'PM' },
        });
      }
    }
  } catch (e) {
    console.warn('devRbac error', e);
  }
  next();
};
