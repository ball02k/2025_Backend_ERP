// Dev-only helper to expose feature flags via env for easy testing
// Set ENABLE_AFP=1 (or ENABLE_FINANCE=1) to allow AfP endpoints in development
module.exports = function devFeatures(req, _res, next) {
  try {
    if (process.env.NODE_ENV === 'development') {
      req.features = Object.assign({}, req.features);
      if (process.env.ENABLE_FINANCE === '1') req.features.finance = true;
      if (process.env.ENABLE_AFP === '1') req.features.afp = true;
    }
  } catch (_) {}
  next();
};

