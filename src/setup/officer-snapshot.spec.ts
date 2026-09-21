import {
  companyOfficerSnapshot,
  documentSignatories,
} from './officer-snapshot';

describe('dated officer snapshots', () => {
  it.each(['2082/83', '2082/083', '2082-83', '82/83', ' 2082 / 083 '])(
    'uses the owner-confirmed officer for %s without consulting current settings',
    async (fiscalYear) => {
      const tx = { officerAssignment: { findFirst: jest.fn() } };
      await expect(
        companyOfficerSnapshot(tx as never, null, fiscalYear),
      ).resolves.toMatchObject({
        registrationOfficerName: 'ई. अनिक यादाव',
        registrationOfficerDesignation: 'इन्जिनियर',
        officerSnapshotSource: 'confirmed-fiscal-year:2082/083',
      });
      expect(tx.officerAssignment.findFirst).not.toHaveBeenCalled();
    },
  );

  it('does not apply the fiscal-year exception to 2083/84 without a dated appointment', async () => {
    await expect(
      companyOfficerSnapshot({} as never, null, '2083/84'),
    ).resolves.toEqual({});
  });
  const assignments = [
    {
      id: 'anik-first',
      effectiveFrom: new Date('2025-07-17T00:00:00Z'),
      registrationOfficerName: 'ई. अनिक यादव',
      registrationOfficerDesignation: 'Engineer',
      chiefAdministrativeOfficerName: 'Chief A',
      sectionChiefName: 'Section A',
    },
    {
      id: 'binod',
      effectiveFrom: new Date('2026-07-17T00:00:00Z'),
      registrationOfficerName: 'ई. विनोद यादव',
      registrationOfficerDesignation: 'Acting Engineer',
      chiefAdministrativeOfficerName: 'Chief B',
      sectionChiefName: 'Section B',
    },
    {
      id: 'anik-return',
      effectiveFrom: new Date('2026-09-01T00:00:00Z'),
      registrationOfficerName: 'ई. अनिक यादव',
      registrationOfficerDesignation: 'Engineer',
      chiefAdministrativeOfficerName: 'Chief C',
      sectionChiefName: 'Section C',
    },
  ];
  const tx = {
    officerAssignment: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          [...assignments]
            .reverse()
            .find((row) => row.effectiveFrom <= where.effectiveFrom.lte) ??
            null,
        ),
      ),
    },
  };

  it('resolves A -> B -> A by registration date, including two appointments in one fiscal year', async () => {
    const snapshots = await Promise.all(
      [
        '2026-02-01T00:00:00Z',
        '2026-08-01T00:00:00Z',
        '2026-09-01T00:00:00Z',
      ].map((date) => companyOfficerSnapshot(tx as never, new Date(date))),
    );
    expect(snapshots.map((row) => row.registrationOfficerName)).toEqual([
      'ई. अनिक यादव',
      'ई. विनोद यादव',
      'ई. अनिक यादव',
    ]);
    expect(snapshots.map((row) => row.officerSnapshotSource)).toEqual([
      'assignment:anik-first',
      'assignment:binod',
      'assignment:anik-return',
    ]);
    expect(snapshots[1].registrationOfficerDesignation).toBe('Acting Engineer');
  });

  it('does not invent an officer for a date before known history', async () => {
    await expect(
      companyOfficerSnapshot(tx as never, new Date('2024-01-01')),
    ).resolves.toEqual({});
    await expect(
      documentSignatories(tx as never, new Date('2024-01-01'), {}),
    ).resolves.toEqual({ officeSignatory: null, witnessName: null });
  });

  it('uses the document date for defaults and preserves explicit signatories', async () => {
    await expect(
      documentSignatories(tx as never, new Date('2026-08-01'), {}),
    ).resolves.toEqual({
      officeSignatory: 'Chief B',
      witnessName: 'Section B',
    });
    await expect(
      documentSignatories(tx as never, new Date('2026-08-01'), {
        officeSignatory: ' Original signer ',
        witnessName: 'Original witness',
      }),
    ).resolves.toEqual({
      officeSignatory: 'Original signer',
      witnessName: 'Original witness',
    });
  });
});
