const crypto = require('crypto');

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJSON(obj) {
  return b64url(JSON.stringify(obj));
}

function sign(payload, secret, opts = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = opts.expiresIn ? now + opts.expiresIn : undefined;
  const body = { ...payload, ...(exp ? { exp } : {}) };
  const data = `${b64urlJSON(header)}.${b64urlJSON(body)}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${sig}`;
}

function verify(token, secret) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('Invalid token');
  const check = crypto
    .createHmac('sha256', secret)
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  if (check !== s) throw new Error('Bad signature');
  const payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Expired');
  return payload;
}

module.exports = { sign, verify };

