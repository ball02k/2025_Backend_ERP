const { randomUUID } = require('crypto');
module.exports = function mvpLogger(req, res, next) {
  // Log only MVP namespace requests (supports /mvp and /api/mvp mounts)
  const url = req.originalUrl || '';
  if (!(url.startsWith('/mvp') || url.startsWith('/api/mvp'))) return next();
  const rid = (randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 8);
  const start = Date.now();
  const tId = req.tenantId || req.headers['x-tenant-id'] || 'unknown';
  const pId = req.params?.projectId || req.body?.projectId || '';
  console.log(JSON.stringify({ lvl: 'info', ns: 'mvp', rid, tId, pId, ev: 'req', m: req.method, u: url }));
  res.on('finish', () => {
    console.log(JSON.stringify({ lvl: 'info', ns: 'mvp', rid, tId, pId, ev: 'res', s: res.statusCode, ms: Date.now() - start }));
  });
  next();
};

