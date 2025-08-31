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
  description: z.string().trim().optional(),
  clientId: z.number().int(),
  projectManagerId: z.number().int().optional(),
  statusId: z.number().int(),
  typeId: z.number().int(),
  budget: z.number().nonnegative().optional(),
  actualSpend: z.number().nonnegative().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
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

