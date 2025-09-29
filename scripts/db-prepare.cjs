#!/usr/bin/env node
// Prepares local Homebrew Postgres for Prisma by setting a known password
// and creating the target database if it does not exist.
// Connects via local Unix socket as the current macOS user.

const { Client } = require('pg');

async function main() {
  const user = process.env.USER || process.env.LOGNAME || 'postgres';
  const targetDb = process.env.TARGET_DB || 'construction_erp_vnext';
  const setPassword = process.env.PG_SET_PASSWORD || 'Ellie123!';

  const client = new Client({
    host: '/tmp',
    user,
    database: 'postgres',
  });

  await client.connect();
  console.log(`Connected to Postgres via socket as ${user}`);

  // Ensure postgres role exists and set password
  await client.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
         CREATE ROLE postgres LOGIN SUPERUSER;
       END IF;
     END
     $$;`
  );
  await client.query(`ALTER ROLE postgres WITH PASSWORD $1;`, [setPassword]);
  await client.query(`ALTER ROLE postgres WITH CREATEDB CREATEROLE;`);
  console.log('Ensured postgres role and updated password.');

  // Create target database if missing
  await client
    .query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDb])
    .then(async (res) => {
      if (res.rowCount === 0) {
        await client.query(`CREATE DATABASE ${targetDb};`);
        console.log(`Created database ${targetDb}.`);
      } else {
        console.log(`Database ${targetDb} already exists.`);
      }
    });

  await client.end();
  console.log('DB preparation complete.');
}

main().catch((e) => {
  console.error('DB preparation failed:', e.message);
  process.exit(1);
});

