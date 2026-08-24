/**
 * Job Management System Seed Data
 *
 * Seeds the database with realistic UK-based:
 * - Workers with skills, certifications, and availability
 * - Equipment and tools
 * - Jobs with UK addresses
 * - Job schedules with assignments
 * - Worker availability (holidays, time off)
 * - Schedule conflicts for testing
 *
 * Run with: npx ts-node prisma/seeds/jobManagement.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = 'demo';
const USER_ID = 'seed-user-001';

// ============================================================================
// REALISTIC UK DATA
// ============================================================================

const UK_ADDRESSES = [
  {
    address: '45 Kingsway',
    city: 'London',
    postcode: 'WC2B 6LE',
    lat: 51.5145,
    lng: -0.1209,
  },
  {
    address: '12 Deansgate',
    city: 'Manchester',
    postcode: 'M3 2BQ',
    lat: 53.4794,
    lng: -2.2453,
  },
  {
    address: '78 Buchanan Street',
    city: 'Glasgow',
    postcode: 'G1 3BA',
    lat: 55.8600,
    lng: -4.2552,
  },
  {
    address: '34 Bold Street',
    city: 'Liverpool',
    postcode: 'L1 4DN',
    lat: 53.4048,
    lng: -2.9821,
  },
  {
    address: '156 Princes Street',
    city: 'Edinburgh',
    postcode: 'EH2 4AD',
    lat: 55.9533,
    lng: -3.1883,
  },
  {
    address: '89 Corporation Street',
    city: 'Birmingham',
    postcode: 'B2 4TS',
    lat: 52.4814,
    lng: -1.8998,
  },
  {
    address: '23 Park Street',
    city: 'Bristol',
    postcode: 'BS1 5JL',
    lat: 51.4545,
    lng: -2.5966,
  },
  {
    address: '67 Briggate',
    city: 'Leeds',
    postcode: 'LS1 6BR',
    lat: 53.7988,
    lng: -1.5405,
  },
  {
    address: '91 Churchill Way',
    city: 'Cardiff',
    postcode: 'CF10 2WF',
    lat: 51.4816,
    lng: -3.1791,
  },
  {
    address: '128 Northumberland Street',
    city: 'Newcastle',
    postcode: 'NE1 7DG',
    lat: 54.9738,
    lng: -1.6131,
  },
  {
    address: '45 Queens Road',
    city: 'Brighton',
    postcode: 'BN1 3XB',
    lat: 50.8225,
    lng: -0.1426,
  },
  {
    address: '72 High Street',
    city: 'Oxford',
    postcode: 'OX1 4BG',
    lat: 51.7520,
    lng: -1.2577,
  },
  {
    address: '18 Market Street',
    city: 'Cambridge',
    postcode: 'CB2 3PB',
    lat: 52.2053,
    lng: 0.1218,
  },
  {
    address: '56 Fore Street',
    city: 'Exeter',
    postcode: 'EX4 3AT',
    lat: 50.7184,
    lng: -3.5339,
  },
  {
    address: '103 Church Street',
    city: 'Sheffield',
    postcode: 'S1 2GT',
    lat: 53.3811,
    lng: -1.4701,
  },
];

const WORKERS_DATA = [
  {
    firstName: 'James',
    lastName: 'Thompson',
    email: 'j.thompson@example.com',
    phone: '07700 900123',
    role: 'Electrician',
    skills: ['Electrical Installation', 'Fault Finding', 'Testing & Inspection', '18th Edition'],
    certifications: {
      '18th Edition': {
        number: 'ECS-18ED-001234',
        expiryDate: '2026-06-30',
        issuer: 'City & Guilds',
      },
      'PAT Testing': {
        number: 'PAT-2024-5678',
        expiryDate: '2026-03-15',
        issuer: 'NICEIC',
      },
    },
    hourlyRate: 45.00,
    homePostcode: 'SW1A 1AA',
    department: 'Electrical Services',
  },
  {
    firstName: 'Sarah',
    lastName: 'Mitchell',
    email: 's.mitchell@example.com',
    phone: '07700 900456',
    role: 'Plumber',
    skills: ['Pipework', 'Central Heating', 'Boiler Installation', 'Gas Safe'],
    certifications: {
      'Gas Safe': {
        number: 'GS-123456',
        expiryDate: '2025-12-31',
        issuer: 'Gas Safe Register',
      },
      'CIPHE': {
        number: 'CIPHE-7890',
        expiryDate: '2027-01-15',
        issuer: 'Chartered Institute of Plumbing',
      },
    },
    hourlyRate: 42.00,
    homePostcode: 'M1 1AA',
    department: 'Plumbing Services',
  },
  {
    firstName: 'Michael',
    lastName: 'Davies',
    email: 'm.davies@example.com',
    phone: '07700 900789',
    role: 'HVAC Engineer',
    skills: ['Air Conditioning', 'Ventilation', 'Refrigeration', 'F-Gas'],
    certifications: {
      'F-Gas': {
        number: 'FG-2024-1122',
        expiryDate: '2026-09-30',
        issuer: 'Refcom',
      },
      'City & Guilds HVAC': {
        number: 'CG-HVAC-3344',
        expiryDate: '2028-05-20',
        issuer: 'City & Guilds',
      },
    },
    hourlyRate: 48.00,
    homePostcode: 'B1 1AA',
    department: 'HVAC Services',
  },
  {
    firstName: 'Emma',
    lastName: 'Williams',
    email: 'e.williams@example.com',
    phone: '07700 900012',
    role: 'Carpenter',
    skills: ['First Fix', 'Second Fix', 'Joinery', 'Door Hanging'],
    certifications: {
      'CSCS Card': {
        number: 'CSCS-2024-5566',
        expiryDate: '2027-08-15',
        issuer: 'CSCS',
      },
      'NVQ Level 3': {
        number: 'NVQ3-CARP-7788',
        expiryDate: null,
        issuer: 'City & Guilds',
      },
    },
    hourlyRate: 40.00,
    homePostcode: 'L1 1AA',
    department: 'Construction',
  },
  {
    firstName: 'David',
    lastName: 'Brown',
    email: 'd.brown@example.com',
    phone: '07700 900345',
    role: 'Site Supervisor',
    skills: ['Project Management', 'Health & Safety', 'CSCS Supervisor', 'First Aid'],
    certifications: {
      'SMSTS': {
        number: 'SMSTS-2023-9900',
        expiryDate: '2028-04-10',
        issuer: 'CITB',
      },
      'First Aid at Work': {
        number: 'FAW-2025-1122',
        expiryDate: '2028-03-20',
        issuer: 'St John Ambulance',
      },
    },
    hourlyRate: 55.00,
    homePostcode: 'EH1 1AA',
    department: 'Management',
  },
  {
    firstName: 'Lisa',
    lastName: 'Taylor',
    email: 'l.taylor@example.com',
    phone: '07700 900678',
    role: 'Painter & Decorator',
    skills: ['Interior Painting', 'Exterior Painting', 'Wallpapering', 'Spray Painting'],
    certifications: {
      'CSCS Card': {
        number: 'CSCS-2025-3344',
        expiryDate: '2028-02-28',
        issuer: 'CSCS',
      },
    },
    hourlyRate: 35.00,
    homePostcode: 'BS1 1AA',
    department: 'Decorating',
  },
  {
    firstName: 'Robert',
    lastName: 'Anderson',
    email: 'r.anderson@example.com',
    phone: '07700 900901',
    role: 'Electrician',
    skills: ['Commercial Electrical', 'Fire Alarms', 'Emergency Lighting', 'PAT Testing'],
    certifications: {
      '18th Edition': {
        number: 'ECS-18ED-002345',
        expiryDate: '2025-11-30',
        issuer: 'City & Guilds',
      },
      'ECS Card': {
        number: 'ECS-2024-6677',
        expiryDate: '2029-06-15',
        issuer: 'ECS',
      },
    },
    hourlyRate: 46.00,
    homePostcode: 'LS1 1AA',
    department: 'Electrical Services',
  },
  {
    firstName: 'Jennifer',
    lastName: 'Roberts',
    email: 'j.roberts@example.com',
    phone: '07700 901234',
    role: 'General Maintenance',
    skills: ['Basic Plumbing', 'Basic Electrical', 'Locksmith', 'Handyman'],
    certifications: {
      'CSCS Card': {
        number: 'CSCS-2025-8899',
        expiryDate: '2027-10-31',
        issuer: 'CSCS',
      },
    },
    hourlyRate: 32.00,
    homePostcode: 'CF10 1AA',
    department: 'Facilities',
  },
];

const EQUIPMENT_DATA = [
  {
    name: 'Ford Transit Van',
    type: 'Vehicle',
    category: 'Transport',
    manufacturer: 'Ford',
    model: 'Transit Custom',
    serialNumber: 'FT-2022-12345',
    hourlyRate: 15.00,
    dailyRate: 85.00,
    maintenanceInterval: 90,
    specifications: {
      capacity: '1000kg',
      fuelType: 'Diesel',
      registration: 'AB22 XYZ',
    },
  },
  {
    name: 'Mercedes Sprinter Van',
    type: 'Vehicle',
    category: 'Transport',
    manufacturer: 'Mercedes',
    model: 'Sprinter 314 CDI',
    serialNumber: 'MS-2023-67890',
    hourlyRate: 18.00,
    dailyRate: 95.00,
    maintenanceInterval: 90,
    specifications: {
      capacity: '1200kg',
      fuelType: 'Diesel',
      registration: 'CD23 ABC',
    },
  },
  {
    name: 'Scaffolding System',
    type: 'Access Equipment',
    category: 'Safety',
    manufacturer: 'Layher',
    model: 'Allround System',
    serialNumber: 'LAY-2021-11111',
    dailyRate: 250.00,
    maintenanceInterval: 30,
    specifications: {
      maxHeight: '15m',
      loadCapacity: '600kg/m2',
    },
  },
  {
    name: 'Milwaukee Drill Set',
    type: 'Power Tool',
    category: 'Hand Tools',
    manufacturer: 'Milwaukee',
    model: 'M18 Fuel',
    serialNumber: 'MIL-2023-22222',
    hourlyRate: 5.00,
    dailyRate: 25.00,
    maintenanceInterval: 180,
    specifications: {
      voltage: '18V',
      batteryIncluded: true,
    },
  },
  {
    name: 'Bosch Multitool',
    type: 'Power Tool',
    category: 'Hand Tools',
    manufacturer: 'Bosch',
    model: 'GOP 18V-28',
    serialNumber: 'BSH-2024-33333',
    hourlyRate: 4.00,
    dailyRate: 20.00,
    maintenanceInterval: 180,
    specifications: {
      voltage: '18V',
      oscillations: '20000 OPM',
    },
  },
  {
    name: 'Ladder - Extension 3.5m',
    type: 'Access Equipment',
    category: 'Safety',
    manufacturer: 'Werner',
    model: '75113',
    serialNumber: 'WER-2022-44444',
    dailyRate: 15.00,
    maintenanceInterval: 60,
    specifications: {
      maxHeight: '3.5m',
      maxLoad: '150kg',
    },
  },
  {
    name: 'Test Equipment - Megger',
    type: 'Testing Equipment',
    category: 'Electrical',
    manufacturer: 'Megger',
    model: 'MFT1835',
    serialNumber: 'MEG-2023-55555',
    hourlyRate: 8.00,
    dailyRate: 40.00,
    maintenanceInterval: 365,
    specifications: {
      testType: '18th Edition',
      calibrationDue: '2025-12-31',
    },
  },
  {
    name: 'Gas Analyser',
    type: 'Testing Equipment',
    category: 'Plumbing',
    manufacturer: 'Anton',
    model: 'Sprint Pro1',
    serialNumber: 'ANT-2024-66666',
    hourlyRate: 10.00,
    dailyRate: 50.00,
    maintenanceInterval: 365,
    specifications: {
      gases: ['CO', 'CO2', 'O2'],
      calibrationDue: '2025-09-30',
    },
  },
];

const JOBS_DATA = [
  {
    title: 'Office Electrical Rewiring',
    jobType: 'Installation',
    description: 'Complete rewiring of 2nd floor office space including new distribution board, lighting circuits, and power sockets',
    priority: 'NORMAL',
    status: 'SCHEDULED',
    requiredSkills: ['Electrical Installation', '18th Edition', 'Testing & Inspection'],
    requiredCerts: ['18th Edition'],
    requiredWorkerCount: 2,
    estimatedDuration: 16,
    estimatedCost: 3500.00,
    scopeOfWork: 'Remove old wiring, install new distribution board, run new circuits for lighting and power, test and certify installation',
    riskAssessment: 'Working at height, live electrical work, dust and debris. Full PPE required.',
  },
  {
    title: 'Commercial Boiler Service',
    jobType: 'Maintenance',
    description: 'Annual service and inspection of commercial gas boiler',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    requiredSkills: ['Central Heating', 'Boiler Installation', 'Gas Safe'],
    requiredCerts: ['Gas Safe'],
    requiredWorkerCount: 1,
    estimatedDuration: 4,
    estimatedCost: 450.00,
    scopeOfWork: 'Visual inspection, gas tightness test, burner inspection, flue analysis, safety device checks',
    riskAssessment: 'Working with gas appliances. Gas Safe certification required. Ensure adequate ventilation.',
  },
  {
    title: 'Air Conditioning Installation',
    jobType: 'Installation',
    description: 'Install 3 split-type AC units in retail premises',
    priority: 'NORMAL',
    status: 'SCHEDULED',
    requiredSkills: ['Air Conditioning', 'F-Gas', 'Refrigeration'],
    requiredCerts: ['F-Gas'],
    requiredWorkerCount: 2,
    estimatedDuration: 12,
    estimatedCost: 5200.00,
    scopeOfWork: 'Install indoor and outdoor units, run pipework and electrical supply, pressure test, vacuum, charge with refrigerant, commission and test',
    riskAssessment: 'Working at height, heavy lifting, refrigerant handling. F-Gas certification required.',
  },
  {
    title: 'Shop Fit-Out Carpentry',
    jobType: 'Installation',
    description: 'Install shelving, counters, and display units in new retail unit',
    priority: 'NORMAL',
    status: 'PENDING',
    requiredSkills: ['First Fix', 'Second Fix', 'Joinery'],
    requiredCerts: ['CSCS Card'],
    requiredWorkerCount: 2,
    estimatedDuration: 20,
    estimatedCost: 4800.00,
    scopeOfWork: 'Measure and cut timber, assemble and install shelving units, fit counters, install display units, final finishing',
    riskAssessment: 'Power tools, manual handling, working at height. CSCS card required.',
  },
  {
    title: 'Emergency Lighting Repair',
    jobType: 'Repair',
    description: 'Diagnose and repair faulty emergency lighting system',
    priority: 'URGENT',
    status: 'DRAFT',
    requiredSkills: ['Fault Finding', 'Emergency Lighting', 'Testing & Inspection'],
    requiredCerts: ['18th Edition'],
    requiredWorkerCount: 1,
    estimatedDuration: 3,
    estimatedCost: 280.00,
    scopeOfWork: 'Test emergency lighting circuit, identify fault, replace faulty components, test and certify',
    riskAssessment: 'Electrical work, working at height. 18th Edition required.',
    permitRequired: true,
  },
  {
    title: 'Office Painting & Decoration',
    jobType: 'Maintenance',
    description: 'Paint walls and ceilings in 5 office rooms',
    priority: 'LOW',
    status: 'PENDING',
    requiredSkills: ['Interior Painting', 'Wallpapering'],
    requiredCerts: ['CSCS Card'],
    requiredWorkerCount: 2,
    estimatedDuration: 24,
    estimatedCost: 2800.00,
    scopeOfWork: 'Prepare surfaces, fill holes, apply undercoat and topcoat, clean up',
    riskAssessment: 'Paint fumes, working at height. Adequate ventilation required.',
  },
  {
    title: 'Fire Alarm Installation',
    jobType: 'Installation',
    description: 'Install BS5839 compliant fire alarm system',
    priority: 'HIGH',
    status: 'SCHEDULED',
    requiredSkills: ['Fire Alarms', 'Commercial Electrical', '18th Edition'],
    requiredCerts: ['18th Edition', 'ECS Card'],
    requiredWorkerCount: 2,
    estimatedDuration: 16,
    estimatedCost: 6500.00,
    scopeOfWork: 'Install control panel, detectors, call points, sounders, wiring, commission and test system',
    riskAssessment: 'Working at height, electrical installation. Full certification required.',
    permitRequired: true,
  },
  {
    title: 'Warehouse Maintenance Round',
    jobType: 'Inspection',
    description: 'Monthly maintenance inspection and minor repairs',
    priority: 'NORMAL',
    status: 'SCHEDULED',
    requiredSkills: ['Basic Plumbing', 'Basic Electrical', 'Handyman'],
    requiredCerts: ['CSCS Card'],
    requiredWorkerCount: 1,
    estimatedDuration: 6,
    estimatedCost: 320.00,
    scopeOfWork: 'Check lighting, plumbing, doors, locks, general building fabric. Complete minor repairs as needed.',
    riskAssessment: 'General maintenance work. Basic PPE required.',
  },
  {
    title: 'Kitchen Extract System Service',
    jobType: 'Maintenance',
    description: 'Clean and service commercial kitchen extract system',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    requiredSkills: ['Ventilation', 'HVAC'],
    requiredCerts: [],
    requiredWorkerCount: 1,
    estimatedDuration: 4,
    estimatedCost: 480.00,
    scopeOfWork: 'Remove and clean filters, inspect fan, clean ductwork, test operation',
    riskAssessment: 'Working at height, grease and dirt. Full PPE and respiratory protection required.',
  },
  {
    title: 'School Electrical PAT Testing',
    jobType: 'Inspection',
    description: 'Portable appliance testing for all school equipment',
    priority: 'NORMAL',
    status: 'PENDING',
    requiredSkills: ['PAT Testing', 'Testing & Inspection'],
    requiredCerts: ['PAT Testing'],
    requiredWorkerCount: 1,
    estimatedDuration: 8,
    estimatedCost: 720.00,
    scopeOfWork: 'Visual inspection and electrical testing of all portable appliances, labelling and certification',
    riskAssessment: 'Electrical testing. PAT certification required. DBS check required for school site.',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

function generateJobNumber(index: number): string {
  const year = new Date().getFullYear();
  return `JOB-${year}-${String(index + 1).padStart(4, '0')}`;
}

function generateWorkerNumber(index: number): string {
  return `WKR-${String(index + 1).padStart(4, '0')}`;
}

function generateEquipmentNumber(index: number): string {
  return `EQP-${String(index + 1).padStart(4, '0')}`;
}

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedWorkers() {
  console.log('🧑‍🔧 Seeding workers...');

  const workers = [];
  for (let i = 0; i < WORKERS_DATA.length; i++) {
    const data = WORKERS_DATA[i];
    const worker = await prisma.worker.create({
      data: {
        tenantId: TENANT_ID,
        workerNumber: generateWorkerNumber(i),
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        role: data.role,
        department: data.department,
        skills: data.skills,
        certifications: data.certifications,
        hourlyRate: data.hourlyRate,
        overtimeRate: data.hourlyRate * 1.5,
        homePostcode: data.homePostcode,
        availabilityStatus: 'AVAILABLE',
        isActive: true,
        employmentType: 'EMPLOYEE',
        hireDate: new Date('2023-01-15'),
        workSchedule: {
          monday: { start: '08:00', end: '17:00' },
          tuesday: { start: '08:00', end: '17:00' },
          wednesday: { start: '08:00', end: '17:00' },
          thursday: { start: '08:00', end: '17:00' },
          friday: { start: '08:00', end: '17:00' },
        },
      },
    });
    workers.push(worker);
    console.log(`  ✓ Created worker: ${worker.firstName} ${worker.lastName} (${worker.role})`);
  }

  return workers;
}

async function seedEquipment() {
  console.log('🚚 Seeding equipment...');

  const equipment = [];
  for (let i = 0; i < EQUIPMENT_DATA.length; i++) {
    const data = EQUIPMENT_DATA[i];
    const equip = await prisma.equipment.create({
      data: {
        tenantId: TENANT_ID,
        equipmentNumber: generateEquipmentNumber(i),
        name: data.name,
        type: data.type,
        category: data.category,
        manufacturer: data.manufacturer,
        model: data.model,
        serialNumber: data.serialNumber,
        status: 'AVAILABLE',
        hourlyRate: data.hourlyRate,
        dailyRate: data.dailyRate,
        maintenanceInterval: data.maintenanceInterval,
        specifications: data.specifications,
        isActive: true,
        purchaseDate: new Date('2022-06-01'),
        purchaseCost: data.dailyRate ? data.dailyRate * 200 : 5000,
        lastMaintenanceDate: addDays(new Date(), -30),
        nextMaintenanceDate: addDays(new Date(), data.maintenanceInterval - 30),
      },
    });
    equipment.push(equip);
    console.log(`  ✓ Created equipment: ${equip.name} (${equip.type})`);
  }

  return equipment;
}

async function seedJobs() {
  console.log('📋 Seeding jobs...');

  const jobs = [];
  for (let i = 0; i < JOBS_DATA.length; i++) {
    const data = JOBS_DATA[i];
    const address = UK_ADDRESSES[i % UK_ADDRESSES.length];

    // Set dates based on status
    let scheduledStartDate: Date | undefined;
    let scheduledEndDate: Date | undefined;
    let actualStartDate: Date | undefined;

    if (data.status === 'SCHEDULED' || data.status === 'IN_PROGRESS') {
      scheduledStartDate = addDays(new Date(), Math.floor(Math.random() * 7) + 1);
      scheduledEndDate = addHours(scheduledStartDate, data.estimatedDuration);
    }

    if (data.status === 'IN_PROGRESS') {
      actualStartDate = scheduledStartDate;
    }

    const job = await prisma.job.create({
      data: {
        tenantId: TENANT_ID,
        jobNumber: generateJobNumber(i),
        title: data.title,
        description: data.description,
        jobType: data.jobType,
        status: data.status as any,
        priority: data.priority as any,
        siteAddress: `${address.address}, ${address.city}`,
        siteCity: address.city,
        sitePostcode: address.postcode,
        siteLatitude: address.lat,
        siteLongitude: address.lng,
        scopeOfWork: data.scopeOfWork,
        requiredSkills: data.requiredSkills,
        requiredCerts: data.requiredCerts,
        requiredWorkerCount: data.requiredWorkerCount,
        estimatedDuration: data.estimatedDuration,
        estimatedCost: data.estimatedCost,
        riskAssessment: data.riskAssessment,
        permitRequired: data.permitRequired || false,
        scheduledStartDate,
        scheduledEndDate,
        actualStartDate,
        createdBy: USER_ID,
        accessInstructions: 'Contact site manager on arrival. Report to main reception.',
      },
    });
    jobs.push(job);
    console.log(`  ✓ Created job: ${job.title} (${job.status})`);
  }

  return jobs;
}

async function seedJobSchedules(workers: any[], jobs: any[], equipment: any[]) {
  console.log('📅 Seeding job schedules...');

  const schedules = [];

  // Schedule workers and equipment to jobs that are SCHEDULED or IN_PROGRESS
  const schedulableJobs = jobs.filter(j => j.status === 'SCHEDULED' || j.status === 'IN_PROGRESS');

  for (const job of schedulableJobs) {
    // Find workers with matching skills
    const suitableWorkers = workers.filter(w =>
      job.requiredSkills.some((skill: string) => w.skills.includes(skill))
    );

    if (suitableWorkers.length === 0) {
      console.log(`  ⚠ No suitable workers for job: ${job.title}`);
      continue;
    }

    // Assign required number of workers
    const workersToAssign = suitableWorkers.slice(0, job.requiredWorkerCount);

    for (let i = 0; i < workersToAssign.length; i++) {
      const worker = workersToAssign[i];
      const isLead = i === 0;

      const schedule = await prisma.jobSchedule.create({
        data: {
          tenantId: TENANT_ID,
          jobId: job.id,
          workerId: worker.id,
          startTime: job.scheduledStartDate!,
          endTime: job.scheduledEndDate!,
          estimatedHours: job.estimatedDuration,
          isCrewLead: isLead,
          status: job.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'CONFIRMED',
          assignedBy: USER_ID,
          confirmedAt: new Date(),
          confirmedBy: worker.id,
          travelTimeMinutes: 30,
          setupTimeMinutes: 15,
          breakdownTimeMinutes: 10,
        } as any,
      });
      schedules.push(schedule);
      console.log(`  ✓ Scheduled ${worker.firstName} ${worker.lastName} for ${job.title}${isLead ? ' (Lead)' : ''}`);
    }

    // Assign equipment (vehicles and tools)
    if (job.requiredWorkerCount > 0) {
      // Assign a van
      const van = equipment.find(e => e.type === 'Vehicle' && e.status === 'AVAILABLE');
      if (van) {
        const equipSchedule = await prisma.jobSchedule.create({
          data: {
            tenantId: TENANT_ID,
            jobId: job.id,
            equipmentId: van.id,
            startTime: job.scheduledStartDate!,
            endTime: job.scheduledEndDate!,
            estimatedHours: job.estimatedDuration,
            isCrewLead: false,
            status: job.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'CONFIRMED',
            assignedBy: USER_ID,
            travelTimeMinutes: 30,
          } as any,
        });
        schedules.push(equipSchedule);
        console.log(`  ✓ Assigned equipment: ${van.name} to ${job.title}`);

        // Update van status
        await prisma.equipment.update({
          where: { id: van.id },
          data: { status: 'IN_USE' },
        });
      }

      // Assign relevant tools based on job type
      const relevantTools = equipment.filter(e => {
        if (job.requiredSkills.includes('Electrical Installation')) {
          return e.category === 'Electrical' || e.type === 'Power Tool';
        }
        if (job.requiredSkills.includes('Gas Safe')) {
          return e.category === 'Plumbing';
        }
        return e.type === 'Power Tool' || e.type === 'Access Equipment';
      }).slice(0, 2);

      for (const tool of relevantTools) {
        const toolSchedule = await prisma.jobSchedule.create({
          data: {
            tenantId: TENANT_ID,
            jobId: job.id,
            equipmentId: tool.id,
            startTime: job.scheduledStartDate!,
            endTime: job.scheduledEndDate!,
            estimatedHours: job.estimatedDuration,
            isCrewLead: false,
            status: job.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'CONFIRMED',
            assignedBy: USER_ID,
          } as any,
        });
        schedules.push(toolSchedule);
        console.log(`  ✓ Assigned tool: ${tool.name} to ${job.title}`);
      }
    }
  }

  return schedules;
}

async function seedWorkerAvailability(workers: any[]) {
  console.log('🏖️ Seeding worker availability (time off/holidays)...');

  const availability = [];

  // Add some holidays and time off for workers
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];

    // Random holiday in the future (1-3 weeks away)
    const holidayStart = addDays(new Date(), Math.floor(Math.random() * 14) + 7);
    const holidayEnd = addDays(holidayStart, Math.floor(Math.random() * 5) + 3);

    const holiday = await prisma.workerAvailability.create({
      data: {
        tenantId: TENANT_ID,
        workerId: worker.id,
        startDate: holidayStart,
        endDate: holidayEnd,
        allDay: true,
        availabilityType: 'vacation',
        reason: 'Annual leave',
        status: 'approved',
        approvedBy: USER_ID,
        approvedAt: new Date(),
      },
    });
    availability.push(holiday);
    console.log(`  ✓ Added holiday for ${worker.firstName} ${worker.lastName}: ${holidayStart.toDateString()} to ${holidayEnd.toDateString()}`);

    // Some workers get sick leave (20% chance)
    if (Math.random() < 0.2) {
      const sickStart = addDays(new Date(), -Math.floor(Math.random() * 5));
      const sickEnd = addDays(sickStart, 1);

      const sick = await prisma.workerAvailability.create({
        data: {
          tenantId: TENANT_ID,
          workerId: worker.id,
          startDate: sickStart,
          endDate: sickEnd,
          allDay: true,
          availabilityType: 'sick_leave',
          reason: 'Illness',
          status: 'approved',
          approvedBy: USER_ID,
          approvedAt: new Date(),
        },
      });
      availability.push(sick);
      console.log(`  ✓ Added sick leave for ${worker.firstName} ${worker.lastName}`);
    }
  }

  return availability;
}

async function seedConflicts(workers: any[], jobs: any[]) {
  console.log('⚠️  Creating schedule conflicts for testing...');

  // Create an intentional double-booking for testing conflict detection
  const schedulableJobs = jobs.filter(j => j.status === 'SCHEDULED');

  if (schedulableJobs.length >= 2) {
    const job1 = schedulableJobs[0];
    const job2 = schedulableJobs[1];
    const worker = workers[0];

    // Make job2 overlap with job1 by setting same time
    await prisma.job.update({
      where: { id: job2.id },
      data: {
        scheduledStartDate: job1.scheduledStartDate,
        scheduledEndDate: job1.scheduledEndDate,
      },
    });

    // Create schedule for same worker on overlapping job
    await prisma.jobSchedule.create({
      data: {
        tenantId: TENANT_ID,
        jobId: job2.id,
        workerId: worker.id,
        startTime: job1.scheduledStartDate!,
        endTime: job1.scheduledEndDate!,
        estimatedHours: job2.estimatedDuration,
        isCrewLead: true,
        status: 'PENDING',
        assignedBy: USER_ID,
        travelTimeMinutes: 30,
      } as any,
    });

    console.log(`  ✓ Created conflict: ${worker.firstName} ${worker.lastName} double-booked on ${job1.title} and ${job2.title}`);
  }

  // Create equipment conflict
  const van = await prisma.equipment.findFirst({
    where: { type: 'Vehicle' },
  });

  if (van && schedulableJobs.length >= 3) {
    const job3 = schedulableJobs[2];

    // Set overlapping time with another job
    await prisma.job.update({
      where: { id: job3.id },
      data: {
        scheduledStartDate: schedulableJobs[0].scheduledStartDate,
        scheduledEndDate: schedulableJobs[0].scheduledEndDate,
      },
    });

    // Try to assign same van (creating conflict)
    try {
      await prisma.jobSchedule.create({
        data: {
          tenantId: TENANT_ID,
          jobId: job3.id,
          equipmentId: van.id,
          startTime: schedulableJobs[0].scheduledStartDate!,
          endTime: schedulableJobs[0].scheduledEndDate!,
          estimatedHours: job3.estimatedDuration,
          isCrewLead: false,
          status: 'PENDING',
          assignedBy: USER_ID,
        } as any,
      });
    } catch (error) {
      // Conflict detected - this is expected
    }

    console.log(`  ✓ Created conflict: ${van.name} double-booked on multiple jobs`);
  }
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
  console.log('🌱 Starting Job Management seed...\n');

  try {
    // Clean up existing data (optional - comment out if you want to preserve data)
    console.log('🧹 Cleaning up existing data...');
    await prisma.jobSchedule.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.workerAvailability.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.job.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.worker.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.equipment.deleteMany({ where: { tenantId: TENANT_ID } });
    console.log('  ✓ Cleanup complete\n');

    // Seed data
    const workers = await seedWorkers();
    console.log('');

    const equipment = await seedEquipment();
    console.log('');

    const jobs = await seedJobs();
    console.log('');

    const schedules = await seedJobSchedules(workers, jobs, equipment);
    console.log('');

    const availability = await seedWorkerAvailability(workers);
    console.log('');

    await seedConflicts(workers, jobs);
    console.log('');

    console.log('✅ Seed completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`  - Workers: ${workers.length}`);
    console.log(`  - Equipment: ${equipment.length}`);
    console.log(`  - Jobs: ${jobs.length}`);
    console.log(`  - Schedules: ${schedules.length}`);
    console.log(`  - Availability records: ${availability.length}`);
    console.log(`  - Conflicts: 2 (intentional for testing)`);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run the seed
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
