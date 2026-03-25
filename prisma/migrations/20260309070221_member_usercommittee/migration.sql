/*
  Warnings:

  - The values [VICE_PRESIDENT] on the enum `CommitteeRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CommitteeRole_new" AS ENUM ('PRESIDENT', 'MEMBER', 'SECRETARY', 'TREASURER');
ALTER TABLE "CommitteeOfficial" ALTER COLUMN "role" TYPE "CommitteeRole_new" USING ("role"::text::"CommitteeRole_new");
ALTER TYPE "CommitteeRole" RENAME TO "CommitteeRole_old";
ALTER TYPE "CommitteeRole_new" RENAME TO "CommitteeRole";
DROP TYPE "public"."CommitteeRole_old";
COMMIT;
