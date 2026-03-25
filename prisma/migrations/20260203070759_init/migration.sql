-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('NOT_STARTED', 'ONGOING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectImplantedThrough" AS ENUM ('COMPANY', 'USER_COMMITTEE');

-- CreateEnum
CREATE TYPE "CompanyCategory" AS ENUM ('WORKS', 'SUPPLY', 'CONSULTING', 'OTHER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CREATOR', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Designation" AS ENUM ('ASSISTANT_SUB_ENGINEER', 'SUB_ENGINEER', 'ENGINEER');

-- CreateEnum
CREATE TYPE "CommitteeRole" AS ENUM ('PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "designation" "Designation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "panNumber" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "registrationRequestDate" TIMESTAMP(3),
    "registrationDate" TIMESTAMP(3),
    "category" "CompanyCategory",
    "isContracted" BOOLEAN NOT NULL DEFAULT false,
    "panVerified" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCommittee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "formedDate" TIMESTAMP(3) NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCommittee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeOfficial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "role" "CommitteeRole" NOT NULL,
    "userCommitteeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteeOfficial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "budgetCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "allocatedBudget" DECIMAL(65,30) NOT NULL,
    "internalBudget" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "centralBudget" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "provinceBudget" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "ProjectStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "implantedThrough" "ProjectImplantedThrough",
    "companyId" TEXT,
    "userCommitteeId" TEXT,
    "projectManagerId" TEXT,
    "siteInchargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_panNumber_key" ON "Company"("panNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_panNumber_idx" ON "Company"("panNumber");

-- CreateIndex
CREATE INDEX "UserCommittee_name_idx" ON "UserCommittee"("name");

-- CreateIndex
CREATE INDEX "UserCommittee_fiscalYear_idx" ON "UserCommittee"("fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeOfficial_userCommitteeId_role_key" ON "CommitteeOfficial"("userCommitteeId", "role");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_budgetCode_idx" ON "Project"("budgetCode");

-- CreateIndex
CREATE INDEX "Project_fiscalYear_idx" ON "Project"("fiscalYear");

-- AddForeignKey
ALTER TABLE "CommitteeOfficial" ADD CONSTRAINT "CommitteeOfficial_userCommitteeId_fkey" FOREIGN KEY ("userCommitteeId") REFERENCES "UserCommittee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userCommitteeId_fkey" FOREIGN KEY ("userCommitteeId") REFERENCES "UserCommittee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_siteInchargeId_fkey" FOREIGN KEY ("siteInchargeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
