/**
 * Upgrade All Users to Superadmin (dev role)
 *
 * Updates all existing users to have the 'dev' role which grants full access to everything.
 * This ensures all users (past and future) have unrestricted access to the platform.
 *
 * Run with: node scripts/upgrade-all-to-superadmin.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[Superadmin Upgrade] Starting...');

  try {
    // Get count of users who need upgrading
    const usersToUpgrade = await prisma.user.count({
      where: {
        role: {
          in: ['user', 'admin'] // Upgrade both 'user' and legacy 'admin' to 'dev'
        }
      }
    });

    if (usersToUpgrade === 0) {
      console.log('✅ No users need upgrading - all users already have superadmin access!');
      return;
    }

    console.log(`Found ${usersToUpgrade} users to upgrade to superadmin (dev) role...`);

    // Update all users to 'dev' role
    const result = await prisma.user.updateMany({
      where: {
        role: {
          in: ['user', 'admin']
        }
      },
      data: {
        role: 'dev'
      }
    });

    console.log(`✅ Successfully upgraded ${result.count} users to superadmin (dev) role!`);
    console.log('\n🎉 All users now have full access to the entire platform!');
    console.log('\nSuperadmin (dev) role permissions:');
    console.log('  - Full access to all modules');
    console.log('  - Full access to all settings');
    console.log('  - Full access to all projects');
    console.log('  - Full access to all approvals');
    console.log('  - Full access to all data');
    console.log('  - Can do everything and anything');
    console.log('\nAll future signups will automatically get this role.');

  } catch (error) {
    console.error('❌ Error upgrading users:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
