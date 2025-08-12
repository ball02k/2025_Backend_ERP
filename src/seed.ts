import "dotenv/config";
import { prisma } from "./lib/db";

async function run() {
  console.log("Seeding...");

  let acme = await prisma.client.findFirst({ where: { name: "Acme Civils" } });
  if (!acme) {
    acme = await prisma.client.create({
      data: { name: "Acme Civils", regNo: "01234567", vatNo: "GB123456789" },
    });
  }

  const proj = await prisma.project.upsert({
    where: { code: "A001" },
    update: {},
    create: {
      code: "A001",
      name: "A14 Junction Upgrade",
      client: { connect: { id: acme.id } },
      status: "ACTIVE",
      contractType: "NEC4"
    },
  });

  await prisma.task.createMany({
    data: [
      { projectId: proj.id, title: "Site setup", status: "Done" },
      { projectId: proj.id, title: "Traffic management plan", status: "In Progress" },
      { projectId: proj.id, title: "Utilities survey", status: "Todo" }
    ],
    skipDuplicates: true
  });

  console.log("Done.");
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
