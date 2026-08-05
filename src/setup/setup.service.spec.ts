import { Role } from '@prisma/client';
import { SetupService } from './setup.service';

describe('SetupService', () => {
  const settings = {
    id: 'default',
    currentFiscalYear: '2082/083',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-05T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the previous and new fiscal years when the active year changes', async () => {
    const transaction = {
      systemSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ currentFiscalYear: '2083/084' }),
        upsert: jest.fn().mockResolvedValue(settings),
      },
      fiscalYear: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new SetupService(prisma as never);

    await service.updateSettings(
      { currentFiscalYear: '2082/83' },
      {
        id: 'admin',
        email: 'admin@example.com',
        role: Role.ADMIN,
      },
    );

    expect(transaction.fiscalYear.createMany).toHaveBeenCalledWith({
      data: [{ value: '2083/084' }, { value: '2082/083' }],
      skipDuplicates: true,
    });
  });

  it('returns registered empty years together with years found in records', async () => {
    const calendarFiscalYear = '2083/084';
    const prisma = {
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue({
          ...settings,
          currentFiscalYear: calendarFiscalYear,
        }),
        upsert: jest.fn().mockResolvedValue({
          ...settings,
          currentFiscalYear: calendarFiscalYear,
        }),
      },
      fiscalYear: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([{ value: '2083/084' }]),
      },
      company: {
        findMany: jest.fn().mockResolvedValue([{ fiscalYear: '2082/83' }]),
      },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      userCommittee: { findMany: jest.fn().mockResolvedValue([]) },
      contract: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new SetupService(prisma as never);

    await expect(service.listFiscalYears()).resolves.toEqual([
      '2083/084',
      '2082/083',
    ]);
  });

  it('advances a stale active fiscal year while retaining it in history', async () => {
    const prisma = {
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(settings),
        upsert: jest.fn().mockResolvedValue({
          ...settings,
          currentFiscalYear: '2083/084',
        }),
      },
      fiscalYear: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new SetupService(prisma as never);

    const result = await service.getSettings();

    expect(result.currentFiscalYear).toBe('2083/084');
    expect(prisma.fiscalYear.createMany).toHaveBeenCalledWith({
      data: [{ value: '2082/083' }, { value: '2083/084' }],
      skipDuplicates: true,
    });
  });
});
