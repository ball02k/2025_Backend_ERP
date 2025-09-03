-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."OnboardingProject" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingForm" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sections" JSONB,

    CONSTRAINT "OnboardingForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingInvite" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingResponse" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "supplierId" INTEGER,
    "formId" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "files" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "decision" TEXT,

    CONSTRAINT "OnboardingResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectStatus" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectType" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskStatus" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaskStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Client" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "companyRegNo" TEXT,
    "vatNo" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "postcode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clientId" INTEGER,
    "statusId" INTEGER,
    "typeId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "type" TEXT NOT NULL DEFAULT 'General',
    "projectManagerId" INTEGER,
    "country" TEXT,
    "currency" TEXT,
    "unitSystem" TEXT,
    "taxScheme" TEXT,
    "contractForm" TEXT,
    "startPlanned" TIMESTAMP(3),
    "endPlanned" TIMESTAMP(3),
    "startActual" TIMESTAMP(3),
    "endActual" TIMESTAMP(3),
    "labels" JSONB,
    "budget" DECIMAL(18,2),
    "actualSpend" DECIMAL(18,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignee" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "statusId" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contact" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Variation" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" VARCHAR(64),
    "referenceCode" VARCHAR(64),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "contractType" VARCHAR(24) NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(255),
    "reason_code" VARCHAR(64),
    "value" DECIMAL(18,2) NOT NULL,
    "costImpact" DECIMAL(18,2) NOT NULL,
    "timeImpactDays" INTEGER,
    "notes" TEXT,
    "estimated_cost" DECIMAL(18,2),
    "estimated_sell" DECIMAL(18,2),
    "agreed_cost" DECIMAL(18,2),
    "agreed_sell" DECIMAL(18,2),
    "notifiedDate" TIMESTAMP(3),
    "submittedDate" TIMESTAMP(3),
    "submissionDate" TIMESTAMP(3),
    "decisionDate" TIMESTAMP(3),
    "reviewedDate" TIMESTAMP(3),
    "approvedDate" TIMESTAMP(3),
    "rejectedDate" TIMESTAMP(3),
    "instructedDate" TIMESTAMP(3),
    "pricedDate" TIMESTAMP(3),
    "agreedDate" TIMESTAMP(3),
    "voIssuedDate" TIMESTAMP(3),
    "voAcceptedDate" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VariationLine" (
    "id" SERIAL NOT NULL,
    "variationId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cost_code" VARCHAR(64),
    "description" VARCHAR(255) NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "unit" VARCHAR(32),
    "unit_cost" DECIMAL(18,2),
    "unit_sell" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VariationStatusHistory" (
    "id" SERIAL NOT NULL,
    "variationId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromStatus" VARCHAR(24),
    "toStatus" VARCHAR(24) NOT NULL,
    "note" VARCHAR(255),
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectSnapshot" (
    "projectId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "budget" DECIMAL(18,2),
    "committed" DECIMAL(18,2),
    "actual" DECIMAL(18,2),
    "retentionHeld" DECIMAL(18,2),
    "forecastAtComplete" DECIMAL(18,2),
    "variance" DECIMAL(18,2),
    "financialBudget" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financialCommitted" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financialActual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financialForecast" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "schedulePct" INTEGER,
    "criticalAtRisk" INTEGER,
    "variationsDraft" INTEGER,
    "variationsSubmitted" INTEGER,
    "variationsApproved" INTEGER,
    "variationsValueApproved" DECIMAL(18,2),
    "tasksOverdue" INTEGER,
    "tasksDueThisWeek" INTEGER,
    "rfisOpen" INTEGER,
    "rfisAvgAgeDays" INTEGER,
    "qaOpenNCR" INTEGER,
    "qaOpenPunch" INTEGER,
    "hsIncidentsThisMonth" INTEGER,
    "hsOpenPermits" INTEGER,
    "procurementCriticalLate" INTEGER,
    "procurementPOsOpen" INTEGER,
    "carbonTarget" DECIMAL(18,2),
    "carbonToDate" DECIMAL(18,2),
    "carbonUnit" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSnapshot_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentLink" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" BIGINT NOT NULL,
    "projectId" INTEGER,
    "variationId" INTEGER,
    "linkType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordSHA" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Permission" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserRole" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RolePermission" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyRegNo" TEXT,
    "vatNo" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "hsAccreditations" TEXT,
    "performanceScore" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierCapability" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "SupplierCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectMembership" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "supplierId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."POLine" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "poId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "POLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Delivery" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "poId" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Request" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RFP',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deadline" TIMESTAMP(3),
    "stage" INTEGER NOT NULL DEFAULT 1,
    "totalStages" INTEGER NOT NULL DEFAULT 1,
    "weighting" JSONB,
    "addenda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestSection" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "weight" DECIMAL(65,30),
    "order" INTEGER NOT NULL,

    CONSTRAINT "RequestSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestQuestion" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "qType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "weight" DECIMAL(65,30),
    "calc" JSONB,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RequestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestInvite" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "RequestInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestResponse" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "files" JSONB,
    "submittedAt" TIMESTAMP(3),
    "score" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'in_progress',

    CONSTRAINT "RequestResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestQna" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "RequestQna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AwardDecision" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "decidedBy" INTEGER,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AwardDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpmTemplate" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categories" JSONB,
    "kpis" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpmTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpmScorecard" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "totalScore" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpmScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpmScore" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scorecardId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "kpi" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL,
    "value" DECIMAL(65,30),
    "comment" TEXT,

    CONSTRAINT "SpmScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BudgetLine" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "periodMonth" TEXT,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Commitment" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "linkedPoId" INTEGER,
    "ref" TEXT,
    "supplier" TEXT,
    "description" TEXT,
    "category" TEXT,
    "periodMonth" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActualCost" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "ref" TEXT,
    "supplier" TEXT,
    "description" TEXT,
    "category" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "periodMonth" TEXT,

    CONSTRAINT "ActualCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Forecast" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "projectId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "periodMonth" TEXT,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialItem" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Package" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "trade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "budgetEstimate" DECIMAL(65,30),
    "deadline" TIMESTAMP(3),
    "awardValue" DECIMAL(65,30),
    "awardSupplierId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenderInvite" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Invited',

    CONSTRAINT "TenderInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Submission" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" DECIMAL(65,30),
    "durationWeeks" INTEGER,
    "technicalScore" DOUBLE PRECISION,
    "priceScore" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION,
    "rank" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "details" JSONB,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contract" (
    "id" BIGSERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "packageId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contractNumber" TEXT,
    "value" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "signedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "retentionPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "ipAddress" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingProject_tenantId_status_idx" ON "public"."OnboardingProject"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OnboardingForm_tenantId_projectId_idx" ON "public"."OnboardingForm"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "OnboardingInvite_tenantId_projectId_status_idx" ON "public"."OnboardingInvite"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "OnboardingResponse_tenantId_projectId_supplierId_status_idx" ON "public"."OnboardingResponse"("tenantId", "projectId", "supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStatus_tenantId_key_key" ON "public"."ProjectStatus"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectType_tenantId_key_key" ON "public"."ProjectType"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatus_tenantId_key_key" ON "public"."TaskStatus"("tenantId", "key");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "public"."Client"("name");

-- CreateIndex
CREATE INDEX "Client_vatNo_idx" ON "public"."Client"("vatNo");

-- CreateIndex
CREATE INDEX "Client_companyRegNo_idx" ON "public"."Client"("companyRegNo");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "public"."Project"("code");

-- CreateIndex
CREATE INDEX "Project_tenantId_status_idx" ON "public"."Project"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Project_tenantId_name_idx" ON "public"."Project"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Task_tenantId_projectId_idx" ON "public"."Task"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Task_tenantId_projectId_status_idx" ON "public"."Task"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "Task_projectId_dueDate_idx" ON "public"."Task"("projectId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_tenantId_title_idx" ON "public"."Task"("tenantId", "title");

-- CreateIndex
CREATE INDEX "Contact_tenantId_clientId_idx" ON "public"."Contact"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "Contact_clientId_isPrimary_idx" ON "public"."Contact"("clientId", "isPrimary");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "public"."Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_role_idx" ON "public"."Contact"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_clientId_email_key" ON "public"."Contact"("clientId", "email");

-- CreateIndex
CREATE INDEX "Variation_projectId_idx" ON "public"."Variation"("projectId");

-- CreateIndex
CREATE INDEX "Variation_type_idx" ON "public"."Variation"("type");

-- CreateIndex
CREATE INDEX "Variation_status_idx" ON "public"."Variation"("status");

-- CreateIndex
CREATE INDEX "Variation_reference_idx" ON "public"."Variation"("reference");

-- CreateIndex
CREATE INDEX "Variation_referenceCode_idx" ON "public"."Variation"("referenceCode");

-- CreateIndex
CREATE INDEX "Variation_tenantId_projectId_idx" ON "public"."Variation"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Variation_tenantId_projectId_status_idx" ON "public"."Variation"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "Variation_tenantId_projectId_status_updatedAt_idx" ON "public"."Variation"("tenantId", "projectId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Variation_createdAt_idx" ON "public"."Variation"("createdAt");

-- CreateIndex
CREATE INDEX "Variation_updatedAt_idx" ON "public"."Variation"("updatedAt");

-- CreateIndex
CREATE INDEX "Variation_tenantId_title_idx" ON "public"."Variation"("tenantId", "title");

-- CreateIndex
CREATE INDEX "Variation_tenantId_reference_idx" ON "public"."Variation"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "VariationLine_variationId_idx" ON "public"."VariationLine"("variationId");

-- CreateIndex
CREATE INDEX "VariationLine_tenantId_idx" ON "public"."VariationLine"("tenantId");

-- CreateIndex
CREATE INDEX "VariationStatusHistory_variationId_idx" ON "public"."VariationStatusHistory"("variationId");

-- CreateIndex
CREATE INDEX "VariationStatusHistory_tenantId_variationId_changedAt_idx" ON "public"."VariationStatusHistory"("tenantId", "variationId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "public"."Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "public"."Document"("tenantId");

-- CreateIndex
CREATE INDEX "Document_tenantId_uploadedAt_idx" ON "public"."Document"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_projectId_idx" ON "public"."DocumentLink"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_variationId_idx" ON "public"."DocumentLink"("tenantId", "variationId");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_documentId_idx" ON "public"."DocumentLink"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentLink_projectId_idx" ON "public"."DocumentLink"("projectId");

-- CreateIndex
CREATE INDEX "DocumentLink_variationId_idx" ON "public"."DocumentLink"("variationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_email_idx" ON "public"."User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Role_tenantId_name_idx" ON "public"."Role"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "public"."Role"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Permission_tenantId_key_idx" ON "public"."Permission"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_tenantId_key_key" ON "public"."Permission"("tenantId", "key");

-- CreateIndex
CREATE INDEX "UserRole_tenantId_userId_idx" ON "public"."UserRole"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "UserRole_tenantId_roleId_idx" ON "public"."UserRole"("tenantId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_tenantId_userId_roleId_key" ON "public"."UserRole"("tenantId", "userId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_tenantId_roleId_idx" ON "public"."RolePermission"("tenantId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_tenantId_permissionId_idx" ON "public"."RolePermission"("tenantId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_tenantId_roleId_permissionId_key" ON "public"."RolePermission"("tenantId", "roleId", "permissionId");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_name_idx" ON "public"."Supplier"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_status_idx" ON "public"."Supplier"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupplierCapability_tenantId_supplierId_tag_idx" ON "public"."SupplierCapability"("tenantId", "supplierId", "tag");

-- CreateIndex
CREATE INDEX "ProjectMembership_tenantId_projectId_idx" ON "public"."ProjectMembership"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectMembership_tenantId_userId_idx" ON "public"."ProjectMembership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMembership_tenantId_projectId_userId_key" ON "public"."ProjectMembership"("tenantId", "projectId", "userId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_projectId_status_idx" ON "public"."PurchaseOrder"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_supplierId_idx" ON "public"."PurchaseOrder"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_code_key" ON "public"."PurchaseOrder"("tenantId", "code");

-- CreateIndex
CREATE INDEX "POLine_tenantId_poId_idx" ON "public"."POLine"("tenantId", "poId");

-- CreateIndex
CREATE INDEX "Delivery_tenantId_poId_idx" ON "public"."Delivery"("tenantId", "poId");

-- CreateIndex
CREATE INDEX "Delivery_poId_expectedAt_idx" ON "public"."Delivery"("poId", "expectedAt");

-- CreateIndex
CREATE INDEX "Request_tenantId_status_deadline_idx" ON "public"."Request"("tenantId", "status", "deadline");

-- CreateIndex
CREATE INDEX "RequestSection_tenantId_requestId_idx" ON "public"."RequestSection"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "RequestInvite_tenantId_requestId_status_idx" ON "public"."RequestInvite"("tenantId", "requestId", "status");

-- CreateIndex
CREATE INDEX "RequestResponse_tenantId_requestId_supplierId_stage_idx" ON "public"."RequestResponse"("tenantId", "requestId", "supplierId", "stage");

-- CreateIndex
CREATE INDEX "AwardDecision_tenantId_requestId_decision_idx" ON "public"."AwardDecision"("tenantId", "requestId", "decision");

-- CreateIndex
CREATE INDEX "SpmScorecard_tenantId_supplierId_periodMonth_idx" ON "public"."SpmScorecard"("tenantId", "supplierId", "periodMonth");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_projectId_idx" ON "public"."BudgetLine"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_projectId_periodMonth_idx" ON "public"."BudgetLine"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "Commitment_tenantId_projectId_status_idx" ON "public"."Commitment"("tenantId", "projectId", "status");

-- CreateIndex
CREATE INDEX "Commitment_tenantId_projectId_periodMonth_idx" ON "public"."Commitment"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "ActualCost_tenantId_projectId_incurredAt_idx" ON "public"."ActualCost"("tenantId", "projectId", "incurredAt");

-- CreateIndex
CREATE INDEX "ActualCost_tenantId_projectId_periodMonth_idx" ON "public"."ActualCost"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "Forecast_tenantId_projectId_idx" ON "public"."Forecast"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Forecast_tenantId_projectId_periodMonth_idx" ON "public"."Forecast"("tenantId", "projectId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Forecast_tenantId_projectId_period_key" ON "public"."Forecast"("tenantId", "projectId", "period");

-- CreateIndex
CREATE INDEX "FinancialItem_tenantId_projectId_idx" ON "public"."FinancialItem"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Package_projectId_idx" ON "public"."Package"("projectId");

-- CreateIndex
CREATE INDEX "TenderInvite_supplierId_idx" ON "public"."TenderInvite"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderInvite_packageId_supplierId_key" ON "public"."TenderInvite"("packageId", "supplierId");

-- CreateIndex
CREATE INDEX "Submission_packageId_idx" ON "public"."Submission"("packageId");

-- CreateIndex
CREATE INDEX "Submission_supplierId_idx" ON "public"."Submission"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_packageId_supplierId_key" ON "public"."Submission"("packageId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_packageId_key" ON "public"."Contract"("packageId");

-- CreateIndex
CREATE INDEX "Contract_projectId_idx" ON "public"."Contract"("projectId");

-- CreateIndex
CREATE INDEX "Contract_supplierId_idx" ON "public"."Contract"("supplierId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "public"."AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "public"."ProjectStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."ProjectType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "public"."TaskStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Variation" ADD CONSTRAINT "Variation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VariationLine" ADD CONSTRAINT "VariationLine_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "public"."Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VariationStatusHistory" ADD CONSTRAINT "VariationStatusHistory_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "public"."Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierCapability" ADD CONSTRAINT "SupplierCapability_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POLine" ADD CONSTRAINT "POLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "public"."PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Delivery" ADD CONSTRAINT "Delivery_poId_fkey" FOREIGN KEY ("poId") REFERENCES "public"."PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetLine" ADD CONSTRAINT "BudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Commitment" ADD CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActualCost" ADD CONSTRAINT "ActualCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Forecast" ADD CONSTRAINT "Forecast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialItem" ADD CONSTRAINT "FinancialItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Package" ADD CONSTRAINT "Package_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Package" ADD CONSTRAINT "Package_awardSupplierId_fkey" FOREIGN KEY ("awardSupplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderInvite" ADD CONSTRAINT "TenderInvite_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenderInvite" ADD CONSTRAINT "TenderInvite_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_packageId_supplierId_fkey" FOREIGN KEY ("packageId", "supplierId") REFERENCES "public"."TenderInvite"("packageId", "supplierId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

