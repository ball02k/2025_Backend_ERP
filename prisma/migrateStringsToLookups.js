const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const norm = (v) => (v || '').toString().trim().toUpperCase().replace(/[\s-]+/g, '_');

async function main() {
  const [pStatuses, pTypes, tStatuses] = await Promise.all([
    prisma.projectStatus.findMany(),
    prisma.projectType.findMany(),
    prisma.taskStatus.findMany(),
  ]);

  const psMap = Object.fromEntries(pStatuses.map((s) => [norm(s.key), s.id]));
  const ptMap = Object.fromEntries(pTypes.map((t) => [norm(t.key), t.id]));
  const tsMap = Object.fromEntries(tStatuses.map((s) => [norm(s.key), s.id]));

  const projects = await prisma.project.findMany({ select: { id: true, status: true, type: true } });
  for (const p of projects) {
    const sid = psMap[norm(p.status)] ?? null;
    const tid = ptMap[norm(p.type)] ?? null;
    await prisma.project.update({ where: { id: p.id }, data: { statusId: sid, typeId: tid } });
    if (!sid) console.warn('Project missing status map:', p.id, p.status);
    if (!tid) console.warn('Project missing type map:', p.id, p.type);
  }

  const tasks = await prisma.task.findMany({ select: { id: true, status: true } });
  for (const t of tasks) {
    const sid = tsMap[norm(t.status)] ?? null;
    await prisma.task.update({ where: { id: t.id }, data: { statusId: sid } });
    if (!sid) console.warn('Task missing status map:', t.id, t.status);
  }

  console.log('Backfill complete ✅');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
