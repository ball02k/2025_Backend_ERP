// lib/validation.jobs.cjs
const { z } = require('zod');

// Pagination schema (reusable)
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['jobNumber', 'title', 'status', 'priority', 'scheduledStartDate', 'createdAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Job query schema (for list endpoint)
const jobQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  priority: z.string().optional(),
  jobType: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  packageId: z.coerce.number().int().positive().optional(),
  contractId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(), // Search by job number or title

  // Date filtering
  scheduledAfter: z.string().datetime().optional(),
  scheduledBefore: z.string().datetime().optional(),
});

// Create job schema
const createJobSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().optional(),
  jobType: z.string().trim().min(1),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),

  // Links to existing entities
  projectId: z.string().optional(),
  packageId: z.coerce.number().int().positive().optional(),
  contractId: z.coerce.number().int().positive().optional(),
  clientId: z.string().optional(),

  // Location
  siteAddress: z.string().trim().min(1),
  siteCity: z.string().trim().optional(),
  sitePostcode: z.string().trim().optional(),
  siteLatitude: z.coerce.number().optional(),
  siteLongitude: z.coerce.number().optional(),
  accessInstructions: z.string().trim().optional(),

  // Scope
  scopeOfWork: z.string().trim().optional(),
  requiredSkills: z.array(z.string()).default([]),
  requiredCerts: z.array(z.string()).default([]),
  requiredWorkerCount: z.coerce.number().int().positive().default(1),

  // Scheduling
  estimatedDuration: z.coerce.number().positive().optional(),
  scheduledStartDate: z.string().datetime().optional(),
  scheduledEndDate: z.string().datetime().optional(),

  // Financial
  estimatedCost: z.coerce.number().optional(),
  billableAmount: z.coerce.number().optional(),

  // Safety
  riskAssessment: z.string().trim().optional(),
  methodStatement: z.string().trim().optional(),
  permitRequired: z.coerce.boolean().default(false),
  permitNumber: z.string().trim().optional(),
});

// Update job schema (all fields optional)
const updateJobSchema = createJobSchema.partial();

// Change status schema
const changeStatusSchema = z.object({
  newStatus: z.enum(['DRAFT', 'PENDING', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'INVOICED']),
  reason: z.string().trim().optional(),
});

module.exports = {
  jobQuerySchema,
  createJobSchema,
  updateJobSchema,
  changeStatusSchema,
};
