function truthyEnv(val) {
  if (val == null) return false;
  const v = String(val).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isDevEnv() {
  return process.env.NODE_ENV !== 'production';
}

// Unified dev-auth flag used across middleware and routes
function isDevAuthEnabled() {
  // Allow both historical names; never enable in production
  if (!isDevEnv()) return false;
  const flag = process.env.DEV_AUTH_BYPASS ?? process.env.ENABLE_DEV_AUTH;
  // Default: enabled in development; can be explicitly disabled by setting to '0'/'false'
  if (flag == null) return true;
  return truthyEnv(flag);
}

module.exports = { isDevAuthEnabled, isDevEnv, truthyEnv };

