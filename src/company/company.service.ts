import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  VerifyCompanyOfficerDto,
} from './dto/company.dto';
import {
  companyOfficerSnapshot,
  hasConfirmedCompanyOfficer,
} from '../setup/officer-snapshot';
import { ApprovalStatus, CompanyCategory, Prisma } from '@prisma/client';
import {
  AuthUser,
  getApprovalStateForSave,
  requireAdminUser,
} from '../auth/auth-user';
import { SetupService } from '../setup/setup.service';
import {
  getFiscalYearVariants,
  normalizeFiscalYear,
} from '../setup/fiscal-year';

const INITIATOR_SELECT = {
  id: true,
  name: true,
  email: true,
  designation: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly setupService: SetupService,
  ) {}

  private async resolveFiscalYear(value?: string | null) {
    const rawFiscalYear =
      value?.trim() || (await this.setupService.getCurrentFiscalYear());
    return normalizeFiscalYear(rawFiscalYear) ?? rawFiscalYear;
  }

  private async resolveFiscalYearFilter(value?: string | null) {
    if (value?.trim().toLowerCase() === 'all') {
      return [];
    }

    return getFiscalYearVariants(await this.resolveFiscalYear(value));
  }

  private normalizeCompanyData<
    T extends { officeRegistrationNumber?: string | null },
  >(data: T) {
    if (!('officeRegistrationNumber' in data)) {
      return data;
    }

    return {
      ...data,
      officeRegistrationNumber: data.officeRegistrationNumber?.trim() || null,
    };
  }

  private withoutOfficeRegistrationNumber<
    T extends { officeRegistrationNumber?: string | null },
  >(data: T) {
    const copy = { ...data };
    delete copy.officeRegistrationNumber;
    return copy;
  }

  async create(data: CreateCompanyDto, user: AuthUser) {
    const createData = this.withoutOfficeRegistrationNumber(data);
    const fiscalYear = await this.resolveFiscalYear(createData.fiscalYear);

    try {
      return await this.prisma.$transaction(async (tx) =>
        tx.company.create({
          data: {
            ...createData,
            ...(getApprovalStateForSave(user).approvalStatus === 'APPROVED'
              ? await companyOfficerSnapshot(
                  tx,
                  createData.registrationDate,
                  fiscalYear,
                )
              : {}),
            fiscalYear,
            initiatedById: user.id,
            ...getApprovalStateForSave(user),
          },
          include: {
            initiatedBy: { select: INITIATOR_SELECT },
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // FIX: Safely access meta.target
        const target = error.meta?.target;

        // 1. Check if target is an array (Standard Prisma behavior)
        if (Array.isArray(target)) {
          if (target.includes('panNumber'))
            throw new ConflictException('PAN Number already exists.');
          if (target.includes('email'))
            throw new ConflictException('Email already exists.');
          if (target.includes('officeRegistrationNumber'))
            throw new ConflictException(
              'Office registration number already exists.',
            );
        }

        // 2. Fallback: Sometimes target is just a string (depending on DB driver versions)
        if (typeof target === 'string') {
          if (target.includes('panNumber'))
            throw new ConflictException('PAN Number already exists.');
          if (target.includes('email'))
            throw new ConflictException('Email already exists.');
          if (target.includes('officeRegistrationNumber'))
            throw new ConflictException(
              'Office registration number already exists.',
            );
        }

        // 3. Generic Fallback if we can't identify the field
        throw new ConflictException(
          'Unique constraint violation: A record with this unique ID already exists.',
        );
      }

      // Log the actual error to console so you can debug other 500s
      console.error(error);
      throw error;
    }
  }

  async findAll(
    params: {
      search?: string;
      category?: CompanyCategory;
      fiscalYear?: string;
      approvalStatus?: ApprovalStatus;
    },
    _user: AuthUser,
  ) {
    const { search, category, fiscalYear, approvalStatus } = params;
    const fiscalYearVariants = await this.resolveFiscalYearFilter(fiscalYear);
    const where: Prisma.CompanyWhereInput = {
      ...(fiscalYearVariants.length && {
        fiscalYear: { in: fiscalYearVariants },
      }),
    };

    if (search) {
      const isNumber = !isNaN(Number(search));
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { officeRegistrationNumber: { contains: search, mode: 'insensitive' } },
        ...(isNumber ? [{ panNumber: { equals: Number(search) } }] : []),
      ];
    }
    if (category) where.category = category;
    if (approvalStatus) where.approvalStatus = approvalStatus;

    return this.prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { projects: true } },
        initiatedBy: { select: INITIATOR_SELECT },
      },
    });
  }

  async findOne(id: string, _user: AuthUser) {
    const company = await this.prisma.company.findFirst({
      where: { id },
      include: {
        projects: true,
        initiatedBy: { select: INITIATOR_SELECT },
      },
    });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  async update(id: string, data: UpdateCompanyDto, user: AuthUser) {
    const existingCompany = await this.findOne(id, user);
    if (
      existingCompany.officerSnapshotAt &&
      ((data.registrationDate !== undefined &&
        data.registrationDate.getTime() !==
          existingCompany.registrationDate?.getTime()) ||
        (data.fiscalYear &&
          normalizeFiscalYear(data.fiscalYear) !==
            normalizeFiscalYear(existingCompany.fiscalYear)))
    ) {
      throw new ConflictException(
        'Registration date and fiscal year cannot change after the certificate officer is recorded.',
      );
    }
    const updateData = this.normalizeCompanyData(data);
    const fiscalYear =
      updateData.fiscalYear === undefined
        ? undefined
        : await this.resolveFiscalYear(updateData.fiscalYear);

    if (
      fiscalYear &&
      !getFiscalYearVariants(fiscalYear).includes(existingCompany.fiscalYear)
    ) {
      const linkedRecord = await this.prisma.company.findFirst({
        where: {
          id,
          OR: [
            {
              projects: {
                some: {
                  fiscalYear: { notIn: getFiscalYearVariants(fiscalYear) },
                },
              },
            },
            {
              contracts: {
                some: {
                  fiscalYear: { notIn: getFiscalYearVariants(fiscalYear) },
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      if (linkedRecord) {
        throw new ConflictException(
          'Company fiscal year cannot be changed while it is linked to projects or contracts from another fiscal year.',
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.company.findUniqueOrThrow({ where: { id } });
        const approval = getApprovalStateForSave(user);
        const registrationDate =
          updateData.registrationDate ?? current.registrationDate;
        const snapshot =
          !current.officerSnapshotAt &&
          !current.registrationOfficerName &&
          (hasConfirmedCompanyOfficer(fiscalYear ?? current.fiscalYear) ||
            (!current.officerHistoryLegacy &&
              current.approvalStatus !== 'APPROVED')) &&
          approval.approvalStatus === 'APPROVED' &&
          (registrationDate ||
            hasConfirmedCompanyOfficer(fiscalYear ?? current.fiscalYear))
            ? await companyOfficerSnapshot(
                tx,
                registrationDate,
                fiscalYear ?? current.fiscalYear,
              )
            : {};
        return tx.company.update({
          where: { id },
          data: {
            ...updateData,
            ...snapshot,
            fiscalYear: current.officerSnapshotAt
              ? current.fiscalYear
              : fiscalYear,
            ...getApprovalStateForSave(user),
          },
          include: {
            initiatedBy: { select: INITIATOR_SELECT },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Apply the same fix here
        const target = error.meta?.target;
        if (Array.isArray(target) || typeof target === 'string') {
          if (target.includes('panNumber'))
            throw new ConflictException(
              'Update failed: PAN Number already in use.',
            );
          if (target.includes('email'))
            throw new ConflictException('Update failed: Email already in use.');
          if (target.includes('officeRegistrationNumber'))
            throw new ConflictException(
              'Update failed: Office registration number already in use.',
            );
        }
        throw new ConflictException(
          'Update failed: Unique constraint violation.',
        );
      }
      throw error;
    }
  }

  async approve(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${id} FOR UPDATE`;
      const existing = await tx.company.findUniqueOrThrow({ where: { id } });
      const snapshot =
        existing.officerSnapshotAt ||
        existing.registrationOfficerName ||
        (!hasConfirmedCompanyOfficer(existing.fiscalYear) &&
          (existing.officerHistoryLegacy ||
            !existing.registrationDate ||
            existing.approvalStatus === 'APPROVED'))
          ? {}
          : await companyOfficerSnapshot(
              tx,
              existing.registrationDate,
              existing.fiscalYear,
            );
      // Conditional capture prevents concurrent approval overwriting a verified officer.
      if ('officerSnapshotAt' in snapshot) {
        await tx.company.updateMany({
          where: { id, officerSnapshotAt: null },
          data: snapshot,
        });
      }
      return tx.company.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
        },
        include: {
          initiatedBy: { select: INITIATOR_SELECT },
        },
      });
    });
  }

  async verifyOfficer(
    id: string,
    dto: VerifyCompanyOfficerDto,
    user: AuthUser,
  ) {
    requireAdminUser(user);
    await this.findOne(id, user);
    const result = await this.prisma.company.updateMany({
      where: {
        id,
        officerSnapshotAt: null,
        approvalStatus: 'APPROVED',
        updatedAt: new Date(dto.expectedUpdatedAt),
      },
      data: {
        registrationOfficerName: dto.registrationOfficerName,
        registrationOfficerDesignation: dto.registrationOfficerDesignation,
        officerSnapshotAt: new Date(),
        officerSnapshotSource: 'verified-historical-document',
        officerVerifiedById: user.id,
        officerVerificationNote: dto.evidence,
      },
    });
    if (!result.count)
      throw new ConflictException(
        'The record changed, the officer is already recorded, or the company is not approved. Refresh and verify again.',
      );
    return this.findOne(id, user);
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);
    return this.prisma.company.delete({ where: { id } });
  }
}
