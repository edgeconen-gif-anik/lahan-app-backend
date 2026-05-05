INSERT INTO "SystemSetting" (
    "id",
    "currentFiscalYear",
    "createdAt",
    "updatedAt"
)
VALUES (
    'default',
    '2082/083',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE
SET
    "currentFiscalYear" = '2082/083',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE
    "SystemSetting"."currentFiscalYear" IS NULL
    OR btrim("SystemSetting"."currentFiscalYear") = ''
    OR "SystemSetting"."currentFiscalYear" IN (
        '2081/082',
        '2081/82',
        '2081-082',
        '2081-82',
        '2082/83',
        '2082-083',
        '2082-83'
    );

DROP INDEX IF EXISTS "Project_name_key";

CREATE UNIQUE INDEX "Project_name_type_budgetCode_fiscalYear_key"
ON "Project"("name", "type", "budgetCode", "fiscalYear");

ALTER TABLE "Contract" ADD COLUMN "fiscalYear" TEXT;

UPDATE "Contract"
SET "fiscalYear" = COALESCE("Project"."fiscalYear", '2082/083')
FROM "Project"
WHERE "Contract"."projectId" = "Project"."id";

UPDATE "Contract"
SET "fiscalYear" = '2082/083'
WHERE "fiscalYear" IS NULL OR btrim("fiscalYear") = '';

ALTER TABLE "Contract" ALTER COLUMN "fiscalYear" SET NOT NULL;

CREATE INDEX "Contract_fiscalYear_idx" ON "Contract"("fiscalYear");
