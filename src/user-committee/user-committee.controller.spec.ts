import { Test, TestingModule } from '@nestjs/testing';
import { UserCommitteeController } from './user-committee.controller';

describe('UserCommitteeController', () => {
  let controller: UserCommitteeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserCommitteeController],
    }).compile();

    controller = module.get<UserCommitteeController>(UserCommitteeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
