import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Prisma } from 'generated/prisma/browser';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [CompanyService, PrismaService],
  controllers: [CompanyController]
})
export class CompanyModule {}
