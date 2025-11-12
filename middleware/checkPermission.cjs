const rolePerms = {
  dev: ['*'], // SUPERADMIN - Full access to everything (default role for all signups)
  admin: ['*'], // Legacy admin role - also has full access
  PM: ['project:view', 'project:edit', 'procurement:issue', 'procurement:award', 'programme:edit', 'jobs:view', 'jobs:create', 'jobs:update', 'jobs:delete', 'workers:view', 'workers:create', 'workers:update', 'workers:delete', 'equipment:view', 'equipment:create', 'equipment:update', 'equipment:delete', 'schedules:view', 'schedules:create', 'schedules:update', 'schedules:delete', 'timeentries:view', 'timeentries:create', 'timeentries:update', 'timeentries:delete', 'timeentries:submit', 'timeentries:approve'],
  QS: ['cvr:edit', 'cvr:close', 'financials:edit', 'jobs:view', 'workers:view', 'equipment:view', 'schedules:view', 'timeentries:view'],
  HS: ['hs:edit', 'docs:edit', 'jobs:view', 'workers:view', 'equipment:view', 'schedules:view', 'timeentries:view'],
  'Site Manager': ['jobs:view', 'jobs:create', 'jobs:update', 'workers:view', 'workers:update', 'equipment:view', 'equipment:update', 'schedules:view', 'schedules:create', 'schedules:update', 'timeentries:view', 'timeentries:approve'],
  Foreman: ['jobs:view', 'jobs:update', 'workers:view', 'equipment:view', 'schedules:view', 'schedules:update', 'timeentries:view', 'timeentries:create', 'timeentries:update', 'timeentries:submit'],
  worker: ['timeentries:view', 'timeentries:create', 'timeentries:update', 'timeentries:submit'],
  user: ['*'], // Default user role - also has full access for now
};

function hasPerm(user, perm) {
  if (!user) return false;
  const roles = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
  const perms = Array.isArray(user.perms) ? user.perms : [];

  // Superadmin roles get full access
  if (roles.includes('dev') || roles.includes('admin')) return true;

  // Check explicit permissions
  if (perms.includes('*') || perms.includes(perm)) return true;

  // Check role-based permissions
  for (const r of roles) {
    const rp = rolePerms[r];
    if (rp && (rp.includes('*') || rp.includes(perm))) return true;
  }
  return false;
}

function requirePerm(perm) {
  return function (req, res, next) {
    if (hasPerm(req.user, perm)) return next();
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: ${perm}` } });
  };
}

module.exports = { requirePerm, rolePerms };
