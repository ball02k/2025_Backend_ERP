const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Companies
  const company1 = await prisma.company.create({
    data: {
      name: "BuildCorp Ltd",
      registration_number: "12345678",
      industry: "Construction",
    },
  });

  const company2 = await prisma.company.create({
    data: {
      name: "DevBuild Ltd",
      registration_number: "87654321",
      industry: "Construction",
    },
  });

  // Users
  const user1 = await prisma.user.create({
    data: {
      name: "Alice Manager",
      email: "alice@example.com",
      role: "Admin",
      company_id: company1.id,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      name: "Bob Surveyor",
      email: "bob@example.com",
      role: "QS",
      company_id: company2.id,
    },
  });

  // Clients
  const client1 = await prisma.client.create({
    data: {
      name: "Client A",
      registration_number: "CL001",
    },
  });

  const client2 = await prisma.client.create({
    data: {
      name: "Client B",
      registration_number: "CL002",
    },
  });

  // Project
  const project = await prisma.project.create({
    data: {
      project_code: "PRJ001",
      project_name: "Office Build",
      status: "Active",
      client: { connect: { id: client1.id } },
      project_manager_id: user1.id,
      budget: 1000000,
      start_date: new Date(),
    },
  });

  // Milestone
  await prisma.milestone.create({
    data: {
      title: "Groundwork Complete",
      status: "Planned",
      project_id: project.id,
      due_date: new Date(),
    },
  });

  // Task
  const task = await prisma.task.create({
    data: {
      project_id: project.id,
      name: "Excavate site",
      description: "Dig foundation trenches",
      status: "In Progress",
      assignee_id: user2.id,
      created_by_id: user1.id,
      due_date: new Date(),
    },
  });

  // Subtask
  await prisma.subtask.create({
    data: {
      title: "Hire excavator",
      task_id: task.id,
    },
  });

  // Comment
  await prisma.comment.create({
    data: {
      text: "Need bigger excavator",
      task_id: task.id,
      user_id: user2.id,
    },
  });

  // Supplier
  const supplier = await prisma.supplier.create({
    data: {
      name: "Concrete Supply Co",
      email: "supplier@example.com",
      approval_status: "Approved",
    },
  });

  // Procurement
  await prisma.procurement.create({
    data: {
      project_id: project.id,
      supplier_id: supplier.id,
      item_description: "Concrete batch",
      quantity: 100,
      unit_price: 50,
      status: "Pending",
    },
  });

  // Compliance Record
  await prisma.complianceRecord.create({
    data: {
      supplier_id: supplier.id,
      type: "Insurance",
      expiry_date: new Date(),
      document_url: "http://example.com/insurance.pdf",
    },
  });

  // Cost Entry
  await prisma.costEntry.create({
    data: {
      project_id: project.id,
      category: "Materials",
      amount: 5000,
      description: "Concrete purchase",
      approved_by: user1.id,
    },
  });

  // CVR Report
  await prisma.cvrReport.create({
    data: {
      project_id: project.id,
      actual_cost: 5000,
      forecast_cost: 20000,
      created_by: user1.id,
    },
  });

  // Report
  await prisma.report.create({
    data: {
      project_id: project.id,
      type: "Weekly",
      title: "Week 1 report",
      author_id: user1.id,
    },
  });

  // File
  await prisma.file.create({
    data: {
      filename: "drawing.pdf",
      url: "http://example.com/drawing.pdf",
      file_type: "PDF",
      uploaded_by: user2.id,
      project_id: project.id,
    },
  });

  // Project team member
  await prisma.projectTeamMember.create({
    data: {
      project_id: project.id,
      user_id: user2.id,
      role: "Site Manager",
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: "Create",
      table_name: "Project",
      record_id: project.id,
      user_id: user1.id,
      changes: {},
    },
  });

  // AI Alert
  await prisma.aIAlert.create({
    data: {
      type: "Cost Overrun",
      description: "Project is over budget",
      related_project_id: project.id,
      severity: "Warning",
    },
  });

  console.log("✅ Seeded ERP data");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
