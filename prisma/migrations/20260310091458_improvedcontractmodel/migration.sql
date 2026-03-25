-- DropForeignKey
ALTER TABLE "Contract" DROP CONSTRAINT "Contract_companyId_fkey";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "userCommitteeId" TEXT,
ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Contract_userCommitteeId_idx" ON "Contract"("userCommitteeId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_userCommitteeId_fkey" FOREIGN KEY ("userCommitteeId") REFERENCES "UserCommittee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
