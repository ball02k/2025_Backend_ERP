const express = require('express');
const router = express.Router();
module.exports = (prisma) => {
  // GET /api/projects/:id/members
  router.get('/:id/members', async (req, res) => {
    const tenantId = req.user?.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });

    const rows = await prisma.projectMembership.findMany({
      where: { tenantId, projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({ members: rows.map(r => ({ id: r.id, userId: r.userId, role: r.role, user: r.user })) });
  });

  // POST /api/projects/:id/members  (admin/pm only)
  router.post('/:id/members', async (req, res) => {
    const tenantId = req.user?.tenantId;
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : (req.user?.role ? [req.user.role] : []);
    if (!roles.some(r => ['admin','pm'].includes(String(r)))) return res.status(403).json({ error: 'FORBIDDEN' });

    const projectId = Number(req.params.id);
    const { userId, role } = req.body || {};
    if (!Number.isFinite(projectId) || !Number.isFinite(Number(userId))) return res.status(400).json({ error: 'Invalid payload' });

    const user = await prisma.user.findFirst({ where: { id: Number(userId), tenantId } });
    const proj = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null } });
    if (!user || !proj) return res.status(400).json({ error: 'Invalid userId or projectId' });

    const created = await prisma.projectMembership.create({ data: { tenantId, projectId, userId: Number(userId), role: role || 'member' } });
    res.status(201).json(created);
  });

  // DELETE /api/projects/:id/members/:memberId  (admin/pm only)
  router.delete('/:id/members/:memberId', async (req, res) => {
    const tenantId = req.user?.tenantId;
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : (req.user?.role ? [req.user.role] : []);
    if (!roles.some(r => ['admin','pm'].includes(String(r)))) return res.status(403).json({ error: 'FORBIDDEN' });

    const projectId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    if (!Number.isFinite(projectId) || !Number.isFinite(memberId)) return res.status(400).json({ error: 'Invalid params' });

    const existing = await prisma.projectMembership.findFirst({ where: { id: memberId, tenantId, projectId } });
    if (!existing) return res.status(404).json({ error: 'MEMBERSHIP_NOT_FOUND' });

    await prisma.projectMembership.delete({ where: { id: memberId } });
    res.status(204).end();
  });

  return router;
};
