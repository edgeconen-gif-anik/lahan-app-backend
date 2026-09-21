import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SetupService } from './setup.service';

describe('officer assignment history', () => {
  const user = { id: 'admin', email: 'admin@example.com', role: Role.ADMIN };
  function build() {
    let settings = {
      currentFiscalYear: '2083/084',
      registrationOfficerName: 'Anik',
      registrationOfficerDesignation: 'Engineer',
      chiefAdministrativeOfficerName: 'Chief',
      sectionChiefName: 'Section',
    };
    const history: any[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      systemSetting: {
        findUnique: jest.fn(async () => settings),
        upsert: jest.fn(
          async ({ update }) => (settings = { ...settings, ...update }),
        ),
      },
      officerAssignment: {
        findFirst: jest.fn(
          async () =>
            [...history].sort(
              (a, b) => +b.effectiveFrom - +a.effectiveFrom,
            )[0] ?? null,
        ),
        findUnique: jest.fn(
          async ({ where }) =>
            history.find(
              (row) => +row.effectiveFrom === +where.effectiveFrom,
            ) ?? null,
        ),
        create: jest.fn(async ({ data }) => {
          history.push(data);
          return data;
        }),
      },
      fiscalYear: { createMany: jest.fn() },
    };
    return {
      tx,
      history,
      service: new SetupService({ $transaction: (fn) => fn(tx) } as never),
    };
  }

  it('records each change, retains omitted official fields and attributes the administrator', async () => {
    const { service, history } = build();
    await service.updateSettings(
      { currentFiscalYear: '2083/84', registrationOfficerName: 'Binod' },
      user,
    );
    await service.updateSettings(
      { currentFiscalYear: '2083/84', registrationOfficerName: 'Anik' },
      user,
    );
    expect(history.map((row) => row.registrationOfficerName)).toEqual([
      'Binod',
      'Anik',
    ]);
    expect(history[1].effectiveFrom > history[0].effectiveFrom).toBe(true);
    expect(history[1]).toMatchObject({
      recordedById: 'admin',
      sectionChiefName: 'Section',
      registrationOfficerDesignation: 'Engineer',
    });
  });

  it('does not create a new appointment when only fiscal year changes', async () => {
    const { service, history } = build();
    await service.updateSettings({ currentFiscalYear: '2084/85' }, user);
    expect(history).toHaveLength(0);
  });

  it('accepts documented backdated history without replacing current defaults or duplicating starts', async () => {
    const { service, history } = build();
    await service.updateSettings(
      { currentFiscalYear: '2083/84', registrationOfficerName: 'Current' },
      user,
    );
    const dto = {
      currentFiscalYear: '2083/84',
      registrationOfficerName: 'Historical',
      officerEffectiveFrom: '2025-07-17T00:00:00Z',
      officerChangeReason: 'Appointment order #123',
    };
    const result = await service.updateSettings(dto, user);
    expect(result.registrationOfficerName).toBe('Current');
    expect(history[1]).toMatchObject({
      registrationOfficerName: 'Historical',
      reason: dto.officerChangeReason,
    });
    await expect(service.updateSettings(dto, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects future dates, undocumented historical dates and non-admin changes', async () => {
    const { service } = build();
    await expect(
      service.updateSettings(
        {
          currentFiscalYear: '2083/84',
          officerEffectiveFrom: '2099-01-01T00:00:00Z',
          officerChangeReason: 'Future appointment',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSettings(
        {
          currentFiscalYear: '2083/84',
          officerEffectiveFrom: '2025-01-01T00:00:00Z',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSettings(
        { currentFiscalYear: '2083/84' },
        { ...user, role: Role.CREATOR },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
