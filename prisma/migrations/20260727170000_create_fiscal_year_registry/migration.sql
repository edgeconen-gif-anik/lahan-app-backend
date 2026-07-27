CREATE TABLE "FiscalYear" (
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("value")
);

INSERT INTO "FiscalYear" ("value")
SELECT DISTINCT "fiscalYear"
FROM (
    SELECT "fiscalYear" FROM "Company"
    UNION ALL
    SELECT "fiscalYear" FROM "Project"
    UNION ALL
    SELECT "fiscalYear" FROM "UserCommittee"
    UNION ALL
    SELECT "fiscalYear" FROM "Contract"
    UNION ALL
    SELECT "currentFiscalYear" AS "fiscalYear" FROM "SystemSetting"
) AS "ExistingFiscalYears"
WHERE "fiscalYear" IS NOT NULL AND btrim("fiscalYear") <> ''
ON CONFLICT ("value") DO NOTHING;

-- Preserve the next rollover year even before it has records. This restores
-- the year that used to disappear when the active setting was switched back.
INSERT INTO "FiscalYear" ("value")
SELECT
    ((substring("currentFiscalYear" FROM '^([0-9]{4})')::integer) + 1)::text
    || '/' ||
    right(
        ((substring("currentFiscalYear" FROM '^([0-9]{4})')::integer) + 2)::text,
        3
    )
FROM "SystemSetting"
WHERE "currentFiscalYear" ~ '^[0-9]{4}[/-][0-9]{2,3}$'
ON CONFLICT ("value") DO NOTHING;
