ALTER TABLE "Company" ADD COLUMN "fiscalYear" TEXT;

DROP INDEX IF EXISTS "Company_panNumber_key";
DROP INDEX IF EXISTS "Company_email_key";
DROP INDEX IF EXISTS "Company_officeRegistrationNumber_key";

CREATE TEMP TABLE "CompanyFiscalYearMap" ON COMMIT DROP AS
WITH "RelatedFiscalYears" AS (
    SELECT DISTINCT
        "Company"."id" AS "companyId",
        "Related"."fiscalYear"
    FROM "Company"
    CROSS JOIN LATERAL (
        SELECT "Project"."fiscalYear"
        FROM "Project"
        WHERE "Project"."companyId" = "Company"."id"

        UNION

        SELECT "Contract"."fiscalYear"
        FROM "Contract"
        WHERE "Contract"."companyId" = "Company"."id"
    ) AS "Related"
    WHERE
        "Related"."fiscalYear" IS NOT NULL
        AND btrim("Related"."fiscalYear") <> ''
),
"DesiredFiscalYears" AS (
    SELECT "companyId", "fiscalYear"
    FROM "RelatedFiscalYears"

    UNION ALL

    SELECT
        "Company"."id",
        COALESCE(
            NULLIF(btrim("SystemSetting"."currentFiscalYear"), ''),
            '2082/083'
        )
    FROM "Company"
    LEFT JOIN "SystemSetting" ON "SystemSetting"."id" = 'default'
    WHERE NOT EXISTS (
        SELECT 1
        FROM "RelatedFiscalYears"
        WHERE "RelatedFiscalYears"."companyId" = "Company"."id"
    )
),
"RankedFiscalYears" AS (
    SELECT
        "companyId",
        "fiscalYear",
        row_number() OVER (
            PARTITION BY "companyId"
            ORDER BY "fiscalYear" DESC
        ) AS "rank"
    FROM "DesiredFiscalYears"
)
SELECT
    "companyId" AS "originalCompanyId",
    "fiscalYear",
    CASE
        WHEN "rank" = 1 THEN "companyId"
        ELSE
            substr(md5("companyId" || ':' || "fiscalYear"), 1, 8) || '-' ||
            substr(md5("companyId" || ':' || "fiscalYear"), 9, 4) || '-' ||
            substr(md5("companyId" || ':' || "fiscalYear"), 13, 4) || '-' ||
            substr(md5("companyId" || ':' || "fiscalYear"), 17, 4) || '-' ||
            substr(md5("companyId" || ':' || "fiscalYear"), 21, 12)
    END AS "mappedCompanyId"
FROM "RankedFiscalYears";

UPDATE "Company"
SET "fiscalYear" = "CompanyFiscalYearMap"."fiscalYear"
FROM "CompanyFiscalYearMap"
WHERE
    "Company"."id" = "CompanyFiscalYearMap"."originalCompanyId"
    AND "CompanyFiscalYearMap"."mappedCompanyId" =
        "CompanyFiscalYearMap"."originalCompanyId";

INSERT INTO "Company" (
    "id",
    "name",
    "panNumber",
    "fiscalYear",
    "address",
    "contactPerson",
    "phoneNumber",
    "email",
    "registrationRequestDate",
    "registrationDate",
    "category",
    "isContracted",
    "panVerified",
    "approvalStatus",
    "approvedAt",
    "remarks",
    "createdAt",
    "updatedAt",
    "voucherNo",
    "officeRegistrationNumber"
)
SELECT
    "CompanyFiscalYearMap"."mappedCompanyId",
    "Company"."name",
    "Company"."panNumber",
    "CompanyFiscalYearMap"."fiscalYear",
    "Company"."address",
    "Company"."contactPerson",
    "Company"."phoneNumber",
    "Company"."email",
    "Company"."registrationRequestDate",
    "Company"."registrationDate",
    "Company"."category",
    "Company"."isContracted",
    "Company"."panVerified",
    "Company"."approvalStatus",
    "Company"."approvedAt",
    "Company"."remarks",
    "Company"."createdAt",
    "Company"."updatedAt",
    "Company"."voucherNo",
    "Company"."officeRegistrationNumber"
FROM "CompanyFiscalYearMap"
JOIN "Company"
    ON "Company"."id" = "CompanyFiscalYearMap"."originalCompanyId"
WHERE
    "CompanyFiscalYearMap"."mappedCompanyId" <>
        "CompanyFiscalYearMap"."originalCompanyId";

UPDATE "Project"
SET "companyId" = "CompanyFiscalYearMap"."mappedCompanyId"
FROM "CompanyFiscalYearMap"
WHERE
    "Project"."companyId" = "CompanyFiscalYearMap"."originalCompanyId"
    AND "Project"."fiscalYear" = "CompanyFiscalYearMap"."fiscalYear";

UPDATE "Contract"
SET "companyId" = "CompanyFiscalYearMap"."mappedCompanyId"
FROM "CompanyFiscalYearMap"
WHERE
    "Contract"."companyId" = "CompanyFiscalYearMap"."originalCompanyId"
    AND "Contract"."fiscalYear" = "CompanyFiscalYearMap"."fiscalYear";

UPDATE "Company"
SET "fiscalYear" = COALESCE(
    (
        SELECT NULLIF(btrim("currentFiscalYear"), '')
        FROM "SystemSetting"
        WHERE "id" = 'default'
    ),
    '2082/083'
)
WHERE "fiscalYear" IS NULL OR btrim("fiscalYear") = '';

ALTER TABLE "Company" ALTER COLUMN "fiscalYear" SET NOT NULL;

CREATE INDEX "Company_fiscalYear_idx" ON "Company"("fiscalYear");
CREATE UNIQUE INDEX "Company_panNumber_fiscalYear_key"
    ON "Company"("panNumber", "fiscalYear");
CREATE UNIQUE INDEX "Company_email_fiscalYear_key"
    ON "Company"("email", "fiscalYear");
CREATE UNIQUE INDEX "Company_officeRegistrationNumber_fiscalYear_key"
    ON "Company"("officeRegistrationNumber", "fiscalYear");
