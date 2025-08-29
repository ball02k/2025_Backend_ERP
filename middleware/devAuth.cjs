module.exports = function devAuth(req, _res, next) {
  // Dev-only shortcut, gated behind explicit flag
  const bypass = process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH === '1';
  if (!bypass) return next();

  // If attachUser has already set req.user (valid token), do nothing
  if (req.user && req.user.tenantId) return next();

  // If caller sent a Bearer token, let normal auth handle it
  const hasAuthHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ');
  if (hasAuthHeader) return next();

  // Dev fallback: attach a demo user so requireAuth passes
  req.user = {
    id: 1,
    email: 'dev@local',
    tenantId: 'demo',
    role: 'admin',
    roles: ['admin'],
    isDevBypass: true,
  };
  next();
};
