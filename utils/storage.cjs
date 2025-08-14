const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function makeStorageKey(fileName='file.bin'){
  const safe = String(fileName).replace(/[^\w.\-]/g,'_').slice(0,180);
  return `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${safe}`;
}
function signKey(storageKey, secret = process.env.UPLOAD_TOKEN_SECRET || 'dev-secret'){
  return crypto.createHmac('sha256', secret).update(storageKey).digest('hex');
}
function verifyKey(storageKey, token, secret = process.env.UPLOAD_TOKEN_SECRET || 'dev-secret'){
  try {
    const good = signKey(storageKey, secret);
    return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(token||''));
  } catch { return false; }
}
function localPath(storageKey){ return path.join(UPLOAD_DIR, storageKey); }

async function writeLocalStream(req, storageKey){
  const dest = localPath(storageKey);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest, { flags: 'w' });
    let size = 0;
    req.on('data', chunk => { size += chunk.length; });
    req.pipe(ws);
    ws.on('finish', ()=> resolve({ size, path: dest }));
    ws.on('error', reject);
    req.on('error', reject);
  });
}

module.exports = { makeStorageKey, signKey, verifyKey, writeLocalStream, localPath };
