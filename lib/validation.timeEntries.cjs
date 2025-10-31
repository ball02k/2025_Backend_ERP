// lib/validation.timeEntries.cjs
const { z } = require('zod');

// Clock in schema
const clockInSchema = z.object({
  scheduleId: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  clockIn: z.string().datetime().optional(), // Optional, defaults to now
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  notes: z.string().optional()
});

// Clock out schema
const clockOutSchema = z.object({
  clockOut: z.string().datetime().optional(), // Optional, defaults to now
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  workDescription: z.string().optional()
});

// Start break schema
const startBreakSchema = z.object({
  breakType: z.enum(['PAID', 'UNPAID', 'MEAL']).optional().default('UNPAID')
});

// Submit for approval schema
const submitSchema = z.object({
  workDescription: z.string().optional(),
  notes: z.string().optional()
});

// Approve schema
const approveSchema = z.object({
  notes: z.string().optional()
});

// Reject schema
const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required')
});

// Time entry query schema
const timeEntryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  workerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Timesheet query schema
const timesheetQuerySchema = z.object({
  workerId: z.string().uuid().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Update time entry schema
const updateTimeEntrySchema = z.object({
  notes: z.string().optional(),
  workDescription: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']).optional()
});

module.exports = {
  clockInSchema,
  clockOutSchema,
  startBreakSchema,
  submitSchema,
  approveSchema,
  rejectSchema,
  timeEntryQuerySchema,
  timesheetQuerySchema,
  updateTimeEntrySchema,
};
