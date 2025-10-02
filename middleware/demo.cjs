function demoGuard(req, res, next) {
  if (process.env.DEMO_MODE !== '1') return next();
  const method = String(req.method || '').toUpperCase();
  const protectedRe = /(users|tenants|auth|secrets|billing|plans)/i;
  if (method === 'DELETE') {
    return res.status(403).json({ message: 'Delete is disabled in demo mode' });
  }
  if (method !== 'GET' && protectedRe.test(req.path || '')) {
    return res.status(403).json({ message: 'This operation is disabled in demo mode' });
  }
  res.setHeader('X-Demo-Mode', '1');
  return next();
}

module.exports = { demoGuard };

