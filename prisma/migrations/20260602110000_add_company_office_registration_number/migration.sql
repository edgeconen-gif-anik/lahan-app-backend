ALTER TABLE "Company"
ADD COLUMN "officeRegistrationNumber" TEXT;

CREATE UNIQUE INDEX "Company_officeRegistrationNumber_key"
ON "Company"("officeRegistrationNumber");
