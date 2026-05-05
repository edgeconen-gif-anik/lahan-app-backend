UPDATE "SystemSetting"
SET
    "currentFiscalYear" = '2082/083',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE btrim("currentFiscalYear") IN (
    '82/083',
    '82/83',
    '82-083',
    '82-83',
    '2082/83',
    '2082-083',
    '2082-83'
);

UPDATE "Project"
SET "fiscalYear" = '2082/083'
WHERE btrim("fiscalYear") IN (
    '82/083',
    '82/83',
    '82-083',
    '82-83',
    '2082/83',
    '2082-083',
    '2082-83'
);

UPDATE "UserCommittee"
SET "fiscalYear" = '2082/083'
WHERE btrim("fiscalYear") IN (
    '82/083',
    '82/83',
    '82-083',
    '82-83',
    '2082/83',
    '2082-083',
    '2082-83'
);

UPDATE "Contract"
SET "fiscalYear" = '2082/083'
WHERE btrim("fiscalYear") IN (
    '82/083',
    '82/83',
    '82-083',
    '82-83',
    '2082/83',
    '2082-083',
    '2082-83'
);
