-- Add final evaluated amount for contract completion/project updates
ALTER TABLE "Contract"
ADD COLUMN "finalEvaluatedAmount" DECIMAL(65,30);
