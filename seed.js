const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.client.createMany({
    data: [
      { name: "Client A" },
      { name: "Client B" },
      { name: "Client C" },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Seeded clients");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
