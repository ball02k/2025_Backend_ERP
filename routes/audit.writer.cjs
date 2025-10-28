const { writeAudit: writeAuditLog } = require('./audit.cjs');
const { getTenantId } = require('../lib/tenant');

async function writeAudit(req, payload) {
  const tenantId = getTenantId(req);
  const userId = req.user?.id || null;
  await writeAuditLog({ ...payload, tenantId, userId });
}

module.exports = { writeAudit };
