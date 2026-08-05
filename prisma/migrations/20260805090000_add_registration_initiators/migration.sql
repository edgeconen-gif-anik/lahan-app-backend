-- Record who submitted company and user-committee registrations.
-- Existing records remain valid with an unknown initiator.
ALTER TABLE "Company" ADD COLUMN "initiatedById" TEXT;
ALTER TABLE "UserCommittee" ADD COLUMN "initiatedById" TEXT;

CREATE INDEX "Company_initiatedById_idx" ON "Company"("initiatedById");
CREATE INDEX "UserCommittee_initiatedById_idx" ON "UserCommittee"("initiatedById");

ALTER TABLE "Company"
ADD CONSTRAINT "Company_initiatedById_fkey"
FOREIGN KEY ("initiatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserCommittee"
ADD CONSTRAINT "UserCommittee_initiatedById_fkey"
FOREIGN KEY ("initiatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
