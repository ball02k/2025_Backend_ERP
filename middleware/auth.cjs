const { verify } = require('../utils/jwt.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function attachUser(req, _res, next) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      req.user = verify(token, JWT_SECRET);
    } catch (_e) {
      req.user = undefined;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = { attachUser, requireAuth };

