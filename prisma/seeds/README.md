# Job Management Seed Data

This directory contains seed scripts for the Job Management system with realistic UK-based data.

## What's Included

The `jobManagement.ts` seed script creates:

- **8 Workers** with realistic UK names, addresses, skills, and certifications
  - Electricians (with 18th Edition certs)
  - Plumbers (with Gas Safe certification)
  - HVAC Engineer (with F-Gas certification)
  - Carpenter, Site Supervisor, Painter, General Maintenance
  - Each with appropriate skills, hourly rates, and work schedules

- **8 Equipment Items**
  - Vehicles (Ford Transit, Mercedes Sprinter)
  - Access equipment (Scaffolding, Ladders)
  - Power tools (Milwaukee drill, Bosch multitool)
  - Testing equipment (Megger, Gas Analyser)

- **10 Jobs** with realistic UK addresses
  - Various statuses: DRAFT, PENDING, SCHEDULED, IN_PROGRESS
  - Different priorities: LOW, NORMAL, HIGH, URGENT
  - Job types: Installation, Maintenance, Repair, Inspection
  - Locations across major UK cities

- **Job Schedules** assigning workers and equipment to jobs
  - Workers matched by skills and certifications
  - Equipment assigned appropriately (vans, tools)
  - Crew leads designated
  - Travel and setup times included

- **Worker Availability** records
  - Annual leave/holidays for each worker
  - Some sick leave records
  - All with approval workflow

- **Intentional Conflicts** for testing
  - Worker double-bookings
  - Equipment conflicts
  - Useful for testing conflict detection

## Running the Seed

### Prerequisites

Ensure you have the required dependencies:

```bash
npm install --save-dev ts-node @types/node
```

### Execute the Seed

```bash
# From the project root
npx ts-node prisma/seeds/jobManagement.ts
```

Or use the convenience script:

```bash
# From the project root
npm run seed:jobmanagement
```

## Data Characteristics

### UK-Specific Features
- ✅ Realistic UK postcodes (London, Manchester, Birmingham, etc.)
- ✅ UK addresses across 15 major cities
- ✅ GPS coordinates for each location
- ✅ UK-specific certifications (18th Edition, Gas Safe, F-Gas, CSCS, SMSTS)
- ✅ UK phone numbers (07700 format)
- ✅ UK certification bodies (City & Guilds, NICEIC, Gas Safe Register)
- ✅ Europe/London timezone (dates in BST/GMT)

### Realistic Scenarios
- ✅ Workers with multiple skills and certifications with expiry dates
- ✅ Different employment types and departments
- ✅ Hourly rates and overtime rates
- ✅ Work schedules (Monday-Friday, 8am-5pm)
- ✅ Equipment with maintenance schedules
- ✅ Jobs requiring specific skills and certifications
- ✅ Risk assessments and safety considerations
- ✅ Permit requirements for certain jobs
- ✅ Travel time and setup time considerations
- ✅ Approved and pending availability requests
- ✅ Schedule conflicts for testing

## Sample Data

### Workers
- James Thompson - Electrician (18th Edition, PAT Testing)
- Sarah Mitchell - Plumber (Gas Safe)
- Michael Davies - HVAC Engineer (F-Gas)
- Emma Williams - Carpenter (CSCS, NVQ Level 3)
- David Brown - Site Supervisor (SMSTS, First Aid)
- Lisa Taylor - Painter & Decorator
- Robert Anderson - Electrician (Commercial)
- Jennifer Roberts - General Maintenance

### Equipment
- Ford Transit Van (AB22 XYZ)
- Mercedes Sprinter Van (CD23 ABC)
- Scaffolding System (Layher Allround)
- Milwaukee Drill Set (M18 Fuel)
- Bosch Multitool
- Extension Ladder (3.5m)
- Megger MFT1835 Test Equipment
- Anton Sprint Pro1 Gas Analyser

### Job Types
- Office Electrical Rewiring
- Commercial Boiler Service
- Air Conditioning Installation
- Shop Fit-Out Carpentry
- Emergency Lighting Repair
- Office Painting & Decoration
- Fire Alarm Installation
- Warehouse Maintenance Round
- Kitchen Extract System Service
- School Electrical PAT Testing

## Customization

To customize the seed data:

1. Edit the data arrays at the top of `jobManagement.ts`:
   - `UK_ADDRESSES` - Add more UK locations
   - `WORKERS_DATA` - Add/modify worker profiles
   - `EQUIPMENT_DATA` - Add/modify equipment
   - `JOBS_DATA` - Add/modify job scenarios

2. Adjust the `TENANT_ID` if seeding for a different tenant

3. Modify the cleanup section if you want to preserve existing data

## Notes

- The script includes cleanup by default - **it will delete existing job management data** for the demo tenant
- Comment out the cleanup section if you want to add to existing data
- All dates are generated relative to the current date
- Worker certifications have realistic expiry dates
- Equipment maintenance intervals are set appropriately
- Conflicts are intentionally created for testing purposes

## Troubleshooting

### TypeScript Errors
If you encounter TypeScript errors, ensure `@prisma/client` is properly generated:
```bash
npx prisma generate
```

### Connection Errors
Ensure your database is running and `DATABASE_URL` is correctly set in `.env`

### Permission Errors
Some operations require specific permissions - ensure your database user has sufficient privileges

## Related Seeds

- Main seed: `prisma/seed.cjs` (core ERP data)
- Add other seeds here as needed
