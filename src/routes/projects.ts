import { Router } from "express";
import { prisma } from "../lib/db";
import { createProjectSchema } from "../lib/validation";

const r = Router();

r.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(projects);
});

r.get("/:id", async (req, res) => {
  const { id } = req.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      tasks: { orderBy: { createdAt: "desc" }, take: 20 },
      variations: true,
    },
  });
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json(project);
});

r.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());

  const d = parsed.data;
  const project = await prisma.project.create({
    data: {
      code: d.code,
      name: d.name,
      status: d.status ?? "DRAFT",
      contractType: d.contractType,
      budgetGBP: d.budgetGBP,
      client: { connect: { id: d.clientId } },
    },
  });

  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "CREATE", diff: project as any },
  });

  res.status(201).json(project);
});

export default r;
