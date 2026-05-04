import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  controllers: [SetupController],
  providers: [SetupService, PrismaService],
  exports: [SetupService],
})
export class SetupModule {}
