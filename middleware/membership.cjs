const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assertProjectMember({ userId, projectId, tenantId }) {
  return prisma.projectMembership.findFirst({
    where: { tenantId, projectId, userId },
    select: { id: true, role: true },
  });
}

async function requireProjectMember(req, res, next) {
  try {
    const projectId = Number(
      req.params.id || req.query.projectId || req.body.projectId
    );
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const member = await assertProjectMember({
      userId: req.user.id,
      projectId,
      tenantId,
    });
    if (!member)
      return res
        .status(403)
        .json({ error: 'Forbidden: not a project member' });
    req.projectMembership = member;
    next();
  } catch (e) {
    console.error('requireProjectMember error', e);
    res.status(500).json({ error: 'Membership check failed' });
  }
}

module.exports = { requireProjectMember, assertProjectMember };

