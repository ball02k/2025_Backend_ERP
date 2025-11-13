// lib/validation.jobSchedules.cjs
const { z } = require('zod');

// Schedule query schema
const scheduleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  jobId: z.string().optional(),
  workerId: z.string().optional(),
  equipmentId: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  hasConflicts: z.coerce.boolean().optional(),
});

// Calendar view query schema
const calendarQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  workerIds: z.string().optional(), // comma-separated
  equipmentIds: z.string().optional(), // comma-separated
});

// Create schedule schema
const createScheduleSchema = z.object({
  jobId: z.string().uuid(),
  workerId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  estimatedHours: z.coerce.number().positive().optional(),
  allDay: z.coerce.boolean().optional().default(false),
  notes: z.string().optional(),
  specialInstructions: z.string().optional(),
  ignoreConflicts: z.coerce.boolean().optional().default(false),
  isCrewLead: z.coerce.boolean().optional().default(false),
  travelTimeMinutes: z.coerce.number().int().min(0).optional().default(0),
  setupTimeMinutes: z.coerce.number().int().min(0).optional().default(0),
  breakdownTimeMinutes: z.coerce.number().int().min(0).optional().default(0),
}).refine(data => data.workerId || data.equipmentId, {
  message: 'Either workerId or equipmentId must be provided',
  path: ['workerId']
});

// Update schedule schema
const updateScheduleSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  estimatedHours: z.coerce.number().positive().optional(),
  allDay: z.coerce.boolean().optional(),
  notes: z.string().optional(),
  specialInstructions: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  isCrewLead: z.coerce.boolean().optional(),
  travelTimeMinutes: z.coerce.number().int().min(0).optional(),
  setupTimeMinutes: z.coerce.number().int().min(0).optional(),
  breakdownTimeMinutes: z.coerce.number().int().min(0).optional(),
});

// Bulk assignment schema
const bulkAssignSchema = z.object({
  jobId: z.string().uuid(),
  assignments: z.array(z.object({
    workerId: z.string().uuid().optional(),
    equipmentId: z.string().uuid().optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    estimatedHours: z.coerce.number().positive().optional(),
    notes: z.string().optional(),
    specialInstructions: z.string().optional(),
    isCrewLead: z.coerce.boolean().optional().default(false),
    travelTimeMinutes: z.coerce.number().int().min(0).optional().default(0),
    setupTimeMinutes: z.coerce.number().int().min(0).optional().default(0),
    breakdownTimeMinutes: z.coerce.number().int().min(0).optional().default(0),
  }).refine(data => data.workerId || data.equipmentId, {
    message: 'Either workerId or equipmentId must be provided'
  })).min(1).max(50),
  stopOnConflict: z.coerce.boolean().optional().default(true)
});

module.exports = {
  scheduleQuerySchema,
  calendarQuerySchema,
  createScheduleSchema,
  updateScheduleSchema,
  bulkAssignSchema,
};
