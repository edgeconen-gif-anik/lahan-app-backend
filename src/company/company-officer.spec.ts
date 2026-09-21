import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CompanyService } from './company.service';

describe('company officer preservation', () => {
  const admin = { id: 'admin', email: 'admin@example.com', role: Role.ADMIN };
  const reviewer = { ...admin, role: Role.REVIEWER };
  const verified = {
    id: 'company',
    fiscalYear: '2082/083',
    registrationDate: new Date('2026-01-01'),
    approvalStatus: 'APPROVED',
    officerSnapshotAt: new Date('2026-01-02'),
    registrationOfficerName: 'Original officer',
    updatedAt: new Date('2026-01-02'),
  };
  const build = (record = verified) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      company: {
        findFirst: jest.fn().mockResolvedValue(record),
        findUniqueOrThrow: jest.fn().mockResolvedValue(record),
        create: jest.fn().mockImplementation(({ data }) => data),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...record, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      officerAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'binod',
          registrationOfficerName: 'Binod',
          registrationOfficerDesignation: 'Engineer',
        }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    return {
      prisma,
      service: new CompanyService(prisma as never, {} as never),
    };
  };

  it('does not reassign an existing officer on approval or ordinary edits', async () => {
    const { prisma, service } = build();
    expect(
      (await service.approve('company', admin)).registrationOfficerName,
    ).toBe('Original officer');
    expect(
      (await service.update('company', { address: 'New address' }, admin))
        .registrationOfficerName,
    ).toBe('Original officer');
    expect(prisma.officerAssignment.findFirst).not.toHaveBeenCalled();
    expect(prisma.company.updateMany).not.toHaveBeenCalled();
  });

  it('does not silently backfill an already approved legacy certificate on reapproval', async () => {
    const { prisma, service } = build({
      ...verified,
      officerSnapshotAt: null,
    } as never);
    await service.approve('company', admin);
    expect(prisma.officerAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('captures the dated officer on first approval', async () => {
    const { prisma, service } = build({
      ...verified,
      fiscalYear: '2083/084',
      registrationOfficerName: null,
      officerSnapshotAt: null,
      approvalStatus: 'PENDING',
    } as never);
    await service.approve('company', admin);
    expect(prisma.officerAssignment.findFirst).toHaveBeenCalledWith({
      where: { effectiveFrom: { lte: verified.registrationDate } },
      orderBy: { effectiveFrom: 'desc' },
    });
    expect(prisma.company.updateMany).toHaveBeenCalledWith({
      where: { id: 'company', officerSnapshotAt: null },
      data: expect.objectContaining({
        registrationOfficerName: 'Binod',
        officerSnapshotSource: 'assignment:binod',
      }),
    });
  });

  it('requires explicit verification for migrated records even after an edit makes them pending', async () => {
    const { prisma, service } = build({
      ...verified,
      fiscalYear: '2081/082',
      registrationOfficerName: null,
      officerSnapshotAt: null,
      officerHistoryLegacy: true,
      approvalStatus: 'PENDING',
    } as never);
    await service.approve('company', admin);
    await service.update('company', { address: 'Corrected address' }, admin);
    expect(prisma.officerAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('automatically saves the confirmed 2082/83 officer on approval without a registration date', async () => {
    const { prisma, service } = build({
      ...verified,
      fiscalYear: '2082/83',
      registrationOfficerName: null,
      registrationDate: null,
      officerSnapshotAt: null,
      officerHistoryLegacy: true,
      approvalStatus: 'PENDING',
    } as never);
    await service.approve('company', admin);
    expect(prisma.company.updateMany).toHaveBeenCalledWith({
      where: { id: 'company', officerSnapshotAt: null },
      data: expect.objectContaining({
        registrationOfficerName: 'ई. अनिक यादाव',
        officerSnapshotSource: 'confirmed-fiscal-year:2082/083',
      }),
    });
    expect(prisma.officerAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('uses the selected fiscal year when an admin creates a historical registration', async () => {
    const { prisma, service } = build();
    const result = await service.create(
      {
        name: 'Company',
        address: 'Lahan',
        panNumber: 123456789,
        fiscalYear: '2082/83',
      },
      admin,
    );
    expect(result).toMatchObject({
      fiscalYear: '2082/083',
      registrationOfficerName: 'ई. अनिक यादाव',
      registrationOfficerDesignation: 'इन्जिनियर',
    });
    expect(prisma.officerAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('blocks changing the registration period after capturing the officer', async () => {
    const { service } = build();
    await expect(
      service.update(
        'company',
        { registrationDate: new Date('2026-08-01') },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update('company', { fiscalYear: '2083/84' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires admin authority and a fresh, unverified record for historical verification', async () => {
    const { prisma, service } = build();
    const dto = {
      registrationOfficerName: 'Anik',
      registrationOfficerDesignation: 'Engineer',
      evidence: 'Original certificate #123',
      expectedUpdatedAt: verified.updatedAt.toISOString(),
    };
    await expect(
      service.verifyOfficer('company', dto, reviewer),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.company.updateMany).not.toHaveBeenCalled();
    prisma.company.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.verifyOfficer('company', dto, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.company.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'company',
        officerSnapshotAt: null,
        approvalStatus: 'APPROVED',
        updatedAt: verified.updatedAt,
      },
      data: expect.objectContaining({
        officerVerifiedById: admin.id,
        officerVerificationNote: dto.evidence,
        officerSnapshotSource: 'verified-historical-document',
      }),
    });
  });
});
