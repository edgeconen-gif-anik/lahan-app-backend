import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
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

  private normalizeCompanyData<T extends { officeRegistrationNumber?: string | null }>(
    data: T,
  ) {
    if (!('officeRegistrationNumber' in data)) {
      return data;
    }

    return {
      ...data,
      officeRegistrationNumber:
        data.officeRegistrationNumber?.trim() || null,
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
      return await this.prisma.company.create({
        data: {
          ...createData,
          fiscalYear,
          initiatedById: user.id,
          ...getApprovalStateForSave(user),
        },
        include: {
          initiatedBy: { select: INITIATOR_SELECT },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // FIX: Safely access meta.target
        const target = error.meta?.target;

        // 1. Check if target is an array (Standard Prisma behavior)
        if (Array.isArray(target)) {
          if (target.includes('panNumber')) throw new ConflictException('PAN Number already exists.');
          if (target.includes('email')) throw new ConflictException('Email already exists.');
          if (target.includes('officeRegistrationNumber')) throw new ConflictException('Office registration number already exists.');
        } 
        
        // 2. Fallback: Sometimes target is just a string (depending on DB driver versions)
        if (typeof target === 'string') {
           if (target.includes('panNumber')) throw new ConflictException('PAN Number already exists.');
           if (target.includes('email')) throw new ConflictException('Email already exists.');
           if (target.includes('officeRegistrationNumber')) throw new ConflictException('Office registration number already exists.');
        }

        // 3. Generic Fallback if we can't identify the field
        throw new ConflictException('Unique constraint violation: A record with this unique ID already exists.');
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
      return await this.prisma.company.update({
        where: { id },
        data: {
          ...updateData,
          fiscalYear,
          ...getApprovalStateForSave(user),
        },
        include: {
          initiatedBy: { select: INITIATOR_SELECT },
        },
      });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Apply the same fix here
            const target = error.meta?.target;
            if (Array.isArray(target) || typeof target === 'string') {
                 if (target.includes('panNumber')) throw new ConflictException('Update failed: PAN Number already in use.');
                 if (target.includes('email')) throw new ConflictException('Update failed: Email already in use.');
                 if (target.includes('officeRegistrationNumber')) throw new ConflictException('Update failed: Office registration number already in use.');
            }
            throw new ConflictException('Update failed: Unique constraint violation.');
        }
        throw error;
    }
  }

  async approve(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);

    return this.prisma.company.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
      },
      include: {
        initiatedBy: { select: INITIATOR_SELECT },
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);
    return this.prisma.company.delete({ where: { id } });
  }
}
