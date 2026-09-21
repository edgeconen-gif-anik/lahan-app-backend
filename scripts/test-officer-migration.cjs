// Isolated PostgreSQL/WASM test; never reads DATABASE_URL or opens a live connection.
// npm install --prefix .tmp/officer-migration-test --no-save --package-lock=false @electric-sql/pglite
// node scripts/test-officer-migration.cjs
const { PGlite } = require('../.tmp/officer-migration-test/node_modules/@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  const migrations = join(__dirname, '../prisma/migrations');
  const target = '20260921120000_preserve_document_officers';
  try {
    for (const name of readdirSync(migrations).filter((name) => name < target && /^\d/.test(name)).sort()) {
      await db.exec(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
    }
    await db.exec(`
      INSERT INTO "SystemSetting" ("id", "currentFiscalYear", "registrationOfficerName", "registrationOfficerDesignation", "updatedAt")
      VALUES ('default', '2083/084', 'Current officer', 'Engineer', now())
      ON CONFLICT ("id") DO UPDATE SET "registrationOfficerName" = EXCLUDED."registrationOfficerName", "registrationOfficerDesignation" = EXCLUDED."registrationOfficerDesignation";
      INSERT INTO "Company" ("id", "name", "panNumber", "fiscalYear", "address", "registrationDate", "updatedAt")
      VALUES ('legacy', 'Existing company', 123456789, '2082/083', 'Lahan', '2026-01-01', '2026-02-01');
      INSERT INTO "Project" ("id", "name", "type", "budgetCode", "source", "fiscalYear", "allocatedBudget", "updatedAt")
      VALUES ('project', 'Existing project', 'Road', '123', 'Internal', '2082/083', 100, now());
      INSERT INTO "Contract" ("id", "projectId", "fiscalYear", "contractNumber", "contractAmount", "startDate", "intendedCompletionDate", "updatedAt")
      VALUES ('contract', 'project', '2082/083', 'CNT-1', 100, '2026-01-01', '2026-06-01', now());
      INSERT INTO "Agreement" ("id", "contractId", "agreementDate", "content", "amount", "officeSignatory", "updatedAt")
      VALUES ('agreement', 'contract', '2026-01-01', 'Original agreement', 100, 'Original agreement signer', now());
      INSERT INTO "WorkOrder" ("id", "contractId", "workCompletionDate", "content", "officeSignatory", "updatedAt")
      VALUES ('order', 'contract', '2026-06-01', 'Original order', 'Original order signer', now());
    `);
    const before = (await db.query('SELECT * FROM "Company"')).rows[0];
    const documentsBefore = await Promise.all(['Agreement', 'WorkOrder'].map(async (table) => (await db.query(`SELECT * FROM "${table}"`)).rows));
    await db.exec(readFileSync(join(migrations, target, 'migration.sql'), 'utf8'));
    const after = (await db.query('SELECT * FROM "Company"')).rows[0];
    for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `Existing ${key} preserved`);
    assert.equal(after.registrationOfficerName, null);
    assert.equal(after.officerSnapshotAt, null);
    assert.equal(after.officerHistoryLegacy, true);
    await db.exec(`INSERT INTO "Company" ("id", "name", "panNumber", "fiscalYear", "address", "updatedAt") VALUES ('new', 'New company', 987654321, '2083/084', 'Lahan', now())`);
    assert.equal((await db.query(`SELECT "officerHistoryLegacy" FROM "Company" WHERE "id" = 'new'`)).rows[0].officerHistoryLegacy, false);
    const documentsAfter = await Promise.all(['Agreement', 'WorkOrder'].map(async (table) => (await db.query(`SELECT * FROM "${table}"`)).rows));
    assert.deepEqual(documentsAfter, documentsBefore);
    const history = (await db.query('SELECT * FROM "OfficerAssignment"')).rows;
    assert.equal(history.length, 1);
    assert.equal(history[0].registrationOfficerName, 'Current officer');
    assert.ok(new Date(history[0].effectiveFrom) > new Date(before.registrationDate));
    await db.exec(`UPDATE "Company" SET "registrationOfficerName" = 'Original officer', "registrationOfficerDesignation" = 'Engineer', "officerSnapshotAt" = now(), "officerSnapshotSource" = 'verified-historical-document' WHERE "id" = 'legacy'`);
    await db.exec(`UPDATE "SystemSetting" SET "registrationOfficerName" = 'Replacement'`);
    assert.equal((await db.query(`SELECT "registrationOfficerName" FROM "Company" WHERE "id" = 'legacy'`)).rows[0].registrationOfficerName, 'Original officer');
    for (const patch of [`"registrationOfficerName" = 'Replacement'`, `"registrationDate" = '2026-03-01'`, `"officerSnapshotAt" = NULL`, `"fiscalYear" = '2083/084'`]) {
      await assert.rejects(db.exec(`UPDATE "Company" SET ${patch} WHERE "id" = 'legacy'`), /cannot be overwritten/);
    }
    await db.exec(`UPDATE "Company" SET "address" = 'Updated address' WHERE "id" = 'legacy'`);
    await assert.rejects(db.exec('DELETE FROM "OfficerAssignment"'), /append-only/);
    await assert.rejects(db.exec(`UPDATE "OfficerAssignment" SET "registrationOfficerName" = 'Overwrite'`), /append-only/);
    await db.exec(`INSERT INTO "Company" ("id", "name", "panNumber", "fiscalYear", "address", "updatedAt") VALUES ('confirmed-year', 'Old company', 555555555, '2082 / 83', 'Lahan', now())`);
    const confirmedMigration = readFileSync(join(migrations, '20260921130000_confirm_2082_company_officer', 'migration.sql'), 'utf8');
    await db.exec(confirmedMigration);
    const confirmed = (await db.query(`SELECT * FROM "Company" WHERE "id" = 'confirmed-year'`)).rows[0];
    assert.equal(confirmed.registrationOfficerName, 'ई. अनिक यादाव');
    assert.equal(confirmed.registrationOfficerDesignation, 'इन्जिनियर');
    assert.equal(confirmed.officerSnapshotSource, 'confirmed-fiscal-year:2082/083');
    assert.equal((await db.query(`SELECT "registrationOfficerName" FROM "Company" WHERE "id" = 'legacy'`)).rows[0].registrationOfficerName, 'Original officer');
    assert.equal((await db.query(`SELECT "registrationOfficerName" FROM "Company" WHERE "id" = 'new'`)).rows[0].registrationOfficerName, null);
    await db.exec(confirmedMigration);
    assert.deepEqual((await db.query(`SELECT * FROM "Company" WHERE "id" = 'confirmed-year'`)).rows[0], confirmed);
    console.log('PASS: all migrations, legacy preservation, immutable snapshots, confirmed 2082/83 backfill, other years unchanged, repeat execution safe.');
  } finally {
    await db.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
