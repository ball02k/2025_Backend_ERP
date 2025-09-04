const { prisma } = require('../utils/prisma.cjs');

// DEV-ONLY middleware to ensure admin privileges and project membership
// Mounted after attachUser/devAuth. Removes easily for production.
module.exports = async function devRbac(req, _res, next) {
  try {
    // Only run in development and when a user is attached
    if (process.env.NODE_ENV !== 'development' || !req.user) return next();

    const { tenantId, id: userId } = req.user;

    // Force admin role on the request user
    req.user.role = 'admin';
    req.user.roles = Array.from(new Set([...(req.user.roles || []), 'admin']));

    /* BEGIN guard patch */
    try {
      if (prisma.role?.upsert && prisma.userRole?.upsert) {
        const tenantId = req.tenantId || 'demo';
        const userId = (req.user && req.user.id) ? req.user.id : 1;

        // Role: @@unique([tenantId, name]) -> tenantId_name
        const role = await prisma.role.upsert({
          where: { tenantId_name: { tenantId, name: 'admin' } },
          update: {},
          create: { tenantId, name: 'admin' }
        });

        // UserRole: @@unique([tenantId, userId, roleId]) -> tenantId_userId_roleId
        await prisma.userRole.upsert({
          where: { tenantId_userId_roleId: { tenantId, userId, roleId: role.id } },
          update: {},
          create: { tenantId, userId, roleId: role.id }
        });
      }
    } catch (e) {
      if (e?.code === 'P2021') {
        console.warn('[devRbac] Skipping role bootstrap: tables not present yet.');
      } else {
        throw e; // keep other errors loud
      }
    }
    /* END guard patch */

    // If hitting /api/projects/:id/* ensure project membership as PM
    const m = /^\/api\/projects\/(\d+)/.exec(req.path);
    if (m) {
      const projectId = Number(m[1]);
      if (Number.isFinite(projectId)) {
        await prisma.projectMembership.upsert({
          where: {
            tenantId_projectId_userId: { tenantId, projectId, userId: Number(userId) },
          },
          update: { role: 'PM' },
          create: { tenantId, projectId, userId: Number(userId), role: 'PM' },
        });
      }
    }
  } catch (e) {
    console.warn('devRbac error', e);
  }
  next();
};
