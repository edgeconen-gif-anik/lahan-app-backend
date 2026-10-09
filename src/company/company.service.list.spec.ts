import { Role } from '@prisma/client';
import { CompanyService } from './company.service';

describe('CompanyService.findAll paging', () => {
  const prisma = {
    company: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  };
  const setup = {
    getCurrentFiscalYear: jest.fn().mockResolvedValue('2083/084'),
  };
  const service = new CompanyService(prisma as never, setup as never);
  const admin = { id: 'a', email: 'a@example.com', role: Role.ADMIN };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.company.findMany.mockResolvedValue([
      {
        id: 'company1',
        isContracted: false,
        _count: { projects: 0, contracts: 1 },
      },
    ]);
    prisma.company.count.mockResolvedValue(1);
  });

  it('returns FY 2083/84 records on an available page and includes contract status', async () => {
    const result = await service.findAll(
      { fiscalYear: '2083/84', page: '5' },
      admin,
    );
    expect(result).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 'company1',
            isContracted: true,
            hasApprovedContract: true,
            approvedContractCount: 1,
          }),
        ],
        meta: { total: 1, page: 1, limit: 20, lastPage: 1 },
      }),
    );
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where.AND[0].fiscalYear.in).toEqual(
      expect.arrayContaining(['2083/84', '2083/084', '2083/2084', '083/84']),
    );
  });

  it('preserves the plain array response for callers without a page', async () => {
    const result = await service.findAll({ fiscalYear: 'all' }, admin);
    expect(Array.isArray(result)).toBe(true);
    expect(prisma.company.count).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        isContracted: true,
        hasApprovedContract: true,
        approvedContractCount: 1,
      }),
    ]);
  });

  it('uses approved relation counts on list and detail instead of the stale stored flag', async () => {
    const row = {
      id: 'company1',
      isContracted: false,
      _count: { projects: 0, contracts: 2 },
    };
    prisma.company.findFirst.mockResolvedValue(row);
    expect(await service.findOne('company1', admin)).toEqual(
      expect.objectContaining({
        isContracted: true,
        hasApprovedContract: true,
        approvedContractCount: 2,
      }),
    );
    expect(prisma.company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: {
            select: {
              projects: true,
              contracts: { where: { approvalStatus: 'APPROVED' } },
            },
          },
        }),
      }),
    );
    await service.findAll({ fiscalYear: 'all', page: 1 }, admin);
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: {
            select: {
              projects: true,
              contracts: { where: { approvalStatus: 'APPROVED' } },
            },
          },
        }),
      }),
    );
  });

  it('updates the response after approval or removal without writing a duplicated flag', async () => {
    const row = {
      id: 'company1',
      isContracted: false,
      _count: { projects: 0, contracts: 0 },
    };
    prisma.company.findFirst.mockResolvedValue(row);
    expect((await service.findOne('company1', admin)).isContracted).toBe(false);
    prisma.company.findFirst.mockResolvedValue({
      ...row,
      _count: { projects: 0, contracts: 1 },
    });
    expect((await service.findOne('company1', admin)).isContracted).toBe(true);
    prisma.company.findFirst.mockResolvedValue(row);
    expect((await service.findOne('company1', admin)).isContracted).toBe(false);
  });

  it('preserves legacy manual engagement while reporting no approved linked contracts', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'company1',
      isContracted: true,
      _count: { contracts: 0 },
    });
    expect(await service.findOne('company1', admin)).toEqual(
      expect.objectContaining({
        isContracted: true,
        hasApprovedContract: false,
        approvedContractCount: 0,
      }),
    );
  });

  it('reports an empty first page when the fiscal year has no companies', async () => {
    prisma.company.count.mockResolvedValue(0);
    prisma.company.findMany.mockResolvedValue([]);
    const result = await service.findAll(
      { fiscalYear: '2083/84', page: 5 },
      admin,
    );
    expect(result).toEqual(
      expect.objectContaining({
        data: [],
        meta: { total: 0, page: 1, limit: 20, lastPage: 1 },
      }),
    );
  });
});
