-- CreateTable
CREATE TABLE "public"."Contact" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
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

-- AddForeignKey
ALTER TABLE "public"."Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Contact_clientId_isPrimary_idx" ON "public"."Contact"("clientId", "isPrimary");
CREATE INDEX "Contact_email_idx" ON "public"."Contact"("email");
CREATE INDEX "Contact_role_idx" ON "public"."Contact"("role");
CREATE UNIQUE INDEX "Contact_clientId_email_key" ON "public"."Contact"("clientId", "email");

-- CreateIndex for Client fields
CREATE INDEX "Client_name_idx" ON "public"."Client"("name");
CREATE INDEX "Client_vatNo_idx" ON "public"."Client"("vatNo");
CREATE INDEX "Client_companyRegNo_idx" ON "public"."Client"("companyRegNo");
