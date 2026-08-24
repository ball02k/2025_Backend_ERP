#!/usr/bin/env node
const { spawnSync } = require('child_process');

const env = { ...process.env };

if (!env.PRISMA_MIGRATE_SHADOW_DATABASE_URL) {
  env.PRISMA_MIGRATE_SHADOW_DATABASE_URL = env.SHADOW_DATABASE_URL || env.DATABASE_URL || '';
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node scripts/prisma-env.cjs <prisma args...>');
  process.exit(1);
}

const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(bin, ['prisma', ...args], {
  stdio: 'inherit',
  env,
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
