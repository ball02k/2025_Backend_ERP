-- CreateIndex
CREATE INDEX "Project_tenantId_name_idx" ON "public"."Project"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Task_tenantId_title_idx" ON "public"."Task"("tenantId", "title");

-- CreateIndex
CREATE INDEX "Variation_tenantId_title_idx" ON "public"."Variation"("tenantId", "title");

-- CreateIndex
CREATE INDEX "Variation_tenantId_reference_idx" ON "public"."Variation"("tenantId", "reference");
