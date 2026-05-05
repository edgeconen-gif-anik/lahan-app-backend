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
    return this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        currentFiscalYear: getCurrentNepaliFiscalYear(),
      },
      update: {},
    });
  }

  async updateSettings(dto: UpdateSystemSettingDto, user: AuthUser) {
    requireAdminUser(user);

    const normalizedFiscalYear = normalizeFiscalYear(dto.currentFiscalYear);

    if (!normalizedFiscalYear) {
      throw new BadRequestException(
        'Fiscal year must be in 2082/083 or 2082/83 format',
      );
    }

    return this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        currentFiscalYear: normalizedFiscalYear,
        chiefAdministrativeOfficerName: cleanOptionalText(
          dto.chiefAdministrativeOfficerName,
        ),
        sectionChiefName: cleanOptionalText(dto.sectionChiefName),
      },
      update: {
        currentFiscalYear: normalizedFiscalYear,
        chiefAdministrativeOfficerName: cleanOptionalText(
          dto.chiefAdministrativeOfficerName,
        ),
        sectionChiefName: cleanOptionalText(dto.sectionChiefName),
      },
    });
  }

  async getCurrentFiscalYear() {
    const settings = await this.getSettings();
    return settings.currentFiscalYear;
  }

  async listFiscalYears() {
    const [settings, projectYears, committeeYears, contractYears] =
      await Promise.all([
        this.getSettings(),
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
      ...projectYears,
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
