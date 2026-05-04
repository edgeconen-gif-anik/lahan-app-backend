import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { SetupModule } from '../setup/setup.module';

@Module({
  imports: [SetupModule],
  providers: [ContractService, PrismaService],
  controllers: [ContractController]
})
export class ContractModule {}
