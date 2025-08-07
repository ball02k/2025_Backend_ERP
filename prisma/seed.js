const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Companies
  const company1 = await prisma.company.create({
    data: {
      name: "BuildCorp Ltd",
      registration_number: "12345678",
      vat_number: "VAT123456",
      industry: "Construction",
      address_line1: "1 Builder St",
      address_line2: "Suite 100",
      city: "Buildtown",
      postcode: "BC1 2DE",
      country: "UK",
      website: "https://buildcorp.example.com",
      logo_url: "https://example.com/logo1.png",
    },
  });

  const company2 = await prisma.company.create({
    data: {
      name: "DevBuild Ltd",
      registration_number: "87654321",
      vat_number: "VAT876543",
      industry: "Construction",
      address_line1: "2 Developer Rd",
      address_line2: "Floor 3",
      city: "Devville",
      postcode: "DV4 5GH",
      country: "UK",
      website: "https://devbuild.example.com",
      logo_url: "https://example.com/logo2.png",
    },
  });

  // Users
  const user1 = await prisma.user.create({
    data: {
      name: "Alice Manager",
      email: "alice@example.com",
      phone_number: "123-456-7890",
      role: "Admin",
      permissions: { access: "all" },
      company_id: company1.id,
      is_active: true,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      name: "Bob Surveyor",
      email: "bob@example.com",
      phone_number: "555-123-4567",
      role: "QS",
      permissions: { access: "limited" },
      company_id: company2.id,
      is_active: true,
    },
  });

  // Clients
  const client1 = await prisma.client.create({
    data: {
      name: "Client A",
      registration_number: "CL001",
      vat_number: "VATCL001",
      address_line1: "100 Client St",
      address_line2: "Apt 1",
      city: "Clientville",
      postcode: "CL1 2AA",
      country: "UK",
      address: { line1: "100 Client St", city: "Clientville" },
      turnover: 5000000,
      website: "https://clienta.example.com",
      industry: "Healthcare",
      logo_url: "https://example.com/clienta.png",
    },
  });

  const client2 = await prisma.client.create({
    data: {
      name: "Client B",
      registration_number: "CL002",
      vat_number: "VATCL002",
      address_line1: "200 Client Rd",
      address_line2: "Suite 5",
      city: "Clientcity",
      postcode: "CL3 4BB",
      country: "UK",
      address: { line1: "200 Client Rd", city: "Clientcity" },
      turnover: 3000000,
      website: "https://clientb.example.com",
      industry: "Retail",
      logo_url: "https://example.com/clientb.png",
    },
  });

  // Project
  const project = await prisma.project.create({
    data: {
      project_code: "PRJ001",
      project_name: "Office Build",
      description: "HQ office construction",
      status: "Active",
      client: { connect: { id: client1.id } },
      project_manager: "Alice Manager",
      project_manager_id: user1.id,
      quantity_surveyor: "Bob Surveyor",
      type: "Construction",
      location: "London",
      address_line1: "1 Project Way",
      address_line2: "Site Office",
      city: "London",
      postcode: "LN1 4AB",
      country: "UK",
      address: { line1: "1 Project Way", city: "London" },
      budget: 1000000,
      actual_spend: 10000,
      priority_label: "High Priority",
      milestone_summary: "Initial phase",
      project_tags: ["office", "build"],
      currency: "GBP",
      contract_type: "Design & Build",
      procurement_route: "Standard",
      sector: "Commercial",
      work_stage: "Planning",
      risk_level: "Medium",
      carbon_target: 1000,
      carbon_measured: 100,
      progress_pct: 10,
      is_flagged: false,
      team_notes: "Kickoff complete",
      start_date: new Date(),
      end_date: new Date(),
      estimated_completion_date: new Date(),
      actual_completion_date: null,
    },
  });

  // Milestone
  await prisma.milestone.create({
    data: {
      title: "Groundwork Complete",
      status: "Planned",
      project_id: project.id,
      due_date: new Date(),
      completed_at: null,
    },
  });

  // Task
  const task = await prisma.task.create({
    data: {
      project_id: project.id,
      name: "Excavate site",
      description: "Dig foundation trenches",
      status: "In Progress",
      priority: "High",
      assignee_id: user2.id,
      created_by_id: user1.id,
      due_date: new Date(),
    },
  });

  // Subtask
  await prisma.subtask.create({
    data: {
      title: "Hire excavator",
      completed: false,
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
      phone: "555-888-9999",
      category: "Materials",
      registration_number: "SUP123",
      vat_number: "VATSUP123",
      approval_status: "Approved",
      risk_rating: "Low",
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
      delivery_date: new Date(),
      status: "Pending",
      approved_by: user1.id,
    },
  });

  // Compliance Record
  await prisma.complianceRecord.create({
    data: {
      supplier_id: supplier.id,
      type: "Insurance",
      expiry_date: new Date(),
      document_url: "http://example.com/insurance.pdf",
      verified_by: user1.id,
    },
  });

  // Cost Entry
  await prisma.costEntry.create({
    data: {
      project_id: project.id,
      category: "Materials",
      amount: 5000,
      description: "Concrete purchase",
      date_incurred: new Date(),
      approved_by: user1.id,
      invoice_ref: "INV-001",
    },
  });

  // CVR Report
  await prisma.cvrReport.create({
    data: {
      project_id: project.id,
      period_start: new Date(),
      period_end: new Date(),
      actual_cost: 5000,
      forecast_cost: 20000,
      earned_value: 4500,
      adjustments: {},
      comments: "Initial spend",
      created_by: user1.id,
    },
  });

  // Report
  await prisma.report.create({
    data: {
      project_id: project.id,
      type: "Weekly",
      title: "Week 1 report",
      content: "Everything is on track",
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
      task_id: task.id,
    },
  });

  // Project team member
  await prisma.projectTeamMember.create({
    data: {
      project_id: project.id,
      user_id: user2.id,
      role: "Site Manager",
      joined_at: new Date(),
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: "Create",
      table_name: "Project",
      record_id: project.id,
      user_id: user1.id,
      changes: { created: true },
    },
  });

  // AI Alert
  await prisma.aIAlert.create({
    data: {
      type: "Cost Overrun",
      description: "Project is over budget",
      related_project_id: project.id,
      severity: "Warning",
      resolved: false,
    },
  });

  // -----------------------------
  // Extended modules dummy data
  // -----------------------------

  // Inventory items (see schema definition:contentReference[oaicite:0]{index=0})
  await prisma.inventory.createMany({
    data: [
      {
        project_id: project.id,
        sku: "INV001",
        name: "Cement (50kg bags)",
        description: "Portland cement",
        quantity: 100,
        unit: "bags",
        unit_price: 3.5,
        reorder_point: 20,
        location: "Warehouse A",
      },
      {
        project_id: project.id,
        sku: "INV002",
        name: "Steel bars",
        description: "Reinforcement bars 2m",
        quantity: 200,
        unit: "pieces",
        unit_price: 2.0,
        reorder_point: 30,
        location: "Warehouse B",
      },
    ],
  });

  // Carbon records:contentReference[oaicite:1]{index=1}
  await prisma.carbonRecord.createMany({
    data: [
      {
        project_id: project.id,
        source: "Diesel generator",
        value: 100,
        unit: "kgCO2",
        recorded_at: new Date(),
      },
      {
        project_id: project.id,
        source: "Transport vehicles",
        value: 50,
        unit: "kgCO2",
        recorded_at: new Date(),
      },
    ],
  });

  // Risk register entry:contentReference[oaicite:2]{index=2}
  await prisma.risk.create({
    data: {
      project_id: project.id,
      description: "Material delivery delay due to supply chain issues",
      probability: 0.2,
      impact: 0.4,
      owner: "Site Manager",
      mitigation: "Use multiple suppliers and order early",
      status: "Open",
    },
  });

  // Timeline event:contentReference[oaicite:3]{index=3}
  await prisma.timelineEvent.create({
    data: {
      project_id: project.id,
      title: "Site preparation completed",
      description: "Earthworks and leveling done",
      start_date: new Date(),
      end_date: new Date(),
      status: "Completed",
    },
  });

  // Health and safety record:contentReference[oaicite:4]{index=4}
  await prisma.healthSafetyRecord.create({
    data: {
      project_id: project.id,
      type: "Incident",
      description: "Minor cut during rebar handling",
      severity: "Low",
      occurred_at: new Date(),
      actions_taken: "First aid administered, toolbox talk held",
      status: "Resolved",
    },
  });

  // Tender and subcontractors:contentReference[oaicite:5]{index=5}:contentReference[oaicite:6]{index=6}
  const tender = await prisma.tender.create({
    data: {
      project_id: project.id,
      package: "Electrical Works",
      description: "Install wiring and lighting",
      status: "Open",
      open_date: new Date(),
      close_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // one week from now
      award_date: null,
      amount: 30000,
    },
  });

  await prisma.subcontractor.createMany({
    data: [
      {
        tender_id: tender.id,
        name: "ElectroFix Ltd",
        status: "Pending",
        email: "electrofix@example.com",
        phone: "555-111-2222",
        bid_amount: 28000,
        awarded: false,
      },
      {
        tender_id: tender.id,
        name: "BrightSparkers Inc",
        status: "Pending",
        email: "brightspark@example.com",
        phone: "555-333-4444",
        bid_amount: 32000,
        awarded: false,
      },
    ],
  });

  console.log("✅ Seeded ERP data (including extended modules)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
