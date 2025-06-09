import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create dummy user
  const user = await prisma.user.create({
    data: {
      name: 'Alice Foreman',
      email: 'alice@constructionerp.co.uk',
      role: 'Project Manager',
    },
  });

  // Create a client
  const client = await prisma.client.create({
    data: {
      name: 'BuildTech Ltd',
      registration_number: '12345678',
      vat_number: 'GB123456789',
      address_line1: '123 Scaffold Way',
      city: 'London',
      postcode: 'E2 3AB',
      country: 'UK',
      turnover: 2000000,
      website: 'https://buildtech.co.uk',
    },
  });

  // Create a project
  const project = await prisma.project.create({
    data: {
      project_code: 'BT-001',
      project_name: 'HQ Extension',
      status: 'In Progress',
      budget: 500000,
      client_id: client.id,
      project_manager: user.name,
    },
  });

  // Create a task
  await prisma.task.create({
    data: {
      name: 'Site Clearance',
      status: 'Pending',
      project_id: project.id,
      assignee_id: user.id,
      due_date: new Date(),
    },
  });

  // Create a CVR report
  await prisma.cVRReport.create({
    data: {
      project_id: project.id,
      actual_cost: 120000,
      forecast_cost: 480000,
      earned_value: 100000,
      comments: 'First cost update',
      created_by: user.id,
    },
  });

  // Create a general report
  await prisma.report.create({
    data: {
      title: 'Initial Site Review',
      type: 'Weekly Report',
      project_id: project.id,
      author_id: user.id,
      content: 'Site cleared, foundations underway.',
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
