# Officer history and certificate integrity

## Behavior

Owner-confirmed exception: FY 2082/83 company certificate signatory is **ई. अनिक यादाव**, designation **इन्जिनियर** (Engineer, matching the ई. prefix). Migration `20260921130000_confirm_2082_company_officer` fills unresolved approved company certificates for this fiscal year only. Existing saved/verified names are preserved. New registrations and later approvals for 2082/83 save this confirmed officer automatically, including records without a registration date. The certificate uses its own saved fiscal year, never the global settings year or today's official. No individual verification is needed for certificates covered by this confirmation. Other fiscal years retain the verification behavior below.

Settings changes append an assignment with an effective timestamp, administrator ID and recorded timestamp. Each assignment lasts until the next effective start. Changing only the fiscal year does not create an appointment. Anik → Binod → Anik creates separate appointments even within one fiscal year.

Administrators can add a historical start in System Setup, with a supporting appointment reference. The form records all four official fields together; verify all four for that period. Historical entries end at the next recorded start and do not change saved certificates. Future scheduling and overwriting an existing start are deliberately unsupported. Date/time entry is AD in the browser's local timezone; API timestamps carry an explicit offset.

Company registrations capture the name and designation applicable to their registration date on creation by an admin or first approval. A missing registration date or missing/incomplete assignment leaves the officer unresolved. Request date, fiscal year alone, creation date and today's officer are not evidence of who registered a company. Normal edits and reapproval retain an existing snapshot. Registration date and fiscal year are locked once the officer is saved.

The company certificate page requires a snapshot before printing. Existing approved companies with no historical name require one-time administrator verification against the original document. This records the officer, designation, administrator ID, time and evidence/reference. Concurrent or stale verification is rejected. A normal settings edit never backfills these records. The database also rejects overwriting a saved snapshot and updating/deleting assignment history.

Agreement and work-order creation resolve missing signatories on the server using the agreement date / work-order issuance time. Explicit signatories are retained. Printing reads only saved document fields, including the committee agreement body. Existing missing signatories show blank signature fields, never today's settings or hard-coded people. Existing contract document edits still work; this change is not a general immutable document archive. The payment form's hard-coded recommender name is now a blank for completion by the actual recommender.

## Production release

This change has not been applied to the live database. Do not run `prisma migrate dev`, `db push`, a reset, or an automatic historical name backfill against production.

1. Take and verify a database backup and restore it to staging. Review `prisma migrate status` for any unrelated pending migrations; `migrate deploy` applies all pending migrations.
2. Apply migrations on staging with `npm run prisma:migrate:deploy`, then `npm run build`. Deploy the matching frontend build. Check old certificates, normal company edits, approval and A → B → A appointments using test records.
3. Coordinate the production backend and frontend rollout in a maintenance window. Run `npm run prisma:migrate:deploy`, build/restart the backend, and deploy the matching frontend before reopening writes/printing. An old frontend still reads current settings, so deploying only the backend does not fix printing.
4. The migration adds nullable company fields and a history table; it does not update any existing company, agreement or work-order row. It records current settings only from migration time. Obtain real appointment records to enter older periods, and verify old company certificates individually before reprinting.
5. If a verified officer was entered incorrectly, preserve the evidence and use a separately reviewed correction migration. Do not disable the guards or overwrite snapshots as routine operation. Rolling back the app to the old frontend reintroduces the printing defect; prefer a forward fix.

## Verification

- `npm test -- --runInBand`
- `npm run build`
- Frontend: `npx tsc --noEmit` and `npm run build`
- Isolated SQL test (does not read `.env` or use `DATABASE_URL`):
  `npm install --prefix .tmp/officer-migration-test --no-save --package-lock=false @electric-sql/pglite`
  then `node scripts/test-officer-migration.cjs`.

The SQL test runs all existing migrations in an ephemeral PostgreSQL/WASM database, inserts representative legacy rows, applies the new migration, and checks legacy preservation and database guards. Production lock duration and existing data volume must still be validated on the staging restore.
