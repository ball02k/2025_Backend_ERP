# Quick Start - Running the Job Management Seed

## Run the Seed Script

```bash
# From project root
npm run seed:jobmanagement
```

## What You'll Get

After running the seed, you'll have:

### ✅ 8 UK Workers
- James Thompson - Electrician (London, SW1A 1AA)
- Sarah Mitchell - Plumber (Manchester, M1 1AA)
- Michael Davies - HVAC Engineer (Birmingham, B1 1AA)
- Emma Williams - Carpenter (Liverpool, L1 1AA)
- David Brown - Site Supervisor (Edinburgh, EH1 1AA)
- Lisa Taylor - Painter (Bristol, BS1 1AA)
- Robert Anderson - Electrician (Leeds, LS1 1AA)
- Jennifer Roberts - General Maintenance (Cardiff, CF10 1AA)

### ✅ 8 Equipment Items
- 2 Vehicles (Ford Transit, Mercedes Sprinter)
- 2 Access Equipment (Scaffolding, Ladder)
- 2 Power Tools (Milwaukee Drill, Bosch Multitool)
- 2 Testing Equipment (Megger, Gas Analyser)

### ✅ 10 Jobs Across UK
- London, Manchester, Glasgow, Liverpool, Edinburgh
- Birmingham, Bristol, Leeds, Cardiff, Newcastle
- Various statuses: DRAFT, PENDING, SCHEDULED, IN_PROGRESS
- Different priorities: LOW, NORMAL, HIGH, URGENT

### ✅ Job Schedules
- Workers assigned based on skills
- Equipment allocated (vans, tools)
- Travel times and setup times included

### ✅ Worker Availability
- Holiday requests for each worker
- Some sick leave records
- All with approval status

### ✅ Schedule Conflicts (for testing)
- Worker double-bookings
- Equipment conflicts

## Expected Output

```
🌱 Starting Job Management seed...

🧹 Cleaning up existing data...
  ✓ Cleanup complete

🧑‍🔧 Seeding workers...
  ✓ Created worker: James Thompson (Electrician)
  ✓ Created worker: Sarah Mitchell (Plumber)
  ... (6 more)

🚚 Seeding equipment...
  ✓ Created equipment: Ford Transit Van (Vehicle)
  ✓ Created equipment: Mercedes Sprinter Van (Vehicle)
  ... (6 more)

📋 Seeding jobs...
  ✓ Created job: Office Electrical Rewiring (SCHEDULED)
  ✓ Created job: Commercial Boiler Service (IN_PROGRESS)
  ... (8 more)

📅 Seeding job schedules...
  ✓ Scheduled James Thompson for Office Electrical Rewiring (Lead)
  ✓ Scheduled Robert Anderson for Office Electrical Rewiring
  ✓ Assigned equipment: Ford Transit Van to Office Electrical Rewiring
  ✓ Assigned tool: Milwaukee Drill Set to Office Electrical Rewiring
  ... (more assignments)

🏖️ Seeding worker availability (time off/holidays)...
  ✓ Added holiday for James Thompson: Mon Feb 10 2026 to Fri Feb 14 2026
  ✓ Added holiday for Sarah Mitchell: Wed Feb 05 2026 to Sun Feb 09 2026
  ... (more availability records)

⚠️  Creating schedule conflicts for testing...
  ✓ Created conflict: James Thompson double-booked on Office Electrical Rewiring and Commercial Boiler Service
  ✓ Created conflict: Ford Transit Van double-booked on multiple jobs

✅ Seed completed successfully!

📊 Summary:
  - Workers: 8
  - Equipment: 8
  - Jobs: 10
  - Schedules: 15
  - Availability records: 8
  - Conflicts: 2 (intentional for testing)
```

## Verify the Data

After seeding, you can verify the data:

```bash
# Start your backend server
npm start

# In another terminal, test the API endpoints:
curl http://localhost:3001/api/workers | jq
curl http://localhost:3001/api/jobs | jq
curl http://localhost:3001/api/equipment | jq
curl http://localhost:3001/api/job-schedules | jq
```

## Re-running the Seed

The seed script includes cleanup by default, so you can run it multiple times:

```bash
# Cleans up and re-seeds
npm run seed:jobmanagement
```

## Troubleshooting

### "Cannot find module '@prisma/client'"
Run: `npm install` and `npx prisma generate`

### "Database connection error"
Ensure PostgreSQL is running and your `.env` file has the correct `DATABASE_URL`

### "Permission denied"
Ensure your database user has appropriate permissions

## Next Steps

After seeding:

1. **View the data in your frontend**
   - Navigate to `/job-management` in your browser
   - Check the Jobs, Workers, Equipment, and Schedules pages

2. **Test the scheduler**
   - Try creating new job schedules
   - Check for conflict detection
   - View the calendar view

3. **Test worker availability**
   - View worker availability
   - Try scheduling a job during a worker's time off
   - Verify conflict warnings appear

4. **Test reporting**
   - Navigate to Reports
   - View utilization reports
   - Check asset downtime reports

## Clean Up

To remove all seeded data:

```sql
-- Connect to your database and run:
DELETE FROM job_schedules WHERE tenant_id = 'demo';
DELETE FROM worker_availability WHERE tenant_id = 'demo';
DELETE FROM jobs WHERE tenant_id = 'demo';
DELETE FROM workers WHERE tenant_id = 'demo';
DELETE FROM equipment WHERE tenant_id = 'demo';
```

Or simply re-run the seed script (it cleans up automatically).
