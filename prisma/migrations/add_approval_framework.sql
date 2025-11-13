warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- DropForeignKey
ALTER TABLE "public"."project_roles" DROP CONSTRAINT "project_roles_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_roles" DROP CONSTRAINT "project_roles_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_roles" DROP CONSTRAINT "project_roles_deputyUserId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_personas" DROP CONSTRAINT "user_personas_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_workflows" DROP CONSTRAINT "approval_workflows_thresholdId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_workflows" DROP CONSTRAINT "approval_workflows_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_steps" DROP CONSTRAINT "approval_steps_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_steps" DROP CONSTRAINT "approval_steps_projectRoleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_steps" DROP CONSTRAINT "approval_steps_assignedUserId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_steps" DROP CONSTRAINT "approval_steps_decidedBy_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_steps" DROP CONSTRAINT "approval_steps_delegatedTo_fkey";

-- DropForeignKey
ALTER TABLE "public"."custom_field_values" DROP CONSTRAINT "custom_field_values_customFieldId_fkey";

-- DropForeignKey
ALTER TABLE "public"."approval_history" DROP CONSTRAINT "approval_history_userId_fkey";

-- DropTable
DROP TABLE "public"."tenant_settings";

-- DropTable
DROP TABLE "public"."approval_thresholds";

-- DropTable
DROP TABLE "public"."project_roles";

-- DropTable
DROP TABLE "public"."user_personas";

-- DropTable
DROP TABLE "public"."approval_workflows";

-- DropTable
DROP TABLE "public"."approval_steps";

-- DropTable
DROP TABLE "public"."module_settings";

-- DropTable
DROP TABLE "public"."custom_fields";

-- DropTable
DROP TABLE "public"."custom_field_values";

-- DropTable
DROP TABLE "public"."notification_rules";

-- DropTable
DROP TABLE "public"."approval_history";

-- DropEnum
DROP TYPE "public"."EntityType";

-- DropEnum
DROP TYPE "public"."WorkflowStatus";

-- DropEnum
DROP TYPE "public"."ProjectRoleType";

-- DropEnum
DROP TYPE "public"."StepStatus";

-- DropEnum
DROP TYPE "public"."StepDecision";

-- DropEnum
DROP TYPE "public"."ModuleType";

-- DropEnum
DROP TYPE "public"."FieldType";

-- DropEnum
DROP TYPE "public"."NotificationEventType";

-- DropEnum
DROP TYPE "public"."NotificationPreference";

