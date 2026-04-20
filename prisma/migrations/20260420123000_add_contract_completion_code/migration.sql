-- Add unique completion code for final completion paperwork
ALTER TABLE "Contract"
ADD COLUMN "completionCode" TEXT;

CREATE UNIQUE INDEX "Contract_completionCode_key"
ON "Contract"("completionCode");
