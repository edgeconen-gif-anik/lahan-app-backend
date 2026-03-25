/*
  Warnings:

  - The values [COMPANY] on the enum `ProjectImplantedThrough` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProjectImplantedThrough_new" AS ENUM ('COMP', 'USER_COMMITTEE');
ALTER TABLE "Project" ALTER COLUMN "implantedThrough" TYPE "ProjectImplantedThrough_new" USING ("implantedThrough"::text::"ProjectImplantedThrough_new");
ALTER TYPE "ProjectImplantedThrough" RENAME TO "ProjectImplantedThrough_old";
ALTER TYPE "ProjectImplantedThrough_new" RENAME TO "ProjectImplantedThrough";
DROP TYPE "public"."ProjectImplantedThrough_old";
COMMIT;

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "agreementDate" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "contractorSignatory" TEXT,
    "officeSignatory" TEXT,
    "witnessName" TEXT,
    "contractorSignedAt" TIMESTAMP(3),
    "officeSignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workCompletionDate" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "contractorSignatory" TEXT,
    "officeSignatory" TEXT,
    "witnessName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_contractId_key" ON "Agreement"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_contractId_key" ON "WorkOrder"("contractId");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
