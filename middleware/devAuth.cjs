const { isDevAuthEnabled } = require('../utils/devFlags.cjs');

module.exports = function devAuth(req, _res, next) {
  // Skip authentication for public routes
  const publicPaths = ['/auth', '/health', '/status', '/api/health', '/api/public'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Dev-only shortcut to attach a demo user when no token is provided
  const bypass = isDevAuthEnabled();
  if (!bypass) return next();

  // If attachUser has already set req.user (valid token), do nothing
  if (req.user && req.user.tenantId) return next();

  // If caller sent a valid Bearer token, attachUser has already populated req.user.
  // If there's an Authorization header but it's invalid (req.user not set), still bypass in dev.
  // This avoids dev 401s when FE sends a stale/empty token.
  const hasAuthHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ');
  if (hasAuthHeader && req.user) return next();

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
