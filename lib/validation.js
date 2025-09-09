// lib/validation.js (CommonJS)
const { z } = require('zod');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.string().optional().default('createdAt'),
  order: z.enum(['asc','desc']).optional().default('desc'),
});

const projectsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  clientId: z.coerce.number().int().optional(),
  statusId: z.coerce.number().int().optional(),
  typeId: z.coerce.number().int().optional(),
});

const tasksQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  projectId: z.coerce.number().int().optional(),
  statusId: z.coerce.number().int().optional(),
  dueBefore: z.string().datetime().optional(), // ISO
  dueAfter: z.string().datetime().optional(),
});

const projectBodySchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  clientId: z.number().int().optional().nullable(),
  projectManagerId: z.number().int().optional().nullable(),
  statusId: z.number().int().optional().nullable(),
  typeId: z.number().int().optional().nullable(),
  status: z.string().trim().optional(),
  type: z.string().trim().optional(),
  budget: z.number().nonnegative().optional().nullable(),
  actualSpend: z.number().nonnegative().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  currency: z.string().trim().optional().nullable(),
  unitSystem: z.string().trim().optional().nullable(),
  taxScheme: z.string().trim().optional().nullable(),
  contractForm: z.string().trim().optional().nullable(),
  startPlanned: z.string().datetime().optional().nullable(),
  endPlanned: z.string().datetime().optional().nullable(),
  startActual: z.string().datetime().optional().nullable(),
  endActual: z.string().datetime().optional().nullable(),
});

const taskBodySchema = z.object({
  projectId: z.number().int(),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  assignee: z.string().trim().optional(),
  dueDate: z.string().datetime().optional(),
  statusId: z.number().int(),
});

module.exports = {
  projectsQuerySchema,
  tasksQuerySchema,
  projectBodySchema,
  taskBodySchema,
};
