import { z } from "zod";
import { ProjectStatus, ContractType } from "@prisma/client";

export const createClientSchema = z.object({
  name: z.string().min(2),
  regNo: z.string().optional(),
  vatNo: z.string().optional(),
});

export const createProjectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  clientId: z.string().min(1),
  status: z.nativeEnum(ProjectStatus).optional(),
  contractType: z.nativeEnum(ContractType).optional(),
  budgetGBP: z.coerce.number().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().default("Todo"),
  dueDate: z.coerce.date().optional(),
});
