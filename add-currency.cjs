const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "public"."Contract" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'GBP'`
  );
  console.log('✅ Added currency column');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
