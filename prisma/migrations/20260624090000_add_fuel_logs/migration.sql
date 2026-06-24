-- CreateEnum
CREATE TYPE "FuelLogSource" AS ENUM ('REQUEST_FORM', 'LOGBOOK', 'APP');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL');

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "projectId" TEXT,
    "contractId" TEXT,
    "source" "FuelLogSource" NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "quantityLiters" DECIMAL(65,30) NOT NULL,
    "ratePerLiter" DECIMAL(65,30),
    "totalAmount" DECIMAL(65,30),
    "vehicleNumber" TEXT,
    "odometerReading" INTEGER,
    "purpose" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelLog_userId_idx" ON "FuelLog"("userId");

-- CreateIndex
CREATE INDEX "FuelLog_requestedById_idx" ON "FuelLog"("requestedById");

-- CreateIndex
CREATE INDEX "FuelLog_approvedById_idx" ON "FuelLog"("approvedById");

-- CreateIndex
CREATE INDEX "FuelLog_projectId_idx" ON "FuelLog"("projectId");

-- CreateIndex
CREATE INDEX "FuelLog_contractId_idx" ON "FuelLog"("contractId");

-- CreateIndex
CREATE INDEX "FuelLog_approvalStatus_idx" ON "FuelLog"("approvalStatus");

-- CreateIndex
CREATE INDEX "FuelLog_logDate_idx" ON "FuelLog"("logDate");

-- CreateIndex
CREATE INDEX "FuelLog_source_idx" ON "FuelLog"("source");

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
