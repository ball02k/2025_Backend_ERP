// prisma/seed.js (ESM)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.create({
    data: { name: 'BuildCorp Ltd', currency: 'GBP', timezone: 'Europe/London' }
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Alice Manager',
      email: 'alice@example.com',
      role: 'Admin',
      company_id: company.id,
      is_active: true
    }
  });

  const qs = await prisma.user.create({
    data: {
      name: 'Bob QS',
      email: 'bob@example.com',
      role: 'QS',
      company_id: company.id,
      is_active: true
    }
  });

  const clientA = await prisma.client.create({
    data: {
      name: 'Client A',
      website: 'https://clienta.example.com',
      industry: 'Commercial',
      company_id: company.id
    }
  });

  const project = await prisma.project.create({
    data: {
      company_id: company.id,
      client: { connect: { id: clientA.id } },
      project_code: 'PRJ001',
      project_name: 'Office Build',
      description: 'HQ office construction',
      status: 'Active',
      contract_type: 'NEC4',
      sector: 'Commercial',
      work_stage: 'Construction',
      project_manager: 'Alice Manager',
      project_manager_id: admin.id,
      quantity_surveyor: 'Bob QS',
      qs_user_id: qs.id,
      location: 'London',
      currency: 'GBP',
      budget: 1000000,
      actual_spend: 10000,
      committed_cost: 50000,
      approved_variations: 0,
      pending_variations: 5000,
      forecast_final_cost: 1050000,
      baseline_start: new Date(),
      baseline_end: new Date(Date.now() + 180*24*60*60*1000),
      start_date: new Date(),
      carbon_target: 1000,
      carbon_measured: 100,
      progress_pct: 10,
      project_tags: ['office','build']
    }
  });

  await prisma.milestone.createMany({
    data: [
      { project_id: project.id, title: 'Groundworks Complete', status: 'Planned', due_date: new Date(Date.now()+30*86400000) },
      { project_id: project.id, title: 'Steel Frame Erected', status: 'Planned', due_date: new Date(Date.now()+60*86400000) }
    ]
  });

  const t1 = await prisma.task.create({
    data: { project_id: project.id, name: 'Excavate foundations', status: 'In Progress', start_date: new Date(), percent_complete: 40 }
  });
  const t2 = await prisma.task.create({
    data: { project_id: project.id, name: 'Pour concrete', status: 'Planned', baseline_start: new Date(), baseline_end: new Date(Date.now()+7*86400000) }
  });
  await prisma.taskDependency.create({ data: { task_id: t2.id, predecessor_id: t1.id, type: 'FS', lag_days: 2 } });
  await prisma.subtask.createMany({
    data: [
      { task_id: t1.id, title: 'Hire excavator', completed: true },
      { task_id: t1.id, title: 'Mark out site', completed: false }
    ]
  });

  await prisma.comment.create({ data: { task_id: t1.id, text: 'Need bigger excavator', user_id: qs.id } });

  await prisma.inventory.createMany({
    data: [
      { project_id: project.id, sku: 'INV001', name: 'Cement (50kg)', quantity: 100, unit: 'bags', unit_price: 3.5, location: 'Warehouse A' },
      { project_id: project.id, sku: 'INV002', name: 'Steel rebar 2m', quantity: 200, unit: 'pcs', unit_price: 2.0, location: 'Warehouse B' }
    ]
  });

  await prisma.carbonRecord.createMany({
    data: [
      { project_id: project.id, scope: 'SCOPE1', category: 'Plant', source: 'Diesel generator', value: 100, unit: 'kgCO2e', recorded_at: new Date() },
      { project_id: project.id, scope: 'SCOPE3', category: 'Transport', source: 'Haulage', value: 50, unit: 'kgCO2e', recorded_at: new Date() }
    ]
  });

  const risk = await prisma.risk.create({
    data: {
      project_id: project.id,
      description: 'Material delivery delay due to supply chain',
      category: 'SupplyChain',
      probability: 0.2,
      impact: 0.4,
      score: 20,
      owner: 'Site Manager',
      mitigation: 'Use multiple suppliers; order early',
      status: 'Open'
    }
  });
  await prisma.riskStatusHistory.createMany({
    data: [
      { risk_id: risk.id, from: null, to: 'Open', note: 'Identified', changed_by: admin.id },
      { risk_id: risk.id, from: 'Open', to: 'Mitigated', note: 'Supplier added', changed_by: qs.id }
    ]
  });

  await prisma.timelineEvent.create({
    data: { project_id: project.id, title: 'Site prep complete', description: 'Earthworks done', start_date: new Date(), status: 'Completed' }
  });

  await prisma.healthSafetyRecord.create({
    data: {
      project_id: project.id,
      type: 'Incident',
      description: 'Minor cut during rebar handling',
      severity: 'Low',
      occurred_at: new Date(),
      actions_taken: 'First aid; toolbox talk',
      status: 'Resolved',
      notifiable: false
    }
  });

  await prisma.costEntry.createMany({
    data: [
      { project_id: project.id, category: 'Materials', amount: 5000, currency: 'GBP', description: 'Concrete batch', date_incurred: new Date() },
      { project_id: project.id, category: 'Plant', amount: 1200, currency: 'GBP', description: 'Excavator hire', date_incurred: new Date() }
    ]
  });

  await prisma.cvrReport.create({
    data: {
      project_id: project.id,
      period_start: new Date(),
      period_end: new Date(),
      actual_cost: 6200,
      forecast_cost: 20000,
      earned_value: 5600,
      comments: 'Initial spend',
      created_by: admin.id
    }
  });

  const tender = await prisma.tender.create({
    data: {
      project_id: project.id,
      package: 'Electrical works',
      description: 'Install wiring and lighting',
      status: 'Open',
      open_date: new Date(),
      close_date: new Date(Date.now() + 7*86400000),
      amount: 30000
    }
  });

  await prisma.subcontractor.createMany({
    data: [
      { tender_id: tender.id, name: 'ElectroFix Ltd', status: 'Pending', bid_amount: 28000, awarded: false },
      { tender_id: tender.id, name: 'BrightSparkers Inc', status: 'Pending', bid_amount: 32000, awarded: false }
    ]
  });

  await prisma.file.create({
    data: {
      filename: 'drawing-v1.pdf',
      url: 'http://example.com/drawing-v1.pdf',
      file_type: 'PDF',
      project_id: project.id,
      uploaded_by: admin.id,
      status: 'Submitted'
    }
  });

  await prisma.report.create({
    data: {
      project_id: project.id,
      type: 'Weekly',
      title: 'Week 1 report',
      content: 'Everything is on track',
      author_id: admin.id
    }
  });

  await prisma.projectStatusHistory.create({
    data: { project_id: project.id, from: 'Planned', to: 'Active', note: 'Kickoff', changed_by: admin.id }
  });

  console.log('✅ Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
