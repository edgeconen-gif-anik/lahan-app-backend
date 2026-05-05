import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetupService } from '../setup/setup.service';

describe('ProjectService', () => {
  let service: ProjectService;
  const prisma = {};
  const setupService = {
    getCurrentFiscalYear: jest.fn().mockResolvedValue('2082/083'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: PrismaService, useValue: prisma },
        { provide: SetupService, useValue: setupService },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
