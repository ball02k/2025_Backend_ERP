/**
 * Seed data for Approval Framework
 *
 * Creates:
 * - Approval thresholds for Packages, Contracts, Variations, and Payment Applications
 * - Project role assignments for demo projects
 * - User personas for approval capabilities
 *
 * Run with: node prisma/seed-approval-framework.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = process.env.TENANT_DEFAULT || 'demo';

async function main() {
  console.log('[Approval Framework Seed] Starting...');
  console.log(`[Approval Framework Seed] Tenant: ${TENANT_ID}`);

  // 1. Create Tenant Settings
  console.log('\n[1/4] Creating tenant settings...');

  const tenantSettings = await prisma.tenantSettings.upsert({
    where: { tenantId: TENANT_ID },
    update: {},
    create: {
      tenantId: TENANT_ID,
      modulesEnabled: {
        tenders: true,
        directAwards: true,
        internalAllocation: false,
        approvals: true
      },
      notificationDefaults: {
        approvalRequested: true,
        approvalGranted: true,
        approvalRejected: true,
        approvalOverdue: true
      },
      documentRetentionDays: 2555,
      companyName: 'Demo Construction Ltd',
      companyEmail: 'info@democonstruction.com'
    }
  });

  console.log(`✅ Tenant settings created: ${tenantSettings.id}`);

  // 2. Create Approval Thresholds
  console.log('\n[2/4] Creating approval thresholds...');

  const thresholds = [
    // PACKAGE thresholds
    {
      entityType: 'PACKAGE',
      name: 'Small Works Package',
      minValue: 0,
      maxValue: 50000,
      sequence: 1,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' }
      ],
      targetApprovalDays: 3,
      description: 'Packages under £50k - Two-stage approval'
    },
    {
      entityType: 'PACKAGE',
      name: 'Medium Value Package',
      minValue: 50000,
      maxValue: 250000,
      sequence: 2,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' },
        { stage: 3, role: 'PROJECT_MANAGER', required: true, description: 'Project Manager approval' }
      ],
      targetApprovalDays: 5,
      requiresRiskAssessment: true,
      description: 'Packages £50k - £250k - Three-stage approval with risk assessment'
    },
    {
      entityType: 'PACKAGE',
      name: 'High Value Package',
      minValue: 250000,
      maxValue: 1000000,
      sequence: 3,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' },
        { stage: 3, role: 'PROJECT_MANAGER', required: true, description: 'Project Manager approval' },
        { stage: 4, role: 'PROJECT_DIRECTOR', required: true, description: 'Project Director approval' }
      ],
      targetApprovalDays: 7,
      requiresRiskAssessment: true,
      requiresDesignReview: true,
      description: 'Packages £250k - £1M - Four-stage approval with risk and design review'
    },
    {
      entityType: 'PACKAGE',
      name: 'Major Package',
      minValue: 1000000,
      maxValue: null,
      sequence: 4,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' },
        { stage: 3, role: 'PROJECT_MANAGER', required: true, description: 'Project Manager approval' },
        { stage: 4, role: 'PROJECT_DIRECTOR', required: true, description: 'Project Director approval' },
        { stage: 5, role: 'CLIENT_REPRESENTATIVE', required: true, description: 'Client approval' }
      ],
      targetApprovalDays: 10,
      requiresRiskAssessment: true,
      requiresDesignReview: true,
      requiresClientApproval: true,
      description: 'Packages over £1M - Five-stage approval with client sign-off'
    },

    // CONTRACT thresholds
    {
      entityType: 'CONTRACT',
      name: 'Standard Contract',
      minValue: 0,
      maxValue: 500000,
      sequence: 1,
      approvalSteps: [
        { stage: 1, role: 'CONTRACTS_MANAGER', required: true, description: 'Contracts Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' }
      ],
      targetApprovalDays: 5,
      description: 'Contracts under £500k'
    },
    {
      entityType: 'CONTRACT',
      name: 'Major Contract',
      minValue: 500000,
      maxValue: null,
      sequence: 2,
      approvalSteps: [
        { stage: 1, role: 'CONTRACTS_MANAGER', required: true, description: 'Contracts Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' },
        { stage: 3, role: 'PROJECT_DIRECTOR', required: true, description: 'Project Director approval' }
      ],
      targetApprovalDays: 7,
      requiresClientApproval: true,
      description: 'Contracts over £500k - Requires director approval'
    },

    // VARIATION thresholds
    {
      entityType: 'VARIATION',
      name: 'Minor Variation',
      minValue: 0,
      maxValue: 10000,
      sequence: 1,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager approval' }
      ],
      targetApprovalDays: 2,
      description: 'Variations under £10k - Single approval'
    },
    {
      entityType: 'VARIATION',
      name: 'Standard Variation',
      minValue: 10000,
      maxValue: 50000,
      sequence: 2,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' }
      ],
      targetApprovalDays: 3,
      description: 'Variations £10k - £50k'
    },
    {
      entityType: 'VARIATION',
      name: 'Significant Variation',
      minValue: 50000,
      maxValue: null,
      sequence: 3,
      approvalSteps: [
        { stage: 1, role: 'PACKAGE_MANAGER', required: true, description: 'Package Manager review' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial Manager approval' },
        { stage: 3, role: 'PROJECT_MANAGER', required: true, description: 'Project Manager approval' }
      ],
      targetApprovalDays: 5,
      requiresClientApproval: true,
      description: 'Variations over £50k - Requires PM and client approval'
    },

    // PAYMENT_APPLICATION thresholds
    {
      entityType: 'PAYMENT_APPLICATION',
      name: 'Standard Payment',
      minValue: 0,
      maxValue: 100000,
      sequence: 1,
      approvalSteps: [
        { stage: 1, role: 'QS_COST_MANAGER', required: true, description: 'QS assessment' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial approval' }
      ],
      targetApprovalDays: 3,
      description: 'Payment applications under £100k'
    },
    {
      entityType: 'PAYMENT_APPLICATION',
      name: 'Large Payment',
      minValue: 100000,
      maxValue: null,
      sequence: 2,
      approvalSteps: [
        { stage: 1, role: 'QS_COST_MANAGER', required: true, description: 'QS assessment' },
        { stage: 2, role: 'COMMERCIAL_MANAGER', required: true, description: 'Commercial approval' },
        { stage: 3, role: 'PROJECT_DIRECTOR', required: true, description: 'Director sign-off' }
      ],
      targetApprovalDays: 5,
      description: 'Payment applications over £100k - Requires director approval'
    }
  ];

  let createdCount = 0;
  for (const threshold of thresholds) {
    const created = await prisma.approvalThreshold.create({
      data: {
        tenantId: TENANT_ID,
        ...threshold
      }
    });
    console.log(`✅ Created threshold: ${created.entityType} - ${created.name}`);
    createdCount++;
  }

  console.log(`\n✅ Created ${createdCount} approval thresholds`);

  // 3. Create Project Roles for demo projects
  console.log('\n[3/4] Creating project role assignments...');

  // Get demo projects
  const projects = await prisma.project.findMany({
    where: { tenantId: TENANT_ID },
    take: 3
  });

  if (projects.length === 0) {
    console.log('⚠️  No projects found - skipping role assignments');
  } else {
    // Get demo users
    const users = await prisma.user.findMany({
      where: { tenantId: TENANT_ID },
      take: 5
    });

    if (users.length === 0) {
      console.log('⚠️  No users found - skipping role assignments');
    } else {
      let roleCount = 0;
      const roleTypes = [
        'PROJECT_MANAGER',
        'COMMERCIAL_MANAGER',
        'PACKAGE_MANAGER',
        'QS_COST_MANAGER',
        'CONTRACTS_MANAGER'
      ];

      for (const project of projects) {
        // Assign key roles to different users
        for (let i = 0; i < Math.min(roleTypes.length, users.length); i++) {
          const role = roleTypes[i];
          const user = users[i];

          try {
            await prisma.projectRole.create({
              data: {
                projectId: project.id,
                userId: user.id,
                role,
                canApprovePackages: true,
                canApproveContracts: true,
                canApproveVariations: true,
                canApprovePayments: ['COMMERCIAL_MANAGER', 'QS_COST_MANAGER'].includes(role),
                receiveNotifications: true,
                notificationPreference: 'EMAIL_AND_IN_APP',
                isActive: true
              }
            });
            console.log(`✅ Assigned ${role} to user ${user.email} on project ${project.name}`);
            roleCount++;
          } catch (error) {
            // Might already exist - skip
            console.log(`⚠️  Role ${role} already assigned on project ${project.name}`);
          }
        }
      }

      console.log(`\n✅ Created ${roleCount} project role assignments`);
    }
  }

  // 4. Create User Personas
  console.log('\n[4/4] Creating user personas...');

  const users = await prisma.user.findMany({
    where: { tenantId: TENANT_ID },
    take: 5
  });

  if (users.length === 0) {
    console.log('⚠️  No users found - skipping personas');
  } else {
    let personaCount = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const personaConfigs = [
        {
          persona: 'PROJECT_MANAGER',
          isPrimary: i === 0,
          canLead: true,
          canApprove: true,
          maxApprovalValue: 500000
        },
        {
          persona: 'COMMERCIAL_MANAGER',
          isPrimary: i === 1,
          canLead: true,
          canApprove: true,
          maxApprovalValue: 1000000
        },
        {
          persona: 'PACKAGE_MANAGER',
          isPrimary: i === 2,
          canLead: false,
          canApprove: true,
          maxApprovalValue: 100000
        }
      ];

      const config = personaConfigs[Math.min(i, personaConfigs.length - 1)];

      try {
        await prisma.userPersona.create({
          data: {
            userId: user.id,
            ...config
          }
        });
        console.log(`✅ Created persona ${config.persona} for user ${user.email}`);
        personaCount++;
      } catch (error) {
        // Might already exist
        console.log(`⚠️  Persona already exists for user ${user.email}`);
      }
    }

    console.log(`\n✅ Created ${personaCount} user personas`);
  }

  console.log('\n🎉 Approval Framework seed completed!');
  console.log('\nSummary:');
  console.log('- Tenant settings configured');
  console.log(`- ${createdCount} approval thresholds created`);
  console.log('- Project roles assigned to demo projects');
  console.log('- User personas created');
  console.log('\nYou can now:');
  console.log('1. Create packages/contracts and see them routed for approval');
  console.log('2. View pending approvals at GET /api/approvals/pending');
  console.log('3. Manage thresholds at /api/settings/approvals/thresholds');
  console.log('4. Assign project roles at /api/projects/:id/roles');
}

main()
  .catch((e) => {
    console.error('Error seeding approval framework:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
