// prisma/seed-dev-user.cjs
// Seed script to create the dev user for authentication system

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding dev user...');

  const email = 'dev@erp.com';
  const password = 'DevPass123!';
  const name = 'Dev User';
  const role = 'dev';
  const tenantId = 'demo';

  // Check if dev user already exists
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log(`✓ Dev user already exists: ${email}`);

    // Update password if needed (useful for testing)
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { email },
      data: {
        passwordSHA: hashedPassword,
        role,
        isActive: true,
      },
    });
    console.log(`✓ Dev user password updated`);
    return;
  }

  // Hash password with bcrypt
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create dev user
  const devUser = await prisma.user.create({
    data: {
      email,
      name,
      passwordSHA: hashedPassword,
      role,
      tenantId,
      isActive: true,
    },
  });

  console.log(`✓ Dev user created successfully:`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role: ${role}`);
  console.log(`  ID: ${devUser.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding dev user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
