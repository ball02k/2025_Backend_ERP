// lib/validation.clients.js
const { z } = require('zod');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.string().optional().default('createdAt'),
  order: z.enum(['asc','desc']).optional().default('desc'),
});

const clientsQuerySchema = paginationSchema.extend({
  search: z.string().optional(), // matches name/companyRegNo/vatNo
});

const clientBodySchema = z.object({
  name: z.string().trim().min(1),
  companyRegNo: z.string().trim().optional(),
  vatNo: z.string().trim().optional(),
  address1: z.string().trim().optional(),
  address2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  county: z.string().trim().optional(),
  postcode: z.string().trim().optional(),

  // optional nested primary contact on create
  primaryContact: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().optional(),
    role: z.string().trim().optional(),
  }).optional(),
});

const contactBodySchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  role: z.string().trim().optional(),
  isPrimary: z.coerce.boolean().optional().default(false),
});

module.exports = {
  clientsQuerySchema,
  clientBodySchema,
  contactBodySchema,
};
