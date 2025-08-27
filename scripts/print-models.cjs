/* eslint-disable no-console */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const dmmf = Prisma.dmmf;
  const models = dmmf?.datamodel?.models || [];
  if (!models.length) {
    console.error('No models found in Prisma DMMF. Try: npx prisma generate');
    process.exit(1);
  }
  console.log('Prisma models/fields:');
  for (const m of models) {
    console.log('\n- Model:', m.name);
    for (const f of m.fields) {
      const rel = f.kind === 'object' ? ` (rel → ${f.type})` : '';
      console.log(`   • ${f.name}: ${f.type} [${f.kind}]${rel}`);
    }
  }
  const delegates = Object.keys(prisma).filter(k => typeof prisma[k]?.findFirst === 'function');
  console.log('\nPrisma delegates on client:', delegates.join(', '));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
