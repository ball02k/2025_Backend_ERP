-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "company_reg" TEXT,
    "vat_number" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "turnover" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "project_code" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "description" TEXT,
    "client_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "location" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "budget" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'GBP',
    "project_manager" TEXT,
    "quantity_surveyor" TEXT,
    "contract_type" TEXT,
    "procurement_route" TEXT,
    "sector" TEXT,
    "work_stage" TEXT,
    "risk_level" TEXT,
    "carbon_target" DOUBLE PRECISION,
    "carbon_measured" DOUBLE PRECISION,
    "progress_pct" INTEGER,
    "is_flagged" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_project_code_key" ON "Project"("project_code");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
