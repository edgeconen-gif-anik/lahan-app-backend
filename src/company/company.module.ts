import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { SetupModule } from '../setup/setup.module';

@Module({
  imports: [SetupModule],
  providers: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
