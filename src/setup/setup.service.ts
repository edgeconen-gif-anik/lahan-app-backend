import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, requireAdminUser } from '../auth/auth-user';
import { UpdateSystemSettingDto } from './dto/setup.dto';
import { OFFICER_FIELDS } from './officer-snapshot';
import {
  getActiveFiscalYear,
  getCurrentNepaliFiscalYear,
  normalizeFiscalYear,
  sortFiscalYearsDescending,
} from './fiscal-year';

const SETTINGS_ID = 'default';

function getFiscalYearStart(value?: string | null) {
  return Number(normalizeFiscalYear(value)?.slice(0, 4) ?? 0);
}

function cleanOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const calendarFiscalYear = getCurrentNepaliFiscalYear();
    const existingSettings = await this.prisma.systemSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    const existingFiscalYear = normalizeFiscalYear(
      existingSettings?.currentFiscalYear,
    );
    const activeFiscalYear = getActiveFiscalYear(existingFiscalYear);
    const shouldAdvanceFiscalYear =
      !existingFiscalYear ||
      getFiscalYearStart(existingFiscalYear) <
        getFiscalYearStart(calendarFiscalYear);

    const settings = await this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        currentFiscalYear: activeFiscalYear,
      },
      update: shouldAdvanceFiscalYear
        ? { currentFiscalYear: activeFiscalYear }
        : {},
    });

    await this.prisma.fiscalYear.createMany({
      data: Array.from(
        new Set(
          [existingFiscalYear, settings.currentFiscalYear].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ).map((value) => ({ value })),
      skipDuplicates: true,
    });

    return settings;
  }

  async updateSettings(dto: UpdateSystemSettingDto, user: AuthUser) {
    requireAdminUser(user);

    const normalizedFiscalYear = normalizeFiscalYear(dto.currentFiscalYear);

    if (!normalizedFiscalYear) {
      throw new BadRequestException(
        'Fiscal year must use YYYY/YYY or YYYY/YY format',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      // Serialize settings changes so every A -> B -> A transition is retained.
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(208283)`;
      const existingSettings = await transaction.systemSetting.findUnique({
        where: { id: SETTINGS_ID },
      });
      const settingsData = {
        currentFiscalYear: normalizedFiscalYear,
        chiefAdministrativeOfficerName: cleanOptionalText(
          dto.chiefAdministrativeOfficerName,
        ),
        sectionChiefName: cleanOptionalText(dto.sectionChiefName),
        registrationOfficerName: cleanOptionalText(dto.registrationOfficerName),
        registrationOfficerDesignation: cleanOptionalText(
          dto.registrationOfficerDesignation,
        ),
      };
      for (const field of OFFICER_FIELDS) {
        if (dto[field] === undefined)
          settingsData[field] = existingSettings?.[field] ?? null;
      }
      if (
        dto.officerEffectiveFrom ||
        OFFICER_FIELDS.some(
          (field) =>
            (existingSettings?.[field] ?? null) !== settingsData[field],
        )
      ) {
        const latest = await transaction.officerAssignment.findFirst({
          orderBy: { effectiveFrom: 'desc' },
        });
        const effectiveFrom = dto.officerEffectiveFrom
          ? new Date(dto.officerEffectiveFrom)
          : new Date(
              Math.max(Date.now(), (latest?.effectiveFrom.getTime() ?? 0) + 1),
            );
        if (
          dto.officerEffectiveFrom &&
          (effectiveFrom.getTime() > Date.now() || !dto.officerChangeReason)
        ) {
          throw new BadRequestException(
            'Historical assignments require a document reference/reason and cannot start in the future.',
          );
        }
        if (
          await transaction.officerAssignment.findUnique({
            where: { effectiveFrom },
          })
        ) {
          throw new BadRequestException(
            'An assignment already starts at this time. Assignment history cannot be overwritten.',
          );
        }
        await transaction.officerAssignment.create({
          data: {
            effectiveFrom,
            recordedById: user.id,
            reason: dto.officerChangeReason,
            ...Object.fromEntries(
              OFFICER_FIELDS.map((field) => [field, settingsData[field]]),
            ),
          },
        });
        // Historical appointments end at the next recorded appointment; current defaults stay current.
        if (latest && effectiveFrom < latest.effectiveFrom) {
          for (const field of OFFICER_FIELDS)
            settingsData[field] = latest[field];
        }
      }
      const settings = await transaction.systemSetting.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          ...settingsData,
        },
        update: settingsData,
      });
      const fiscalYearValues = [
        existingSettings?.currentFiscalYear,
        normalizedFiscalYear,
      ]
        .map((value) => normalizeFiscalYear(value))
        .filter((value): value is string => Boolean(value));

      await transaction.fiscalYear.createMany({
        data: Array.from(new Set(fiscalYearValues)).map((value) => ({ value })),
        skipDuplicates: true,
      });

      return settings;
    });
  }

  async getCurrentFiscalYear() {
    const settings = await this.getSettings();
    return settings.currentFiscalYear;
  }

  async listOfficerAssignments(user: AuthUser) {
    requireAdminUser(user);
    return this.prisma.officerAssignment.findMany({
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async listFiscalYears() {
    const [
      settings,
      registeredYears,
      companyYears,
      projectYears,
      committeeYears,
      contractYears,
    ] = await Promise.all([
      this.getSettings(),
      this.prisma.fiscalYear.findMany({
        select: { value: true },
      }),
      this.prisma.company.findMany({
        distinct: ['fiscalYear'],
        select: { fiscalYear: true },
        where: { fiscalYear: { not: '' } },
      }),
      this.prisma.project.findMany({
        distinct: ['fiscalYear'],
        select: { fiscalYear: true },
        where: { fiscalYear: { not: '' } },
      }),
      this.prisma.userCommittee.findMany({
        distinct: ['fiscalYear'],
        select: { fiscalYear: true },
        where: { fiscalYear: { not: '' } },
      }),
      this.prisma.contract.findMany({
        distinct: ['fiscalYear'],
        select: { fiscalYear: true },
        where: { fiscalYear: { not: '' } },
      }),
    ]);

    const fiscalYears = new Set<string>();
    fiscalYears.add(settings.currentFiscalYear);

    for (const record of [
      ...registeredYears.map(({ value }) => ({ fiscalYear: value })),
      ...projectYears,
      ...companyYears,
      ...committeeYears,
      ...contractYears,
    ]) {
      const normalized = normalizeFiscalYear(record.fiscalYear);
      if (normalized) {
        fiscalYears.add(normalized);
      }
    }

    return Array.from(fiscalYears).sort(sortFiscalYearsDescending);
  }
}
