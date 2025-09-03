"use strict";

/**
 * Seed script for local demo data.
 * - Safe to re-run: uses upserts.
 * - Skips sections if tables are missing (lets you seed partially while migrations are stabilizing).
 * - Honors invariants: tenant scoping, Int/BigInt, no enums.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const TENANT_ID = "demo";

// Helpers
async function tableExists(tableName) {
  try {
    // Try a trivial count via Prisma. If model doesn't exist, this will throw.
    switch (tableName) {
      case "tenant":   return !!(await prisma.tenant?.count?.());
      case "user":     return !!(await prisma.user?.count?.());
      case "role":     return !!(await prisma.role?.count?.());
      case "userRole": return !!(await prisma.userRole?.count?.());
      case "client":   return !!(await prisma.client?.count?.({ where: { tenantId: TENANT_ID } }));
      case "supplier": return !!(await prisma.supplier?.count?.({ where: { tenantId: TENANT_ID } }));
      case "contact":  return !!(await prisma.contact?.count?.({ where: { tenantId: TENANT_ID } }));
      case "project":  return !!(await prisma.project?.count?.({ where: { tenantId: TENANT_ID } }));
      case "task":     return !!(await prisma.task?.count?.({ where: { tenantId: TENANT_ID } }));
      case "package":  return !!(await prisma.package?.count?.({ where: { tenantId: TENANT_ID } }));
      case "rfx":      return !!(await prisma.rfx?.count?.({ where: { tenantId: TENANT_ID } }));
      case "rfxCriterion": return !!(await prisma.rfxCriterion?.count?.());
      case "rfxInvite":    return !!(await prisma.rfxInvite?.count?.());
      case "rfxSubmission":return !!(await prisma.rfxSubmission?.count?.());
      case "rfxScore":     return !!(await prisma.rfxScore?.count?.());
      case "rfxAward":     return !!(await prisma.rfxAward?.count?.());
      case "contract":     return !!(await prisma.contract?.count?.({ where: { tenantId: TENANT_ID } }));
      case "procurementMilestone": return !!(await prisma.procurementMilestone?.count?.());
      case "cvrImpact":    return !!(await prisma.cvrImpact?.count?.());
      default: return false;
    }
  } catch {
    return false;
  }
}

async function run() {
  console.log("Seeding demo data for tenant:", TENANT_ID);

  // --- Tenant, User, Roles ---
  const hasTenantModel = await tableExists("tenant");
  let tenant;
  if (hasTenantModel) {
    tenant = await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: { id: TENANT_ID, name: "Demo Tenant" },
    });
  }

  const hasUser = await tableExists("user");
  const hasRole = await tableExists("role");
  const hasUserRole = await tableExists("userRole");

  let adminUser;
  if (hasUser) {
    adminUser = await prisma.user.upsert({
      where: { id: 1 }, // dev assumption
      update: {},
      create: {
        id: 1,
        tenantId: TENANT_ID,
        email: "admin@demo.local",
        name: "Demo Admin",
        // store a harmless placeholder; real JWT comes from your auth
      },
    });
  }
  if (hasRole) {
    const adminRole = await prisma.role.upsert({
      where: { name_tenantId: { name: "admin", tenantId: TENANT_ID } },
      update: {},
      create: { name: "admin", tenantId: TENANT_ID },
    });
    if (hasUserRole && adminUser) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: { userId: adminUser.id, roleId: adminRole.id },
        },
        update: {},
        create: { userId: adminUser.id, roleId: adminRole.id, tenantId: TENANT_ID },
      });
    }
  }

  // --- Clients ---
  const hasClient = await tableExists("client");
  let clientA;
  if (hasClient) {
    clientA = await prisma.client.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name: "Canary Wharf Group" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        name: "Canary Wharf Group",
        companyRegNo: "04136077",
        vatNumber: "GB123456789",
        addressLine1: "1 Canada Square",
        city: "London",
        postcode: "E14 5AB",
        turnover: 1000000000,
      },
    });
  }

  // --- Suppliers ---
  const hasSupplier = await tableExists("supplier");
  let supplierA, supplierB;
  if (hasSupplier) {
    supplierA = await prisma.supplier.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name: "Alpha Steel Ltd" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        name: "Alpha Steel Ltd",
        companyRegNo: "01234567",
        vatNumber: "GB111111111",
        trade: "Structural Steel",
        complianceStatus: "valid",
        insuranceExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180), // +180d
      },
    });
    supplierB = await prisma.supplier.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name: "Beta MEP Services" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        name: "Beta MEP Services",
        companyRegNo: "07654321",
        vatNumber: "GB222222222",
        trade: "MEP",
        complianceStatus: "valid",
        insuranceExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 120),
      },
    });
  }

  // --- Contacts ---
  const hasContact = await tableExists("contact");
  if (hasContact && clientA) {
    await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: TENANT_ID, email: "pm@cwgroup.co.uk" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        clientId: clientA.id,
        name: "Client PM",
        email: "pm@cwgroup.co.uk",
      },
    });
  }

  // --- Projects ---
  const hasProject = await tableExists("project");
  let projectX;
  if (hasProject) {
    projectX = await prisma.project.upsert({
      where: { tenantId_code: { tenantId: TENANT_ID, code: "CWG-001" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        code: "CWG-001",
        name: "Canada Square Podium Refurb",
        clientId: clientA?.id ?? null,
        status: "active",
        sector: "commercial",
        contractType: "NEC4",
        estimatedCompletionDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 200),
        riskLevel: "medium",
        carbonTargetTCO2e: 1500,
      },
    });
  }

  // --- Packages ---
  const hasPackage = await tableExists("package");
  let pkgSteel, pkgMEP;
  if (hasPackage && projectX) {
    pkgSteel = await prisma.package.upsert({
      where: { tenantId_projectId_code: { tenantId: TENANT_ID, projectId: projectX.id, code: "PKG-STL" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        projectId: projectX.id,
        code: "PKG-STL",
        title: "Structural Steel Package",
        trade: "Structural Steel",
        budget: 2500000.00,
        leadTimeDays: 60,
      },
    });
    pkgMEP = await prisma.package.upsert({
      where: { tenantId_projectId_code: { tenantId: TENANT_ID, projectId: projectX.id, code: "PKG-MEP" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        projectId: projectX.id,
        code: "PKG-MEP",
        title: "MEP Package",
        trade: "MEP",
        budget: 1800000.00,
        leadTimeDays: 45,
      },
    });
  }

  // --- Tasks ---
  const hasTask = await tableExists("task");
  if (hasTask && projectX) {
    await prisma.task.upsert({
      where: { tenantId_projectId_title: { tenantId: TENANT_ID, projectId: projectX.id, title: "Kick-off Meeting" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        projectId: projectX.id,
        title: "Kick-off Meeting",
        status: "open",
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
  }

  // --- RFx skeleton ---
  const hasRfx = await tableExists("rfx");
  const hasRfxCriterion = await tableExists("rfxCriterion");
  const hasRfxInvite = await tableExists("rfxInvite");
  const hasRfxSubmission = await tableExists("rfxSubmission");
  const hasRfxScore = await tableExists("rfxScore");
  const hasRfxAward = await tableExists("rfxAward");

  let rfxSteel;
  if (hasRfx && projectX && pkgSteel) {
    rfxSteel = await prisma.rfx.upsert({
      where: { tenantId_projectId_title: { tenantId: TENANT_ID, projectId: projectX.id, title: "RFX - Structural Steel" } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        projectId: projectX.id,
        title: "RFX - Structural Steel",
        status: "open",
        dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        createdById: adminUser?.id ?? 1,
      },
    });
  }

  if (rfxSteel && hasRfxCriterion) {
    const crits = [
      { key: "price", label: "Price", weight: 0.50, category: "commercial" },
      { key: "programme", label: "Programme", weight: 0.20, category: "delivery" },
      { key: "technical", label: "Technical", weight: 0.15, category: "quality" },
      { key: "h_s", label: "H&S", weight: 0.10, category: "safety" },
      { key: "esg", label: "ESG/Social Value", weight: 0.05, category: "esg" },
    ];
    for (const c of crits) {
      await prisma.rfxCriterion.upsert({
        where: { rfxId_key: { rfxId: rfxSteel.id, key: c.key } },
        update: { label: c.label, weight: c.weight, category: c.category },
        create: { rfxId: rfxSteel.id, key: c.key, label: c.label, weight: c.weight, category: c.category },
      });
    }
  }

  if (rfxSteel && hasRfxInvite) {
    if (supplierA) {
      await prisma.rfxInvite.upsert({
        where: { rfxId_supplierId: { rfxId: rfxSteel.id, supplierId: supplierA.id } },
        update: {},
        create: { rfxId: rfxSteel.id, supplierId: supplierA.id, status: "invited", invitedAt: new Date() },
      });
    }
    if (supplierB) {
      await prisma.rfxInvite.upsert({
        where: { rfxId_supplierId: { rfxId: rfxSteel.id, supplierId: supplierB.id } },
        update: {},
        create: { rfxId: rfxSteel.id, supplierId: supplierB.id, status: "invited", invitedAt: new Date() },
      });
    }
  }

  // Dummy submission & scores from Alpha Steel
  let subA;
  if (rfxSteel && supplierA && hasRfxSubmission) {
    subA = await prisma.rfxSubmission.upsert({
      where: { rfxId_supplierId: { rfxId: rfxSteel.id, supplierId: supplierA.id } },
      update: { totalPrice: 2400000.00, programmeWeeks: 20, submittedAt: new Date() },
      create: { rfxId: rfxSteel.id, supplierId: supplierA.id, totalPrice: 2400000.00, programmeWeeks: 20, submittedAt: new Date() },
    });
  }

  if (subA && hasRfxScore) {
    const crits = await prisma.rfxCriterion.findMany({ where: { rfxId: rfxSteel.id } });
    for (const c of crits) {
      const base =
        c.key === "price" ? 0.9 :
        c.key === "programme" ? 0.8 :
        c.key === "technical" ? 0.85 :
        c.key === "h_s" ? 0.95 :
        c.key === "esg" ? 0.7 : 0.8;
      await prisma.rfxScore.upsert({
        where: { submissionId_criterionId: { submissionId: subA.id, criterionId: c.id } },
        update: { autoScore: base, manualScore: base, overridden: false },
        create: { submissionId: subA.id, criterionId: c.id, autoScore: base, manualScore: base, overridden: false },
      });
    }
  }

  // Award -> Contract
  const hasContract = await tableExists("contract");
  let awardRow, contractRow;
  if (rfxSteel && pkgSteel && supplierA && hasRfxAward) {
    awardRow = await prisma.rfxAward.upsert({
      where: { rfxId_supplierId: { rfxId: rfxSteel.id, supplierId: supplierA.id } },
      update: { packageId: pkgSteel.id, awardedAt: new Date(), awardedById: adminUser?.id ?? 1, rationale: "Best value" },
      create: { rfxId: rfxSteel.id, supplierId: supplierA.id, packageId: pkgSteel.id, awardedAt: new Date(), awardedById: adminUser?.id ?? 1, rationale: "Best value" },
    });
  }
  if (awardRow && hasContract && projectX) {
    contractRow = await prisma.contract.upsert({
      where: { tenantId_number: { tenantId: TENANT_ID, number: "CWG-001-STL-001" } },
      update: { status: "signed" },
      create: {
        tenantId: TENANT_ID,
        projectId: projectX.id,
        supplierId: supplierA.id,
        rfxId: rfxSteel.id,
        awardId: awardRow.id,
        type: "Subcontract",
        number: "CWG-001-STL-001",
        status: "signed",
        amount: 2400000.00,
        currency: "GBP",
        eSignProvider: "stub",
        eSignEnvelopeId: "DEMO-ENV-1",
        signedAt: new Date(),
      },
    });
  }

  // Procurement Milestones
  const hasMilestone = await tableExists("procurementMilestone");
  if (hasMilestone && projectX && contractRow && pkgSteel) {
    const now = new Date();
    const addD = d => new Date(now.getTime() + 1000 * 60 * 60 * 24 * d);
    const chain = [
      { title: "Award", type: "award", start: 0, finish: 0 },
      { title: "Manufacture", type: "manufacture", start: 7, finish: 60 },
      { title: "Delivery", type: "delivery", start: 61, finish: 65 },
      { title: "Install", type: "install", start: 66, finish: 95 },
    ];
    let prevId = null;
    for (const m of chain) {
      const row = await prisma.procurementMilestone.create({
        data: {
          tenantId: TENANT_ID,
          projectId: projectX.id,
          packageId: pkgSteel.id,
          contractId: contractRow.id,
          title: m.title,
          type: m.type,
          plannedStart: addD(m.start),
          plannedFinish: addD(m.finish),
          status: "planned",
          predecessorId: prevId,
        },
      });
      prevId = row.id;
    }
  }

  // CVR Impact (simple demo)
  const hasCvrImpact = await tableExists("cvrImpact");
  if (hasCvrImpact && projectX) {
    const month0 = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await prisma.cvrImpact.upsert({
      where: { projectId_month_source_sourceId: { projectId: projectX.id, month: month0, source: "award", sourceId: contractRow?.id ?? 1 } },
      update: { amount: 2400000.00, note: "Award committed" },
      create: { projectId: projectX.id, month: month0, source: "award", sourceId: contractRow?.id ?? 1, amount: 2400000.00, note: "Award committed" },
    });
  }

  console.log("✅ Seed completed.");
}

run()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
