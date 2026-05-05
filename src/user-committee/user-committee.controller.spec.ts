import { Test, TestingModule } from '@nestjs/testing';
import { UserCommitteeController } from './user-committee.controller';
import { UserCommitteeService } from './user-committee.service';

describe('UserCommitteeController', () => {
  let controller: UserCommitteeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserCommitteeController],
      providers: [{ provide: UserCommitteeService, useValue: {} }],
    }).compile();

    controller = module.get<UserCommitteeController>(UserCommitteeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
