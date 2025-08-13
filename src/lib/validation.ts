import { z } from "zod";
import { PROJECT_STATUSES, CONTRACT_TYPES, WORK_STAGES } from "./constants";

const zProjectStatus = z.enum(PROJECT_STATUSES);
const zContractType  = z.enum(CONTRACT_TYPES);
const zWorkStage     = z.enum(WORK_STAGES);

export const createClientSchema = z.object({
  name: z.string().min(2),
  regNo: z.string().optional(),
  vatNo: z.string().optional(),
});

export const createProjectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  clientId: z.string().min(1),
  status: zProjectStatus.default("DRAFT").optional(),
  contractType: zContractType.default("OTHER").optional(),
  workStage: zWorkStage.default("RIBA_0").optional(),
  type: z.string().optional(),
  budgetGBP: z.coerce.number().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  retentionPct: z.coerce.number().optional(),
  cisApplicable: z.coerce.boolean().optional(),
  riskLevel: z.string().optional(),
  carbonTarget: z.string().optional(),
  notes: z.string().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().default("Todo"), // free text for now
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
});
