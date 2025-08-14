import { execSync } from 'node:child_process';

execSync('npx prisma validate', { stdio: 'inherit' });
execSync('npx prisma generate', { stdio: 'inherit' });

function bad(pattern) {
  try {
    const out = execSync(
      `grep -RIn --exclude-dir=node_modules --exclude-dir=.git --exclude=prisma-preflight.yml --exclude=preflight.mjs "${pattern}" .`,
      { encoding: 'utf8' }
    );
    if (out.trim()) {
      console.error(out);
      return true;
    }
  } catch (err) {
    // grep exit 1 means "no matches" -> good
    if (err.status !== 1) throw err;
  }
  return false;
}

let BAD = false;
BAD ||= bad('new prisma\\.Prisma\\.Decimal');
BAD ||= bad('new\\s+PrismaClient\\.Prisma\\.Decimal');

if (BAD) {
  console.error(
    'Do NOT use new prisma.Prisma.Decimal or PrismaClient.Prisma.Decimal — import { Prisma } and use new Prisma.Decimal or the dec() helper.'
  );
  process.exit(1);
}

console.log('✅ preflight passed');
