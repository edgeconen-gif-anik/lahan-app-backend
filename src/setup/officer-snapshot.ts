import { Prisma } from '@prisma/client';
import { normalizeFiscalYear } from './fiscal-year';

// Historical assignment explicitly confirmed by the owner for company certificates.
export function hasConfirmedCompanyOfficer(fiscalYear?: string | null) {
  return normalizeFiscalYear(fiscalYear) === '2082/083';
}

export const OFFICER_FIELDS = [
  'chiefAdministrativeOfficerName',
  'sectionChiefName',
  'registrationOfficerName',
  'registrationOfficerDesignation',
] as const;

// A missing historical assignment must never fall back to today's settings.
export async function companyOfficerSnapshot(
  tx: Prisma.TransactionClient,
  at?: Date | null,
  fiscalYear?: string | null,
) {
  if (hasConfirmedCompanyOfficer(fiscalYear)) {
    return {
      registrationOfficerName: 'ई. अनिक यादाव',
      registrationOfficerDesignation: 'इन्जिनियर',
      officerSnapshotAt: new Date(),
      officerSnapshotSource: 'confirmed-fiscal-year:2082/083',
      officerVerificationNote:
        'Owner confirmed ई. अनिक यादाव as company certificate signatory for fiscal year 2082/83.',
    };
  }
  if (!at) return {};
  const assignment = await tx.officerAssignment.findFirst({
    where: { effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (
    !assignment?.registrationOfficerName ||
    !assignment.registrationOfficerDesignation
  ) {
    return {};
  }
  return {
    registrationOfficerName: assignment.registrationOfficerName,
    registrationOfficerDesignation: assignment.registrationOfficerDesignation,
    officerSnapshotAt: new Date(),
    officerSnapshotSource: `assignment:${assignment.id}`,
  };
}

export async function documentSignatories(
  tx: Prisma.TransactionClient,
  at: Date,
  supplied: { officeSignatory?: string; witnessName?: string },
) {
  const assignment = await tx.officerAssignment.findFirst({
    where: { effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  });
  return {
    officeSignatory:
      supplied.officeSignatory?.trim() ||
      assignment?.chiefAdministrativeOfficerName ||
      null,
    witnessName:
      supplied.witnessName?.trim() || assignment?.sectionChiefName || null,
  };
}
