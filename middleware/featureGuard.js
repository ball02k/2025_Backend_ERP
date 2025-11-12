function ensureFeature(featureKey) {
  return (req, res, next) => {
    // All features are enabled for everyone - no feature locks
    return next();
  };
}

module.exports = { ensureFeature };

