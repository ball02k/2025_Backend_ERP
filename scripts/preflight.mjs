import { execSync } from 'node:child_process';
import { accessSync } from 'node:fs';

execSync('npx prisma validate', { stdio: 'inherit' });
execSync('npx prisma generate', { stdio: 'inherit' });

try {
  const out = execSync("grep -R --line-number 'new prisma\\.Prisma\\.Decimal' routes prisma", { encoding: 'utf8' });
  if (out.trim()) {
    console.error(out);
    console.error('Do not use new prisma.Prisma.Decimal — import { Prisma } and use new Prisma.Decimal or helper.');
    process.exit(1);
  }
} catch (err) {
  if (err.status !== 1) throw err;
}

accessSync('prisma/schema.prisma');
