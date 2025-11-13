-- ==============================================================================
-- SETTINGS & APPROVAL FRAMEWORK MIGRATION
-- Adds comprehensive configurable approval system
-- ==============================================================================

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE "EntityType" AS ENUM (
  'PACKAGE',
  'CONTRACT',
  'VARIATION',
  'PAYMENT_APPLICATION',
  'BUDGET',
  'PROCUREMENT_REQUEST',
  'DESIGN_CHANGE',
  'PURCHASE_ORDER'
);

CREATE TYPE "WorkflowStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'OVERRIDDEN'
);

CREATE TYPE "ProjectRoleType" AS ENUM (
  'PROJECT_MANAGER',
  'COMMERCIAL_MANAGER',
  'CONSTRUCTION_MANAGER',
  'PACKAGE_MANAGER',
  'DESIGN_LEAD',
  'QS_COST_MANAGER',
  'PLANNING_ENGINEER',
  'HSQE_MANAGER',
  'SITE_MANAGER',
  'PROJECT_DIRECTOR',
  'CONTRACTS_MANAGER',
  'PROCUREMENT_MANAGER',
  'CLIENT_REPRESENTATIVE',
  'QUANTITY_SURVEYOR'
);

CREATE TYPE "StepStatus" AS ENUM (
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'SKIPPED',
  'OVERRIDDEN'
);

CREATE TYPE "StepDecision" AS ENUM (
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'REJECTED',
  'CHANGES_REQUIRED',
  'REFER_UP',
  'DEFER'
);

CREATE TYPE "ModuleType" AS ENUM (
  'PROJECTS',
  'BUDGET',
  'PACKAGES',
  'TENDERS',
  'DIRECT_AWARDS',
  'INTERNAL_ALLOCATION',
  'CONTRACTS',
  'VARIATIONS',
  'PAYMENT_APPLICATIONS',
  'INVOICES',
  'PURCHASE_ORDERS',
  'JOB_SCHEDULING',
  'RESOURCES',
  'DOCUMENTS',
  'ANALYTICS',
  'SUPPLIERS',
  'DIARY'
);

CREATE TYPE "FieldType" AS ENUM (
  'TEXT',
  'NUMBER',
  'DATE',
  'DROPDOWN',
  'MULTI_SELECT',
  'CHECKBOX',
  'TEXTAREA',
  'CURRENCY',
  'PERCENTAGE',
  'EMAIL',
  'PHONE',
  'URL',
  'FILE_UPLOAD'
);

CREATE TYPE "NotificationEventType" AS ENUM (
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'APPROVAL_REJECTED',
  'APPROVAL_OVERDUE',
  'ENTITY_CREATED',
  'ENTITY_UPDATED',
  'ENTITY_DELETED',
  'DEADLINE_APPROACHING',
  'BUDGET_THRESHOLD_EXCEEDED',
  'STATUS_CHANGED',
  'DOCUMENT_UPLOADED',
  'COMMENT_ADDED',
  'USER_MENTIONED',
  'WORKFLOW_COMPLETE'
);

CREATE TYPE "NotificationPreference" AS ENUM (
  'EMAIL_ONLY',
  'IN_APP_ONLY',
  'EMAIL_AND_IN_APP',
  'SMS_ONLY',
  'ALL_CHANNELS',
  'NONE'
);

-- ============================================
-- TENANT SETTINGS
-- ============================================

CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modulesEnabled" JSONB NOT NULL DEFAULT '{"tenders": true, "directAwards": true, "internalAllocation": false}',
    "defaultApprovalWorkflows" JSONB,
    "notificationDefaults" JSONB,
    "documentRetentionDays" INTEGER NOT NULL DEFAULT 2555,
    "companyName" TEXT,
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyLogo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_settings_tenantId_key" ON "tenant_settings"("tenantId");
CREATE INDEX "tenant_settings_tenantId_idx" ON "tenant_settings"("tenantId");

-- ============================================
-- APPROVAL THRESHOLDS
-- ============================================

CREATE TABLE "approval_thresholds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "minValue" DECIMAL(12,2) NOT NULL,
    "maxValue" DECIMAL(12,2),
    "approvalSteps" JSONB NOT NULL,
    "requiresRiskAssessment" BOOLEAN NOT NULL DEFAULT false,
    "requiresDesignReview" BOOLEAN NOT NULL DEFAULT false,
    "requiresHSQE" BOOLEAN NOT NULL DEFAULT false,
    "requiresClientApproval" BOOLEAN NOT NULL DEFAULT false,
    "targetApprovalDays" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_thresholds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_thresholds_tenantId_entityType_idx" ON "approval_thresholds"("tenantId", "entityType");
CREATE INDEX "approval_thresholds_tenantId_entityType_minValue_maxValue_idx" ON "approval_thresholds"("tenantId", "entityType", "minValue", "maxValue");
CREATE INDEX "approval_thresholds_tenantId_isActive_idx" ON "approval_thresholds"("tenantId", "isActive");

-- ============================================
-- PROJECT ROLES
-- ============================================

CREATE TABLE "project_roles" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "ProjectRoleType" NOT NULL,
    "deputyUserId" INTEGER,
    "canApprovePackages" BOOLEAN NOT NULL DEFAULT false,
    "canApproveContracts" BOOLEAN NOT NULL DEFAULT false,
    "canApproveVariations" BOOLEAN NOT NULL DEFAULT false,
    "canApprovePayments" BOOLEAN NOT NULL DEFAULT false,
    "receiveNotifications" BOOLEAN NOT NULL DEFAULT true,
    "notificationPreference" "NotificationPreference" NOT NULL DEFAULT 'EMAIL_AND_IN_APP',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_roles_projectId_userId_role_key" ON "project_roles"("projectId", "userId", "role");
CREATE INDEX "project_roles_projectId_role_isActive_idx" ON "project_roles"("projectId", "role", "isActive");
CREATE INDEX "project_roles_userId_isActive_idx" ON "project_roles"("userId", "isActive");

-- ============================================
-- USER PERSONAS
-- ============================================

CREATE TABLE "user_personas" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "persona" "ProjectRoleType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canLead" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "maxApprovalValue" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_personas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_personas_userId_persona_key" ON "user_personas"("userId", "persona");
CREATE INDEX "user_personas_userId_idx" ON "user_personas"("userId");

-- ============================================
-- APPROVAL WORKFLOWS
-- ============================================

CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityValue" DECIMAL(12,2),
    "thresholdId" TEXT,
    "projectId" INTEGER NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedBy" TEXT NOT NULL,
    "initiatedByUser" INTEGER,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_workflows_entityType_entityId_idx" ON "approval_workflows"("entityType", "entityId");
CREATE INDEX "approval_workflows_projectId_status_idx" ON "approval_workflows"("projectId", "status");
CREATE INDEX "approval_workflows_tenantId_status_idx" ON "approval_workflows"("tenantId", "status");
CREATE INDEX "approval_workflows_tenantId_entityType_idx" ON "approval_workflows"("tenantId", "entityType");
CREATE INDEX "approval_workflows_isOverdue_idx" ON "approval_workflows"("isOverdue");

-- ============================================
-- APPROVAL STEPS
-- ============================================

CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "role" "ProjectRoleType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "projectRoleId" TEXT,
    "assignedUserId" INTEGER,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "StepDecision",
    "decidedBy" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "comments" TEXT,
    "conditions" TEXT,
    "dueDate" TIMESTAMP(3),
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "delegatedTo" INTEGER,
    "delegatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_steps_workflowId_stage_idx" ON "approval_steps"("workflowId", "stage");
CREATE INDEX "approval_steps_assignedUserId_status_idx" ON "approval_steps"("assignedUserId", "status");
CREATE INDEX "approval_steps_status_dueDate_idx" ON "approval_steps"("status", "dueDate");

-- ============================================
-- MODULE SETTINGS
-- ============================================

CREATE TABLE "module_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" "ModuleType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "displayName" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "displayOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "module_settings_tenantId_module_key" ON "module_settings"("tenantId", "module");
CREATE INDEX "module_settings_tenantId_isEnabled_idx" ON "module_settings"("tenantId", "isEnabled");

-- ============================================
-- CUSTOM FIELDS
-- ============================================

CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "projectId" INTEGER,
    "fieldName" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "displayOrder" INTEGER NOT NULL,
    "helpText" TEXT,
    "placeholder" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_fields_tenantId_entityType_fieldKey_key" ON "custom_fields"("tenantId", "entityType", "fieldKey");
CREATE INDEX "custom_fields_tenantId_entityType_idx" ON "custom_fields"("tenantId", "entityType");
CREATE INDEX "custom_fields_projectId_idx" ON "custom_fields"("projectId");

-- ============================================
-- CUSTOM FIELD VALUES
-- ============================================

CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_field_values_customFieldId_entityId_key" ON "custom_field_values"("customFieldId", "entityId");
CREATE INDEX "custom_field_values_entityType_entityId_idx" ON "custom_field_values"("entityType", "entityId");

-- ============================================
-- NOTIFICATION RULES
-- ============================================

CREATE TABLE "notification_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" "NotificationEventType" NOT NULL,
    "entityType" "EntityType",
    "roles" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "templateId" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "inAppTitle" TEXT,
    "inAppBody" TEXT,
    "conditions" JSONB,
    "sendImmediately" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_rules_tenantId_eventType_idx" ON "notification_rules"("tenantId", "eventType");
CREATE INDEX "notification_rules_tenantId_isActive_idx" ON "notification_rules"("tenantId", "isActive");

-- ============================================
-- APPROVAL HISTORY
-- ============================================

CREATE TABLE "approval_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userId" INTEGER,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_history_workflowId_idx" ON "approval_history"("workflowId");
CREATE INDEX "approval_history_tenantId_createdAt_idx" ON "approval_history"("tenantId", "createdAt");
CREATE INDEX "approval_history_userId_idx" ON "approval_history"("userId");

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

-- Project Roles
ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_deputyUserId_fkey"
    FOREIGN KEY ("deputyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User Personas
ALTER TABLE "user_personas" ADD CONSTRAINT "user_personas_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approval Workflows
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_thresholdId_fkey"
    FOREIGN KEY ("thresholdId") REFERENCES "approval_thresholds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approval Steps
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_projectRoleId_fkey"
    FOREIGN KEY ("projectRoleId") REFERENCES "project_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_decidedBy_fkey"
    FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_delegatedTo_fkey"
    FOREIGN KEY ("delegatedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom Field Values
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_customFieldId_fkey"
    FOREIGN KEY ("customFieldId") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approval History
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
