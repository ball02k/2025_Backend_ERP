#!/usr/bin/env node
// Detect a working Postgres connection (preferring Unix sockets) and update .env
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function canConnect(url){
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch (e) {
    return false;
  } finally {
    try { await client.end(); } catch {}
  }
}

function readEnvFile(fp){
  if(!fs.existsSync(fp)) return '';
  return fs.readFileSync(fp, 'utf8');
}

function writeEnvVar(envText, key, value){
  const lines = envText.split(/\r?\n/);
  const out = [];
  let replaced = false;
  for(const line of lines){
    if(line.trim().startsWith(`${key}=`)){
      out.push(`${key}=${JSON.stringify(value)}`);
      replaced = true;
    } else {
      out.push(line);
    }
  }
  if(!replaced){ out.push(`${key}=${JSON.stringify(value)}`); }
  return out.join('\n');
}

(async () => {
  const envPath = path.join(process.cwd(), '.env');
  const envText = readEnvFile(envPath);

  // Extract current values if present
  const match = envText.match(/^DATABASE_URL=(.*)$/m);
  const currentUrl = match ? JSON.parse(match[1]) : null;

  const user = process.env.PGUSER || process.env.USER || 'postgres';
  const db = 'construction_erp_vnext';
  const schema = 'public';

  const candidates = [];
  // Try current first
  if (currentUrl) candidates.push(currentUrl);
  // Socket paths
  for (const sock of ['/tmp', '/var/run/postgresql']){
    candidates.push(`postgresql://${user}@localhost/${db}?host=${encodeURIComponent(sock)}&schema=${schema}`);
  }
  // Fallback TCP (no password)
  candidates.push(`postgresql://${user}@localhost:5432/${db}?schema=${schema}`);

  let working = null;
  for (const url of candidates){
    /* eslint-disable no-await-in-loop */
    if (await canConnect(url)) { working = url; break; }
  }

  if (!working) {
    console.error('No working Postgres connection found. Try setting DATABASE_URL manually.');
    process.exit(2);
  }

  // Derive shadow DB URL using same transport
  const shadow = working.replace(/\/[^/?#]+(\?[^#]*)?$/, '/postgres$1').replace(/(\?|$)/, '?');
  const shadowURL = shadow.includes('schema=') ? shadow.replace(/([?&])schema=[^&]*/,'').replace(/[?&]$/,'') : shadow;

  let updated = envText;
  updated = writeEnvVar(updated, 'DATABASE_URL', working);
  updated = writeEnvVar(updated, 'PRISMA_MIGRATE_SHADOW_DATABASE_URL', shadowURL);

  fs.writeFileSync(envPath, updated);
  console.log('✅ Updated .env with working DATABASE_URL');
  console.log('DATABASE_URL=', working);
  console.log('PRISMA_MIGRATE_SHADOW_DATABASE_URL=', shadowURL);
})();

