// Simple seed script to create a Request (Tender) with RequestInvites for testing the Invites tab
// Run with: node prisma/seed-tender-invites-simple.cjs

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function generateUniqueResponseToken(tenantId, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = crypto.randomBytes(32).toString('hex');
    const existing = await prisma.requestInvite.findFirst({
      where: { tenantId, responseToken: token },
      select: { id: true }
    });
    if (!existing) return token;
    console.warn(`Token collision detected, retrying...`);
  }
  throw new Error('Failed to generate unique response token');
}

async function main() {
  console.log('🌱 Seeding tender with invites...\n');

  const tenantId = 'demo';
  const projectName = 'Demo Construction Project';
  const tenderTitle = 'Main Works Package Tender';

  // Create or get user
  let user = await prisma.user.findUnique({
    where: { email: 'admin@demo.com' },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        tenantId,
        email: 'admin@demo.com',
        passwordSHA: hashPassword('password123'),
        name: 'Admin User',
      },
    });
  }
  console.log(`✓ User: ${user.email} (ID: ${user.id})`);

  // Create or get project
  let project = await prisma.project.findUnique({
    where: { code: 'DEMO-PROJ-001' },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        tenantId,
        name: projectName,
        code: 'DEMO-PROJ-001',
        description: 'Demo project for testing tender invites',
        status: 'active',
      },
    });
  }
  console.log(`✓ Project: ${project.name} (ID: ${project.id})`);

  // Create or get suppliers
  const suppliers = [];

  let supplier1 = await prisma.supplier.findFirst({
    where: { tenantId, name: 'Acme Mechanical Ltd' },
  });
  if (!supplier1) {
    supplier1 = await prisma.supplier.create({
      data: {
        tenantId,
        name: 'Acme Mechanical Ltd',
        email: 'tenders+acme@example.com',
        phone: '+44 20 1234 5678',
        status: 'active',
      },
    });
  }
  suppliers.push(supplier1);
  console.log(`✓ Supplier: ${supplier1.name} (ID: ${supplier1.id})`);

  let supplier2 = await prisma.supplier.findFirst({
    where: { tenantId, name: 'Beta Electrical Services' },
  });
  if (!supplier2) {
    supplier2 = await prisma.supplier.create({
      data: {
        tenantId,
        name: 'Beta Electrical Services',
        email: 'tenders+beta@example.com',
        phone: '+44 20 8765 4321',
        status: 'active',
      },
    });
  }
  suppliers.push(supplier2);
  console.log(`✓ Supplier: ${supplier2.name} (ID: ${supplier2.id})`);

  let supplier3 = await prisma.supplier.findFirst({
    where: { tenantId, name: 'Gamma Plumbing Co' },
  });
  if (!supplier3) {
    supplier3 = await prisma.supplier.create({
      data: {
        tenantId,
        name: 'Gamma Plumbing Co',
        email: 'tenders+gamma@example.com',
        phone: '+44 20 5555 1234',
        status: 'active',
      },
    });
  }
  suppliers.push(supplier3);
  console.log(`✓ Supplier: ${supplier3.name} (ID: ${supplier3.id})`);

  // Create Request (Tender) - Simple minimal tender for testing invites
  let request = await prisma.request.findFirst({
    where: { tenantId, title: tenderTitle },
  });
  if (!request) {
    request = await prisma.request.create({
      data: {
        tenantId,
        title: tenderTitle,
        type: 'RFP',
        status: 'live',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        stage: 1,
        totalStages: 1,
      },
    });
  }
  console.log(`✓ Request (Tender): ${request.title} (ID: ${request.id})`);

  // Create RequestInvites with proper response tokens
  console.log('\n📧 Creating invites...');

  // Clear existing invites for this request to avoid duplicates
  await prisma.requestInvite.deleteMany({
    where: { tenantId, requestId: request.id },
  });

  const invite1 = await prisma.requestInvite.create({
    data: {
      tenantId,
      requestId: request.id,
      supplierId: supplier1.id,
      email: supplier1.email,
      supplierName: supplier1.name,
      contactFirstName: 'Jane',
      contactLastName: 'Doe',
      status: 'invited',
      responseToken: await generateUniqueResponseToken(tenantId),
    },
  });
  console.log(`  ✓ Invite: ${invite1.supplierName} - ${invite1.email} (${invite1.status})`);

  const invite2 = await prisma.requestInvite.create({
    data: {
      tenantId,
      requestId: request.id,
      supplierId: supplier2.id,
      email: supplier2.email,
      supplierName: supplier2.name,
      contactFirstName: 'John',
      contactLastName: 'Smith',
      status: 'responded',
      responseToken: await generateUniqueResponseToken(tenantId),
      respondedAt: new Date(),
    },
  });
  console.log(`  ✓ Invite: ${invite2.supplierName} - ${invite2.email} (${invite2.status})`);

  const invite3 = await prisma.requestInvite.create({
    data: {
      tenantId,
      requestId: request.id,
      supplierId: supplier3.id,
      email: supplier3.email,
      supplierName: supplier3.name,
      contactFirstName: 'Sarah',
      contactLastName: 'Johnson',
      status: 'invited',
      responseToken: await generateUniqueResponseToken(tenantId),
    },
  });
  console.log(`  ✓ Invite: ${invite3.supplierName} - ${invite3.email} (${invite3.status})`);

  // Manual invite (no supplierId)
  const invite4 = await prisma.requestInvite.create({
    data: {
      tenantId,
      requestId: request.id,
      supplierId: null,
      email: 'manual.supplier@example.com',
      supplierName: 'Delta Construction (Manual)',
      contactFirstName: 'Mike',
      contactLastName: 'Williams',
      status: 'invited',
      responseToken: await generateUniqueResponseToken(tenantId),
    },
  });
  console.log(`  ✓ Invite: ${invite4.supplierName} - ${invite4.email} (${invite4.status}) [MANUAL]`);

  console.log('\n✅ Seed complete!');
  console.log(`\n📝 Test this in your browser:`);
  console.log(`   Frontend: http://localhost:5173/tenders/${request.id}`);
  console.log(`   or:       http://localhost:5173/rfx/${request.id}`);
  console.log(`   Backend:  curl http://localhost:3001/api/rfx/${request.id}/invites`);
  console.log(`\n🎯 Request ID: ${request.id}`);
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
