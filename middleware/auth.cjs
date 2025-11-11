const { verify } = require('../utils/jwt.cjs');
const { isDevAuthEnabled } = require('../utils/devFlags.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const DEFAULT_TENANT = process.env.TENANT_DEFAULT || 'demo';

function parseBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function attachUser(req, _res, next) {
  try {
    let tok = parseBearer(req);
    // Dev-only: allow token via query string (?token=...) when enabled
    if (!tok && isDevAuthEnabled()) {
      if (req.query && req.query.token) tok = String(req.query.token);
    }
    if (tok) {
      const payload = verify(tok, JWT_SECRET);
      const roles = Array.isArray(payload.roles)
        ? payload.roles
        : payload.role
          ? [payload.role]
          : [];
      const role = payload.role || (roles.length ? roles[0] : undefined);

      const rawId = payload.sub ?? payload.id;
      const numericId = Number(rawId);
      if (Number.isFinite(numericId)) {
        req.user = {
          id: numericId,
          email: payload.email,
          tenantId: payload.tenantId || payload.tenant || DEFAULT_TENANT,
          role,
          roles,
        };
      } else {
        // Invalid id in token; leave req.user undefined to trigger 401 in requireAuth
        req.user = undefined;
      }
    }
  } catch (_e) {
    // Invalid token; leave req.user undefined to trigger 401 in requireAuth
    req.user = undefined;
  }
  next();
}

function requireAuth(req, res, next) {
  // Skip auth check for OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') return next();

  if (!req.user || !Number.isFinite(Number(req.user.id)) || !req.user.tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { attachUser, requireAuth, JWT_SECRET };
