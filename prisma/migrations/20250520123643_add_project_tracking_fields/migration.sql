-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "actual_completion" TIMESTAMP(3),
ADD COLUMN     "actual_spend" DOUBLE PRECISION,
ADD COLUMN     "estimated_completion" TIMESTAMP(3),
ADD COLUMN     "milestone_summary" TEXT,
ADD COLUMN     "priority_label" TEXT,
ADD COLUMN     "project_tags" TEXT[],
ADD COLUMN     "team_notes" TEXT;
