const { attachUser } = require('../../middleware/auth.cjs');

function authMiddleware(req, res, next) {
  attachUser(req, res, () => {
    if (!req.tenantId) {
      req.tenantId =
        req.headers['x-tenant-id'] ||
        req.headers['X-Tenant-Id'] ||
        req.user?.tenantId ||
        null;
    }
    next();
  });
}

module.exports = { authMiddleware };
