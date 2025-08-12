import { Router } from "express";
import { prisma } from "../lib/db";
import { createClientSchema } from "../lib/validation";

const r = Router();

r.get("/", async (_req, res) => {
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  res.json(clients);
});

r.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: true,
      projects: { select: { id: true, code: true, name: true, status: true } },
    },
  });
  if (!client) return res.status(404).json({ error: "Not found" });
  res.json(client);
});

r.post("/", async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  const { name, regNo, vatNo } = parsed.data;
  const client = await prisma.client.create({ data: { name, regNo, vatNo } });
  res.status(201).json(client);
});

export default r;
