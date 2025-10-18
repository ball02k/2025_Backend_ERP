// lib/logger.cjs
const { randomUUID } = require('crypto');

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function withReqId(req, _res, next) {
  req._rid = req._rid || randomUUID().slice(0, 8);
  log(`[REQ ${req._rid}] ${req.method} ${req.originalUrl}`);
  next();
}

function onFinish(req, res, next) {
  res.on('finish', () => {
    log(`[RES ${req._rid}] ${res.statusCode} ${req.method} ${req.originalUrl}`);
  });
  next();
}

module.exports = { log, withReqId, onFinish };
