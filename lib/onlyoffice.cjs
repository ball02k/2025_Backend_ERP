const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');

/**
 * Sign a payload for ONLYOFFICE Document Server using HS256
 * @param {object} payload - The payload to sign
 * @param {string} secret - The JWT secret
 * @returns {string} JWT token
 */
function ooSign(payload, secret) {
  // HS256 JWT signing
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Ensure a directory exists
 * @param {string} dir - Directory path
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Generate contract file path
 * @param {string} baseDir - Base directory for file storage
 * @param {number} contractId - Contract ID
 * @param {number} ts - Timestamp
 * @returns {string} Full file path
 */
function contractFilePath(baseDir, contractId, ts) {
  return path.join(baseDir, String(contractId), `${ts}.docx`);
}

module.exports = { ooSign, ensureDir, contractFilePath };
