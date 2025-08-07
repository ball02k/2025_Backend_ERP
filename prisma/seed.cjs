import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create companies, users and clients
  const company = await prisma.company.create({ data: { name: 'BuildCorp Ltd' } });
  const user    = await prisma.user.create({ data: { name: 'Alice Manager', email: 'alice@example.com', role: 'Admin', company_id: company.id } });
  const client  = await prisma.client.create({ data: { name: 'Client A' } });

  // Create a project with extended relations
  const project = await prisma.project.create({
    data: {
      project_code: 'PRJ001',
      project_name: 'Office Build',
      status: 'Active',
      client: { connect: { id: client.id } },
      project_manager: 'Alice Manager',
      project_manager_id: user.id,
      quantity_surveyor: 'QS Name',
      budget: 1_000_000,
      actual_spend: 10_000,
      // … any additional fields you want to populate …
    }
  });

  // Inventory examples:contentReference[oaicite:0]{index=0}:
  await prisma.inventory.createMany({
    data: [
      { project_id: project.id, sku: 'INV001', name: 'Cement (50kg bags)', quantity: 100, unit: 'bags', unit_price: 3.5 },
      { project_id: project.id, sku: 'INV002', name: 'Steel bars', quantity: 200, unit: 'pieces', unit_price: 2.0 }
    ]
  });

  // Carbon records:contentReference[oaicite:1]{index=1}:
  await prisma.carbonRecord.createMany({
    data: [
      { project_id: project.id, source: 'Diesel generator', value: 100, unit: 'kgCO₂', recorded_at: new Date() },
      { project_id: project.id, source: 'Transport vehicles', value: 50, unit: 'kgCO₂', recorded_at: new Date() }
    ]
  });

  // Risk register entries:contentReference[oaicite:2]{index=2}:
  await prisma.risk.create({
    data: {
      project_id: project.id,
      description: 'Material delivery delay',
      probability: 0.2,
      impact: 0.4,
      owner: 'Site Manager',
      mitigation: 'Use multiple suppliers',
      status: 'Open'
    }
  });

  // Timeline events:contentReference[oaicite:3]{index=3}:
  await prisma.timelineEvent.create({
    data: {
      project_id: project.id,
      title: 'Site preparation completed',
      start_date: new Date(),
      end_date: new Date(),
      status: 'Completed'
    }
  });

  // Health & Safety record:contentReference[oaicite:4]{index=4}:
  await prisma.healthSafetyRecord.create({
    data: {
      project_id: project.id,
      type: 'Incident',
      description: 'Minor cut during rebar handling',
      severity: 'Low',
      occurred_at: new Date(),
      actions_taken: 'First aid administered',
      status: 'Resolved'
    }
  });

  // Tender and subcontractors:contentReference[oaicite:5]{index=5}:contentReference[oaicite:6]{index=6}:
  const tender = await prisma.tender.create({
    data: {
      project_id: project.id,
      package: 'Electrical works',
      status: 'Open',
      open_date: new Date(),
      close_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      amount: 30_000
    }
  });

  await prisma.subcontractor.createMany({
    data: [
      { tender_id: tender.id, name: 'ElectroFix Ltd', bid_amount: 28_000, awarded: false },
      { tender_id: tender.id, name: 'BrightSparkers Inc', bid_amount: 32_000, awarded: false }
    ]
  });

  // Add any other models you need here (tasks, reports, files, etc.).
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
