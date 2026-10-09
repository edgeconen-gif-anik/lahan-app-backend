import { Role } from '@prisma/client';
import { SearchService } from './search.service';

describe('SearchService', () => {
  const prisma = {
    project: { findMany: jest.fn().mockResolvedValue([]) },
    contract: { findMany: jest.fn().mockResolvedValue([]) },
    company: { findMany: jest.fn().mockResolvedValue([]) },
    userCommittee: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const setupService = {
    getCurrentFiscalYear: jest.fn().mockResolvedValue('2082/083'),
  };
  const service = new SearchService(prisma as never, setupService as never);
  const admin = { id: 'a', email: 'a@example.com', role: Role.ADMIN };
  const creator = { id: 'c', email: 'c@example.com', role: Role.CREATOR };

  beforeEach(() => jest.clearAllMocks());

  it('returns empty results without querying for short input', async () => {
    const result = await service.search(' a ', undefined, admin);

    expect(result).toEqual({
      projects: [],
      contracts: [],
      companies: [],
      committees: [],
    });
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('limits each type and hides unapproved contracts from non-admins', async () => {
    await service.search('road', 'all', creator);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    const contractWhere = prisma.contract.findMany.mock.calls[0][0].where;
    expect(contractWhere.AND[0]).toEqual({ approvalStatus: 'APPROVED' });
  });

  it('does not filter by approval for admins and skips fiscal year for "all"', async () => {
    await service.search('road', 'all', admin);

    const contractWhere = prisma.contract.findMany.mock.calls[0][0].where;
    expect(contractWhere.AND[0]).toEqual({});
    expect(contractWhere.AND[1]).toEqual({});
    expect(setupService.getCurrentFiscalYear).not.toHaveBeenCalled();
  });

  it('defaults to the current fiscal year', async () => {
    await service.search('road', undefined, admin);

    expect(setupService.getCurrentFiscalYear).toHaveBeenCalled();
    const projectWhere = prisma.project.findMany.mock.calls[0][0].where;
    expect(projectWhere.fiscalYear.in.length).toBeGreaterThan(0);
  });
});
