CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Company"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "UserCommittee"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "Contract"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "Company"
SET "approvedAt" = COALESCE("approvedAt", "createdAt")
WHERE "approvalStatus" = 'APPROVED' AND "approvedAt" IS NULL;

UPDATE "UserCommittee"
SET "approvedAt" = COALESCE("approvedAt", "createdAt")
WHERE "approvalStatus" = 'APPROVED' AND "approvedAt" IS NULL;

UPDATE "Contract"
SET "approvedAt" = COALESCE("approvedAt", "createdAt")
WHERE "approvalStatus" = 'APPROVED' AND "approvedAt" IS NULL;
