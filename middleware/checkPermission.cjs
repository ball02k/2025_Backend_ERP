const rolePerms = {
  admin: ['*'],
  PM: ['project:view', 'project:edit', 'procurement:issue', 'procurement:award', 'programme:edit', 'jobs:view', 'jobs:create', 'jobs:update', 'jobs:delete'],
  QS: ['cvr:edit', 'cvr:close', 'financials:edit', 'jobs:view'],
  HS: ['hs:edit', 'docs:edit', 'jobs:view'],
  'Site Manager': ['jobs:view', 'jobs:create', 'jobs:update'],
  Foreman: ['jobs:view', 'jobs:update'],
};

function hasPerm(user, perm) {
  if (!user) return false;
  const roles = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
  const perms = Array.isArray(user.perms) ? user.perms : [];
  if (roles.includes('admin')) return true;
  if (perms.includes('*') || perms.includes(perm)) return true;
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
