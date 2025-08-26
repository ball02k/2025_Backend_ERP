function withTenant(where = {}, tenantId) {
  return { ...where, tenantId };
}

module.exports = { withTenant };
