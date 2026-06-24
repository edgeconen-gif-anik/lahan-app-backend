import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CompanyModule } from './company/company.module';
import { ProjectModule } from './project/project.module';
import { ContractModule } from './contract/contract.module';
import { UserModule } from './user/user.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserCommitteeService } from './user-committee/user-committee.service';
import { UserCommitteeController } from './user-committee/user-committee.controller';
import { SetupModule } from './setup/setup.module';
import { FuelModule } from './fuel/fuel.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes .env available to all modules (including Prisma)
    }),
    PrismaModule,
    CompanyModule,
    ProjectModule,
    ContractModule,
    UserModule,
    AuthModule,
    SetupModule,
    FuelModule,
  ],
  controllers: [AppController, UserCommitteeController],
  providers: [AppService, UserCommitteeService],
})
export class AppModule {}
