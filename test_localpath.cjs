const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
function localPath(storageKey){ return path.join(UPLOAD_DIR, storageKey); }

const testKey = '1762427390948_ec824d70cc7c_budget_impro.csv';
const resolvedPath = localPath(testKey);

console.log('UPLOAD_DIR:', UPLOAD_DIR);
console.log('storageKey:', testKey);
console.log('resolvedPath:', resolvedPath);
console.log('File exists:', fs.existsSync(resolvedPath));

if (fs.existsSync(resolvedPath)) {
  const stats = fs.statSync(resolvedPath);
  console.log('File size:', stats.size, 'bytes');
} else {
  console.log('File NOT found at:', resolvedPath);
}
