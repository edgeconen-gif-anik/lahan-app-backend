import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { SetupModule } from '../setup/setup.module';

@Module({
  imports: [SetupModule],
  providers: [ContractService],
  controllers: [ContractController]
})
export class ContractModule {}
