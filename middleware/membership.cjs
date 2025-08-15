const { prisma } = require('../utils/prisma.cjs');

async function requireProjectMember(req, res, next) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const projectId = Number(req.params.id || req.params.projectId || req.body.projectId);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    const membership = await prisma.projectMembership.findFirst({
      where: { tenantId: user.tenantId, userId: user.id, projectId },
    });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireProjectMember };

