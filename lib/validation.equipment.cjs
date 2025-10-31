// lib/validation.equipment.cjs
const { z } = require('zod');

// Pagination schema
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['equipmentNumber', 'name', 'type', 'status', 'nextMaintenanceDate', 'createdAt']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

// Equipment query schema
const equipmentQuerySchema = paginationSchema.extend({
  type: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
  maintenanceDue: z.coerce.boolean().optional(),
});

// Create equipment schema
const createEquipmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  category: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),

  // Status & Location
  status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RESERVED']).default('AVAILABLE'),
  currentLocation: z.string().trim().optional(),
  currentLatitude: z.coerce.number().min(-90).max(90).optional(),
  currentLongitude: z.coerce.number().min(-180).max(180).optional(),

  // Maintenance
  lastMaintenanceDate: z.string().datetime().optional(),
  nextMaintenanceDate: z.string().datetime().optional(),
  maintenanceInterval: z.coerce.number().int().positive().optional(),

  // Financial
  purchaseDate: z.string().datetime().optional(),
  purchaseCost: z.coerce.number().positive().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  dailyRate: z.coerce.number().positive().optional(),

  // Specifications
  specifications: z.record(z.any()).optional(),
});

// Update equipment schema
const updateEquipmentSchema = createEquipmentSchema.partial();

// Availability check schema
const checkAvailabilitySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Maintenance log schema
const logMaintenanceSchema = z.object({
  maintenanceDate: z.string().datetime(),
  description: z.string().trim(),
  cost: z.coerce.number().positive().optional(),
  performedBy: z.string().trim().optional(),
  nextMaintenanceDate: z.string().datetime().optional(),
});

// Location update schema
const updateLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  location: z.string().trim().optional(),
});

module.exports = {
  equipmentQuerySchema,
  createEquipmentSchema,
  updateEquipmentSchema,
  checkAvailabilitySchema,
  logMaintenanceSchema,
  updateLocationSchema,
};
