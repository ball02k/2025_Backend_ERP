// lib/validation.workers.cjs
const { z } = require('zod');

// Pagination schema (reusable)
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['workerNumber', 'firstName', 'lastName', 'role', 'createdAt']).optional().default('lastName'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

// Worker query schema (for list endpoint)
const workerQuerySchema = paginationSchema.extend({
  role: z.string().optional(),
  department: z.string().optional(),
  availabilityStatus: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  skills: z.string().optional(), // Comma-separated skill names
  search: z.string().optional(), // Search by name or email
});

// Create worker schema
const createWorkerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),

  // Work Details
  role: z.string().trim().min(1).max(100),
  department: z.string().trim().optional(),
  skills: z.array(z.string()).default([]),
  certifications: z.record(z.object({
    number: z.string(),
    expiryDate: z.string().optional(),
    issuer: z.string().optional(),
  })).optional(),

  // Availability
  availabilityStatus: z.enum(['AVAILABLE', 'ASSIGNED', 'UNAVAILABLE', 'ON_LEAVE', 'OFF_DUTY']).default('AVAILABLE'),
  workSchedule: z.object({
    monday: z.object({ start: z.string(), end: z.string() }).optional(),
    tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
    wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
    thursday: z.object({ start: z.string(), end: z.string() }).optional(),
    friday: z.object({ start: z.string(), end: z.string() }).optional(),
    saturday: z.object({ start: z.string(), end: z.string() }).optional(),
    sunday: z.object({ start: z.string(), end: z.string() }).optional(),
  }).optional(),

  // Location
  homePostcode: z.string().trim().optional(),

  // Compensation
  hourlyRate: z.coerce.number().positive().optional(),
  overtimeRate: z.coerce.number().positive().optional(),

  // Employment
  hireDate: z.string().datetime().optional(),
});

// Update worker schema (all fields optional)
const updateWorkerSchema = createWorkerSchema.partial();

// Skills update schema
const updateSkillsSchema = z.object({
  action: z.enum(['add', 'remove']),
  skills: z.array(z.string()).min(1),
});

// Certification update schema
const updateCertificationSchema = z.object({
  certificationName: z.string(),
  certificationData: z.object({
    number: z.string(),
    expiryDate: z.string().optional(),
    issuer: z.string().optional(),
  }),
});

// Availability check schema
const checkAvailabilitySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Location update schema
const updateLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

// Time off request schema
const timeOffRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allDay: z.coerce.boolean().default(true),
  availabilityType: z.enum(['time_off', 'vacation', 'sick_leave', 'personal', 'training', 'unavailable']),
  reason: z.string().trim().optional(),
});

// Time off approval schema
const timeOffApprovalSchema = z.object({
  status: z.enum(['approved', 'denied']),
});

module.exports = {
  workerQuerySchema,
  createWorkerSchema,
  updateWorkerSchema,
  updateSkillsSchema,
  updateCertificationSchema,
  checkAvailabilitySchema,
  updateLocationSchema,
  timeOffRequestSchema,
  timeOffApprovalSchema,
};
