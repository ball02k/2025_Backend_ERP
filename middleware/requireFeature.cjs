// middleware/requireFeature.cjs
// Simple feature gating. Honors either user-bound features (req.user.features)
// or process.env.FEATURE_FLAGS (JSON string), defaulting to enabled.

function getFlagSet() {
  try {
    const env = process.env.FEATURE_FLAGS;
    return env ? JSON.parse(env) : {};
  } catch (_) {
    return {};
  }
}

function hasFeature(req, key) {
  // Prefer user-provided features if present
  const uf = (req.user && (req.user.features || req.user.featureFlags)) || null;
  if (uf && Object.prototype.hasOwnProperty.call(uf, key)) {
    return Boolean(uf[key]);
  }
  const flags = getFlagSet();
  if (Object.prototype.hasOwnProperty.call(flags, key)) {
    return Boolean(flags[key]);
  }
  // default allow
  return true;
}

function requireFeature(key) {
  return (req, res, next) => {
    if (!hasFeature(req, key)) return res.status(403).json({ error: 'FEATURE_DISABLED', feature: key });
    next();
  };
}

module.exports = { requireFeature, hasFeature };

