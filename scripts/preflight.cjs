const { execSync } = require('node:child_process');

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run('npx prisma validate && npx prisma generate');

  // grep guard
  try {
    execSync(
      "grep -R \"new prisma\\.Prisma\\.Decimal\" -n " +
        "--include='*.js' " +
        "--include='*.cjs' " +
        "--include='*.mjs' " +
        "--include='*.ts' .",
      { stdio: 'pipe' }
    );
    console.error(
      'Do not use new prisma.Prisma.' +
        'Decimal — use new Prisma.Decimal'
    );
    process.exit(1);
  } catch {
    // grep returned non-zero: OK (not found)
  }

  // Optional smokes (assumes dev server running on :3001)
  if (process.env.RUN_SMOKES === '1') {
    run('node scripts/variations-smoke.mjs');
    run('npm run smoke:docs');
    // New module smokes
    run('npm run smoke:rfis');
    run('npm run smoke:qa');
    run('npm run smoke:hs');
    run('npm run smoke:carbon');
  }
  console.log('Preflight OK');
} catch (e) {
  process.exit(1);
}
