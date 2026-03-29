import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, ContractStatus, Role } from '@prisma/client';
import { ContractService } from './contract.service';

describe('ContractService', () => {
  let service: ContractService;

  const prisma = {
    contract: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    agreement: {
      deleteMany: jest.fn(),
    },
    workOrder: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    service = new ContractService(prisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lets an admin change the milestone of an approved contract without resetting approval time', async () => {
    const approvedAt = new Date('2026-03-01T10:00:00.000Z');

    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt,
    });
    prisma.contract.update.mockResolvedValue({
      id: 'contract-1',
      status: ContractStatus.WORKORDER,
    });

    await service.update(
      'contract-1',
      { status: ContractStatus.WORKORDER } as any,
      {
        id: 'admin-1',
        email: 'admin@example.com',
        role: Role.ADMIN,
      },
    );

    expect(prisma.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contract-1' },
        data: expect.objectContaining({
          status: ContractStatus.WORKORDER,
          approvalStatus: ApprovalStatus.APPROVED,
          approvedAt,
        }),
      }),
    );
  });

  it('rejects milestone updates from non-admin users', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt: new Date('2026-03-01T10:00:00.000Z'),
    });

    await expect(
      service.update(
        'contract-1',
        { status: ContractStatus.COMPLETED } as any,
        {
          id: 'user-1',
          email: 'user@example.com',
          role: Role.CREATOR,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.contract.update).not.toHaveBeenCalled();
  });

  it('rejects milestone updates for contracts that are still pending approval', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      approvalStatus: ApprovalStatus.PENDING,
      approvedAt: null,
    });

    await expect(
      service.update(
        'contract-1',
        { status: ContractStatus.AGREEMENT } as any,
        {
          id: 'admin-1',
          email: 'admin@example.com',
          role: Role.ADMIN,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.contract.update).not.toHaveBeenCalled();
  });
});
