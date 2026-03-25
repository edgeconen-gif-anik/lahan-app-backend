import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompanyDto) {
    try {
      return await this.prisma.company.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // FIX: Safely access meta.target
        const target = error.meta?.target;

        // 1. Check if target is an array (Standard Prisma behavior)
        if (Array.isArray(target)) {
          if (target.includes('panNumber')) throw new ConflictException('PAN Number already exists.');
          if (target.includes('email')) throw new ConflictException('Email already exists.');
        } 
        
        // 2. Fallback: Sometimes target is just a string (depending on DB driver versions)
        if (typeof target === 'string') {
           if (target.includes('panNumber')) throw new ConflictException('PAN Number already exists.');
           if (target.includes('email')) throw new ConflictException('Email already exists.');
        }

        // 3. Generic Fallback if we can't identify the field
        throw new ConflictException('Unique constraint violation: A record with this unique ID already exists.');
      }
      
      // Log the actual error to console so you can debug other 500s
      console.error(error); 
      throw error;
    }
  }

  async findAll(params: { search?: string; category?: any }) {
    const { search, category } = params;
    const where: Prisma.CompanyWhereInput = {};

    if (search) {
      const isNumber = !isNaN(Number(search));
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
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

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { projects: true },
    });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  async update(id: string, data: UpdateCompanyDto) {
    await this.findOne(id); // Ensure existence
    try {
      return await this.prisma.company.update({
        where: { id },
        data,
      });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Apply the same fix here
            const target = error.meta?.target;
            if (Array.isArray(target) || typeof target === 'string') {
                 if (target.includes('panNumber')) throw new ConflictException('Update failed: PAN Number already in use.');
                 if (target.includes('email')) throw new ConflictException('Update failed: Email already in use.');
            }
            throw new ConflictException('Update failed: Unique constraint violation.');
        }
        throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.company.delete({ where: { id } });
  }
}