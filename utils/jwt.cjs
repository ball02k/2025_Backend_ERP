const crypto = require('crypto');

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function parseExpiry(expiresIn) {
  if (typeof expiresIn === 'number') return expiresIn;
  if (typeof expiresIn === 'string') {
    const m = expiresIn.match(/^(\d+)([smhd])$/);
    if (m) {
      const v = Number(m[1]);
      const unit = m[2];
      return unit === 's'
        ? v
        : unit === 'm'
        ? v * 60
        : unit === 'h'
        ? v * 3600
        : unit === 'd'
        ? v * 86400
        : 0;
    }
  }
  return 0;
}

function sign(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const expSec = options.expiresIn ? parseExpiry(options.expiresIn) : 0;
  const body = {
    ...payload,
    ...(expSec ? { exp: Math.floor(Date.now() / 1000) + expSec } : {}),
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function verify(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid signature');
  }
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new Error('Token expired');
  }
  return payload;
}

module.exports = { sign, verify };

