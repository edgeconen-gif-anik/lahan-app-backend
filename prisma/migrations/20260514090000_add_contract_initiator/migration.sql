-- Track the user who submitted or last re-submitted a contract for admin approval.
ALTER TABLE "Contract" ADD COLUMN "initiatedById" TEXT;

CREATE INDEX "Contract_initiatedById_idx" ON "Contract"("initiatedById");

ALTER TABLE "Contract"
ADD CONSTRAINT "Contract_initiatedById_fkey"
FOREIGN KEY ("initiatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
