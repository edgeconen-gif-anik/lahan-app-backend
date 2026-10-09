import { ContractStatus, Role } from '@prisma/client';
import { ContractService } from './contract.service';

describe('ContractService.findAll paging', () => {
  const prisma = {
    contract: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  const setupService = {
    getCurrentFiscalYear: jest.fn().mockResolvedValue('2082/083'),
  };
  const service = new ContractService(prisma as never, setupService as never);
  const admin = { id: 'a', email: 'a@example.com', role: Role.ADMIN };
  const creator = { id: 'c', email: 'c@example.com', role: Role.CREATOR };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.contract.findMany.mockResolvedValue([{ id: 'c1' }]);
    prisma.contract.count.mockResolvedValue(45);
    prisma.contract.groupBy.mockResolvedValue([
      { status: ContractStatus.AGREEMENT, _count: { status: 3 } },
      { status: ContractStatus.COMPLETED, _count: { status: 2 } },
    ]);
  });

  it('keeps returning a plain array when no page is requested', async () => {
    const result = await service.findAll({ fiscalYear: 'all' }, admin);

    expect(result).toEqual([{ id: 'c1' }]);
    expect(prisma.contract.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.anything() }),
    );
    expect(prisma.contract.groupBy).not.toHaveBeenCalled();
  });

  it('returns data, meta and per-milestone counts when paged', async () => {
    const result = (await service.findAll(
      { fiscalYear: 'all', page: '2', limit: '20' },
      admin,
    )) as {
      meta: { total: number; page: number; lastPage: number; limit: number };
      counts: { total: number; byStatus: Record<string, number> };
    };

    expect(prisma.contract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, lastPage: 3 });
    expect(result.counts.byStatus.AGREEMENT).toBe(3);
    expect(result.counts.byStatus.NOT_STARTED).toBe(0);
    expect(result.counts.total).toBe(5);
  });

  it('counts milestones without applying the milestone filter itself', async () => {
    await service.findAll(
      { fiscalYear: 'all', page: 1, status: ContractStatus.COMPLETED },
      admin,
    );

    const listWhere = prisma.contract.findMany.mock.calls[0][0].where;
    const groupWhere = prisma.contract.groupBy.mock.calls[0][0].where;
    expect(JSON.stringify(listWhere)).toContain('COMPLETED');
    expect(JSON.stringify(groupWhere)).not.toContain('COMPLETED');
  });

  it('still hides unapproved contracts from non-admins when paged', async () => {
    await service.findAll({ fiscalYear: 'all', page: 1 }, creator);

    const listWhere = prisma.contract.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(listWhere)).toContain('"approvalStatus":"APPROVED"');
  });

  it('narrows the list to unfinished contracts past their end date when overdue', async () => {
    const result = (await service.findAll(
      { fiscalYear: 'all', page: 1, overdue: true },
      admin,
    )) as { counts: { overdue: number } };

    const listWhere = JSON.stringify(
      prisma.contract.findMany.mock.calls[0][0].where,
    );
    expect(listWhere).toContain('intendedCompletionDate');
    expect(listWhere).toContain('"actualCompletionDate":null');
    expect(listWhere).toContain('"notIn":["COMPLETED","ARCHIVED"]');
    expect(result.counts.overdue).toBe(45);
  });

  it('ignores unknown sort fields', async () => {
    await service.findAll(
      { fiscalYear: 'all', sortBy: 'secret', sortOrder: 'asc' },
      admin,
    );

    expect(prisma.contract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });
});
