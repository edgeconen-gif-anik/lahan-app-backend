BEGIN;

ALTER TABLE "Company"
  ADD COLUMN "registrationOfficerName" TEXT,
  ADD COLUMN "registrationOfficerDesignation" TEXT,
  ADD COLUMN "officerSnapshotAt" TIMESTAMP(3),
  ADD COLUMN "officerSnapshotSource" TEXT,
  ADD COLUMN "officerVerifiedById" TEXT,
  ADD COLUMN "officerVerificationNote" TEXT,
  ADD COLUMN "officerHistoryLegacy" BOOLEAN NOT NULL DEFAULT true;
-- Existing rows always need explicit verification, even if edited/reapproved later.
ALTER TABLE "Company" ALTER COLUMN "officerHistoryLegacy" SET DEFAULT false;

CREATE TABLE "OfficerAssignment" (
  "id" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "chiefAdministrativeOfficerName" TEXT,
  "sectionChiefName" TEXT,
  "registrationOfficerName" TEXT,
  "registrationOfficerDesignation" TEXT,
  "recordedById" TEXT,
  "reason" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfficerAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfficerAssignment_effectiveFrom_key" ON "OfficerAssignment"("effectiveFrom");

-- The existing setting proves only the current configuration, not past appointments.
-- Preserve existing company rows and saved agreement/work-order signatories unchanged.
INSERT INTO "OfficerAssignment" (
  "id", "effectiveFrom", "chiefAdministrativeOfficerName", "sectionChiefName",
  "registrationOfficerName", "registrationOfficerDesignation"
)
SELECT 'migration-baseline', CURRENT_TIMESTAMP, "chiefAdministrativeOfficerName",
  "sectionChiefName", "registrationOfficerName", "registrationOfficerDesignation"
FROM "SystemSetting" WHERE "id" = 'default';

-- Protect snapshots against older clients and alternate write paths too.
CREATE FUNCTION protect_company_officer_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."officerSnapshotAt" IS NOT NULL AND (
    ROW(NEW."registrationOfficerName", NEW."registrationOfficerDesignation", NEW."officerSnapshotAt",
        NEW."officerSnapshotSource", NEW."officerVerifiedById", NEW."officerVerificationNote",
        NEW."registrationDate", NEW."fiscalYear")
    IS DISTINCT FROM
    ROW(OLD."registrationOfficerName", OLD."registrationOfficerDesignation", OLD."officerSnapshotAt",
        OLD."officerSnapshotSource", OLD."officerVerifiedById", OLD."officerVerificationNote",
        OLD."registrationDate", OLD."fiscalYear")
  ) THEN
    RAISE EXCEPTION 'Recorded certificate officer and registration period cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Company_protect_officer_snapshot" BEFORE UPDATE ON "Company"
FOR EACH ROW EXECUTE FUNCTION protect_company_officer_snapshot();

CREATE FUNCTION protect_officer_assignment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Officer assignment history is append-only';
END;
$$;
CREATE TRIGGER "OfficerAssignment_append_only" BEFORE UPDATE OR DELETE ON "OfficerAssignment"
FOR EACH ROW EXECUTE FUNCTION protect_officer_assignment_history();

COMMIT;
