module.exports = function requireAuth(req, res, next) {
  // Skip auth check for OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') return next();

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  return next();
};

