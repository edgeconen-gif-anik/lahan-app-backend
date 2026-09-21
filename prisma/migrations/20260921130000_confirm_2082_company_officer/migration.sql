BEGIN;

-- Explicit owner confirmation: company certificates registered in FY 2082/83.
-- Fill only unresolved approved certificates; never replace a recorded officer.
UPDATE "Company"
SET "registrationOfficerName" = 'ई. अनिक यादाव',
    "registrationOfficerDesignation" = COALESCE(NULLIF(BTRIM("registrationOfficerDesignation"), ''), 'इन्जिनियर'),
    "officerSnapshotAt" = CURRENT_TIMESTAMP,
    "officerSnapshotSource" = 'confirmed-fiscal-year:2082/083',
    "officerVerificationNote" = 'Owner confirmed ई. अनिक यादाव as company certificate signatory for fiscal year 2082/83.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE regexp_replace("fiscalYear", '[[:space:]]', '', 'g') ~ '^(2082|082|82)[/-](083|83)$'
  AND "approvalStatus" = 'APPROVED'
  AND "officerSnapshotAt" IS NULL
  AND NULLIF(BTRIM("registrationOfficerName"), '') IS NULL;

COMMIT;
