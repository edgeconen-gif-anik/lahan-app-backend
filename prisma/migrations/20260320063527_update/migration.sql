-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_projectManagerId_fkey";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "siteInchargeId" TEXT;

-- CreateIndex
CREATE INDEX "Contract_siteInchargeId_idx" ON "Contract"("siteInchargeId");

-- CreateIndex
CREATE INDEX "Project_siteInchargeId_idx" ON "Project"("siteInchargeId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_siteInchargeId_fkey" FOREIGN KEY ("siteInchargeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
