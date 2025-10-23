const { requireAuth } = require('../middleware/auth.cjs');

function requirePermission(required) {
  return function (req, res, next) {
    try {
      const perms = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      if (!perms.includes(required)) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: `Missing permission: ${required}` }
        });
      }
      next();
    } catch (e) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Missing permission: ${required}` }
      });
    }
  };
}

module.exports = { requireAuth, requirePermission };
