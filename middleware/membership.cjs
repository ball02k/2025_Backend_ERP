const { prisma } = require('../utils/prisma.cjs');

// Assert membership returns record or null; coerces IDs to Numbers and requires tenantId
async function assertProjectMember({ userId, projectId, tenantId }) {
  const uid = Number(userId);
  const pid = Number(projectId);
  if (!tenantId) return null;
  if (!Number.isFinite(uid) || !Number.isFinite(pid)) return null;

  return prisma.projectMembership.findFirst({
    where: {
      tenantId,
      projectId: pid,
      userId: uid,
    },
    select: { id: true, role: true },
  });
}

// Middleware: require membership OR admin
async function requireProjectMember(req, res, next) {
  try {
    const tenantId = req.user?.tenantId;
    const userId = Number(req.user?.id);
    const projectId = Number(
      req.params?.id ?? req.query?.projectId ?? req.body?.projectId
    );

    // Admins and dev (superadmin) bypass membership
    const roles = Array.isArray(req.user?.roles)
      ? req.user.roles
      : req.user?.role
      ? [req.user.role]
      : [];
    const isAdmin = roles.includes('dev') || roles.includes('admin');

    if (isAdmin) return next();

    const membership = await assertProjectMember({ userId, projectId, tenantId });
    if (!membership)
      return res.status(403).json({ error: 'NOT_A_PROJECT_MEMBER' });

    req.membership = membership; // attach for downstream if needed
    return next();
  } catch (e) {
    console.error('requireProjectMember error', e);
    return res.status(500).json({ error: 'Membership check failed' });
  }
}

module.exports = { assertProjectMember, requireProjectMember };
