import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CompanyModule } from './company/company.module';
import { ProjectModule } from './project/project.module';
import { PrismaService } from './prisma/prisma.service';
import { ContractModule } from './contract/contract.module';
import { UserModule } from './user/user.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserCommitteeService } from './user-committee/user-committee.service';
import { UserCommitteeController } from './user-committee/user-committee.controller';

@Module({
  imports: [ConfigModule.forRoot({
      isGlobal: true, // Makes .env available to all modules (including Prisma)
    }),
    PrismaModule, CompanyModule, ProjectModule, ContractModule, UserModule, AuthModule],
  controllers: [AppController, UserCommitteeController],
  providers: [AppService, PrismaService, UserCommitteeService],
})
export class AppModule {}
   