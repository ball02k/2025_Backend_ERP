import { z } from "zod";

const projectStatusEnum = [
  "DRAFT",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

const contractTypeEnum = ["JCT", "NEC4", "OTHER"] as const;

export const createClientSchema = z.object({
  name: z.string().min(2),   // required
  regNo: z.string().optional(),
  vatNo: z.string().optional(),
}).strict();

export const createProjectSchema = z.object({
  code: z.string().min(2),       // required
  name: z.string().min(2),       // required
  clientId: z.string().min(1),   // required

  status: z.enum(projectStatusEnum).optional(),
  contractType: z.enum(contractTypeEnum).optional(),

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
