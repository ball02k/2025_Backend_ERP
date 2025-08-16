const { verify } = require('../utils/jwt.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function parseBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function attachUser(req, _res, next) {
  const tenantHeader =
    req.headers['x-tenant-id'] ||
    (process.env.NODE_ENV === 'production' ? undefined : 'demo');
  req.tenantId = tenantHeader;
  try {
    const tok = parseBearer(req);
    if (tok) {
      const payload = verify(tok, JWT_SECRET);
      if (
        !tenantHeader ||
        tenantHeader === payload.tenantId ||
        process.env.NODE_ENV !== 'production'
      ) {
        req.user = {
          id: payload.sub,
          tenantId: payload.tenantId,
          email: payload.email,
          roles: payload.roles || [],
        };
      }
    }
  } catch (_e) {}
  next();
}

function requireAuth(req, res, next) {
  if (!req.user?.tenantId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = { attachUser, requireAuth, JWT_SECRET };

