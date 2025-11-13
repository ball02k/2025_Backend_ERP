function headerTenant(req) {
  if (!req || !req.headers) return null;
  const headers = req.headers;
  return (
    headers['x-tenant-id'] ||
    headers['X-Tenant-Id'] ||
    headers['x-tenantid'] ||
    headers['X-TenantId'] ||
    null
  );
}

function getTenantId(req) {
  return (
    req?.tenantId ||
    req?.user?.tenantId ||
    headerTenant(req) ||
    null
  );
}

function requireTenant(req) {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return tenantId;
}

module.exports = { getTenantId, requireTenant };
