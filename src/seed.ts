import { prisma } from "./lib/db";

async function ensureClient(name: string, extra?: { regNo?: string; vatNo?: string }) {
  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.client.create({ data: { name, regNo: extra?.regNo, vatNo: extra?.vatNo } });
}

async function run() {
  console.log("Seeding...");

  const acme   = await ensureClient("Acme Civils", { regNo: "01234567", vatNo: "GB123456789" });
  const roadco = await ensureClient("RoadCo Ltd",  { regNo: "08976543", vatNo: "GB987654321" });

  const a001 = await prisma.project.upsert({
    where: { code: "A001" },
    update: {},
    create: {
      code: "A001",
      name: "A14 Junction Upgrade",
      clientId: acme.id,
      status: "ACTIVE",
      contractType: "NEC4",
      budgetGBP: 2500000 as any,
    },
  });

  const r101 = await prisma.project.upsert({
    where: { code: "R101" },
    update: {},
    create: {
      code: "R101",
      name: "Ring Road Resurfacing",
      clientId: roadco.id,
      status: "ON_HOLD",
      contractType: "JCT",
      budgetGBP: 900000 as any,
    },
  });

  await prisma.task.createMany({
    data: [
      { projectId: a001.id, title: "Site setup", status: "Done" },
      { projectId: a001.id, title: "Traffic management plan", status: "In Progress" },
      { projectId: a001.id, title: "Utilities survey", status: "Todo", dueDate: new Date(Date.now() + 7 * 864e5) },
      { projectId: r101.id, title: "Milling schedule", status: "Todo" },
      { projectId: r101.id, title: "Asphalt supplier PO", status: "Blocked" },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete.");
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
