const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATALOG_PATH = path.join(__dirname, '..', 'API_CATALOG.md');
const DELTA_PROMPT_PATH = path.join(__dirname, '..', 'scripts', '__last_delta.txt');

function getCatalogHash() {
  try {
    const content = fs.readFileSync(CATALOG_PATH);
    return crypto.createHash('sha1').update(content).digest('hex');
  } catch {
    return 'missing';
  }
}

function getDeltaPrompt() {
  try {
    return fs.readFileSync(DELTA_PROMPT_PATH, 'utf8');
  } catch {
    return 'missing';
  }
}

module.exports = {
  getCatalogHash,
  getDeltaPrompt,
  CATALOG_PATH,
  DELTA_PROMPT_PATH,
};
