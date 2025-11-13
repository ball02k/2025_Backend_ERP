const express = require('express');
const router = express.Router();
const { requireProjectMember } = require('../middleware/membership.cjs');

module.exports = (prisma) => {
  // GET /api/projects/:id/alerts
  router.get('/:id/alerts', requireProjectMember, async (req, res) => {
    const tenantId = req.user?.tenantId;
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id' });

    const now = new Date();
    const notCompleted = { notIn: ['Done','done','Completed','completed','Closed','closed'] };

    const [proj, overdueTasks, dueThisWeekTasks, pendingVars, snapshot] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { budget: true, actualSpend: true } }),
      prisma.task.count({ where: { tenantId, projectId, deletedAt: null, status: notCompleted, dueDate: { lt: now } } }),
      (async () => {
        const dow = now.getDay() || 7;
        const endOfWeek = new Date(now); endOfWeek.setHours(23,59,59,999); endOfWeek.setDate(now.getDate() + (7 - dow));
        return prisma.task.count({ where: { tenantId, projectId, deletedAt: null, status: notCompleted, dueDate: { gte: now, lte: endOfWeek } } });
      })(),
      prisma.variation.count({ where: { tenantId, projectId, deletedAt: null, status: { in: ['Submitted','submitted','Pending','pending'] } } }),
      prisma.projectSnapshot.findUnique({ where: { projectId } }),
    ]);

    const alerts = [];
    if (proj && proj.budget != null && proj.actualSpend != null && Number(proj.actualSpend) > Number(proj.budget)) {
      alerts.push({ key: 'budget_overspend', level: 'warning', message: 'Actual spend exceeds budget.' });
    }
    if (overdueTasks > 0) alerts.push({ key: 'tasks_overdue', level: 'warning', count: overdueTasks, message: `${overdueTasks} task(s) overdue.` });
    if (dueThisWeekTasks > 0) alerts.push({ key: 'tasks_due_this_week', level: 'info', count: dueThisWeekTasks, message: `${dueThisWeekTasks} task(s) due this week.` });
    if (pendingVars > 0) alerts.push({ key: 'variations_pending', level: 'info', count: pendingVars, message: `${pendingVars} variation(s) pending.` });

    if (snapshot?.criticalAtRisk && snapshot.criticalAtRisk > 0) {
      alerts.push({ key: 'schedule_critical_risk', level: 'warning', count: snapshot.criticalAtRisk, message: `Critical activities at risk.` });
    }

    res.json({ alerts, updatedAt: new Date().toISOString() });
  });

  return router;
};
