import { Router } from "express";
import { prisma } from "../lib/db";
import { createTaskSchema } from "../lib/validation";

const r = Router();

r.get("/", async (req, res) => {
  const { projectId, overdue } = req.query as { projectId?: string; overdue?: string };
  const where: any = {};
  if (projectId) where.projectId = projectId;
  if (overdue === "true") where.dueDate = { lt: new Date() };
  const tasks = await prisma.task.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json(tasks);
});

r.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  const d = parsed.data;
  const task = await prisma.task.create({
    data: {
      project: { connect: { id: d.projectId } },
      title: d.title,
      description: d.description,
      priority: d.priority,
      status: d.status,
      dueDate: d.dueDate,
    },
  });
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: task.id, action: "CREATE", diff: task as any },
  });
  res.status(201).json(task);
});

export default r;
