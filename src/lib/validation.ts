import { z } from "zod";
import { ProjectStatus, ContractType } from "@prisma/client";

export const createClientSchema = z.object({
  name: z.string().min(2),   // required
  regNo: z.string().optional(),
  vatNo: z.string().optional(),
}).strict();

export const createProjectSchema = z.object({
  code: z.string().min(2),       // required
  name: z.string().min(2),       // required
  clientId: z.string().min(1),   // required
  status: z.nativeEnum(ProjectStatus).optional(),
  contractType: z.nativeEnum(ContractType).optional(),
  budgetGBP: z.coerce.number().optional(),
}).strict();

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().default("Todo"),
  dueDate: z.coerce.date().optional(),
}).strict();
