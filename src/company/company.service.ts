import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { Prisma } from '@prisma/client';
import {
  AuthUser,
  getApprovalStateForSave,
  requireAdminUser,
} from '../auth/auth-user';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

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

    try {
      return await this.prisma.company.create({
        data: {
          ...createData,
          ...getApprovalStateForSave(user),
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
    params: { search?: string; category?: any },
    _user: AuthUser,
  ) {
    const { search, category } = params;
    const where: Prisma.CompanyWhereInput = {};

    if (search) {
      const isNumber = !isNaN(Number(search));
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { officeRegistrationNumber: { contains: search, mode: 'insensitive' } },
        ...(isNumber ? [{ panNumber: { equals: Number(search) } }] : []),
      ];
    }
    if (category) where.category = category;

    return this.prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { projects: true } } },
    });
  }

  async findOne(id: string, _user: AuthUser) {
    const company = await this.prisma.company.findFirst({
      where: { id },
      include: { projects: true },
    });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  async update(id: string, data: UpdateCompanyDto, user: AuthUser) {
    await this.findOne(id, user);
    const updateData = this.normalizeCompanyData(data);

    try {
      return await this.prisma.company.update({
        where: { id },
        data: {
          ...updateData,
          ...getApprovalStateForSave(user),
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
    });
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);
    return this.prisma.company.delete({ where: { id } });
  }
}
