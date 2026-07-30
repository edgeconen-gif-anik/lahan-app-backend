-- Add the platform-owner role and promote the existing Anik account.
-- Rebuilding the enum keeps the role change and data promotion atomic.
BEGIN;

CREATE TYPE "Role_new" AS ENUM (
  'CREATOR',
  'REVIEWER',
  'ADMIN',
  'SUPER_ADMIN'
);

ALTER TABLE "User"
ALTER COLUMN "role" TYPE "Role_new"
USING ("role"::text::"Role_new");

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";

UPDATE "User"
SET "role" = 'SUPER_ADMIN'
WHERE LOWER("email") = 'anik.letters@gmail.com';

-- Force a fresh login so Anik's next JWT contains the new role.
DELETE FROM "Session"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE LOWER("email") = 'anik.letters@gmail.com'
);

COMMIT;
