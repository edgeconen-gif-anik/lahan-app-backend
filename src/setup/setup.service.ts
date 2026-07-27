import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, requireAdminUser } from '../auth/auth-user';
import { UpdateSystemSettingDto } from './dto/setup.dto';
import {
  getCurrentNepaliFiscalYear,
  normalizeFiscalYear,
  sortFiscalYearsDescending,
} from './fiscal-year';

const SETTINGS_ID = 'default';

function cleanOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const settings = await this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        currentFiscalYear: getCurrentNepaliFiscalYear(),
      },
      update: {},
    });

    await this.prisma.fiscalYear.createMany({
      data: [{ value: settings.currentFiscalYear }],
      skipDuplicates: true,
    });

    return settings;
  }

  async updateSettings(dto: UpdateSystemSettingDto, user: AuthUser) {
    requireAdminUser(user);

    const normalizedFiscalYear = normalizeFiscalYear(dto.currentFiscalYear);

    if (!normalizedFiscalYear) {
      throw new BadRequestException(
        'Fiscal year must be in 2082/083 or 2082/83 format',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const existingSettings = await transaction.systemSetting.findUnique({
        where: { id: SETTINGS_ID },
        select: { currentFiscalYear: true },
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
