import { Test, TestingModule } from '@nestjs/testing';
import { UserCommitteeService } from './user-committee.service';

describe('UserCommitteeService', () => {
  let service: UserCommitteeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserCommitteeService],
    }).compile();

    service = module.get<UserCommitteeService>(UserCommitteeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
