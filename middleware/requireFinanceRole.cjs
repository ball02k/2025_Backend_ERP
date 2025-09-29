module.exports = function requireFinanceRole(req, res, next) {
  try {
    const roles = Array.isArray(req.user?.roles)
      ? req.user.roles.map((r) => String(r).toLowerCase())
      : (req.user?.role ? [String(req.user.role).toLowerCase()] : []);
    if (roles.includes('admin') || roles.includes('finance')) return next();
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing role: finance' } });
  } catch (_) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing role: finance' } });
  }
};

