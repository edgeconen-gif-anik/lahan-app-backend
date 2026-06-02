UPDATE "Project" AS p
SET "siteInchargeId" = c."siteInchargeId"
FROM "Contract" AS c
WHERE c."projectId" = p."id"
  AND c."siteInchargeId" IS NOT NULL
  AND p."siteInchargeId" IS NULL;
