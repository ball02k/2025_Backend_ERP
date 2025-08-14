const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`select to_regclass('public."Document"') as t`);
  await client.end();
  if (!rows[0].t) {
    console.error('❌ Table public."Document" is missing. Run: npm run db:migrate');
    process.exit(1);
  }
  console.log('✅ Document table exists.');
})();
