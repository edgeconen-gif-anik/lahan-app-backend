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
      status: ContractStatus.AGREEMENT,
      actualCompletionDate: null,
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt,
      agreement: { id: 'agreement-1' },
      workOrder: { id: 'work-order-1' },
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
      status: ContractStatus.WORKINPROGRESS,
      actualCompletionDate: new Date('2026-03-20T10:00:00.000Z'),
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt: new Date('2026-03-01T10:00:00.000Z'),
      agreement: { id: 'agreement-1' },
      workOrder: { id: 'work-order-1' },
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
      status: ContractStatus.NOT_STARTED,
      actualCompletionDate: null,
      approvalStatus: ApprovalStatus.PENDING,
      approvedAt: null,
      agreement: null,
      workOrder: null,
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

  it('rejects progressed milestone creation from non-admin users', async () => {
    await expect(
      service.create(
        {
          projectId: 'project-1',
          companyId: 'company-1',
          contractNumber: 'CNT-2082-83-0001',
          contractAmount: 500000,
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          intendedCompletionDate: new Date('2026-06-01T00:00:00.000Z'),
          status: ContractStatus.AGREEMENT,
          agreement: {
            agreementDate: new Date('2026-04-02T00:00:00.000Z'),
            content: 'Signed agreement content',
            amount: 500000,
          },
        } as any,
        {
          id: 'user-1',
          email: 'user@example.com',
          role: Role.CREATOR,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('lets an admin create a contract at an allowed milestone when the supporting data is present', async () => {
    prisma.contract.create.mockResolvedValue({
      id: 'contract-2',
      status: ContractStatus.AGREEMENT,
    });

    await service.create(
      {
        projectId: 'project-1',
        companyId: 'company-1',
        contractNumber: 'CNT-2082-83-0002',
        contractAmount: 750000,
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        intendedCompletionDate: new Date('2026-06-01T00:00:00.000Z'),
        status: ContractStatus.AGREEMENT,
        agreement: {
          agreementDate: new Date('2026-04-02T00:00:00.000Z'),
          content: 'Signed agreement content',
          amount: 750000,
        },
      } as any,
      {
        id: 'admin-1',
        email: 'admin@example.com',
        role: Role.ADMIN,
      },
    );

    expect(prisma.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ContractStatus.AGREEMENT,
        }),
      }),
    );
  });

  it('rejects backward milestone updates', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      status: ContractStatus.WORKORDER,
      actualCompletionDate: null,
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt: new Date('2026-03-01T10:00:00.000Z'),
      agreement: { id: 'agreement-1' },
      workOrder: { id: 'work-order-1' },
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

  it('rejects completion without an actual completion date', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      status: ContractStatus.WORKINPROGRESS,
      actualCompletionDate: null,
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt: new Date('2026-03-01T10:00:00.000Z'),
      agreement: { id: 'agreement-1' },
      workOrder: { id: 'work-order-1' },
    });

    await expect(
      service.update(
        'contract-1',
        { status: ContractStatus.COMPLETED } as any,
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
