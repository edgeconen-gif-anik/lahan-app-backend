import { Test, TestingModule } from '@nestjs/testing';
import { UserCommitteeService } from './user-committee.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetupService } from '../setup/setup.service';

describe('UserCommitteeService', () => {
  let service: UserCommitteeService;
  const prisma = {};
  const setupService = {
    getCurrentFiscalYear: jest.fn().mockResolvedValue('2082/083'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserCommitteeService,
        { provide: PrismaService, useValue: prisma },
        { provide: SetupService, useValue: setupService },
      ],
    }).compile();

    service = module.get<UserCommitteeService>(UserCommitteeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
