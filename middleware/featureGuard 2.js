function ensureFeature(featureKey) {
  return (req, res, next) => {
    try {
      const features = (req.features) || (req.tenant?.features) || {};
      if (features && (features[featureKey] === true || features.finance === true)) return next();
    } catch (_) {}
    return res.status(403).json({ message: "This feature is not enabled for your plan.", code: "FEATURE_LOCKED" });
  };
}

module.exports = { ensureFeature };

