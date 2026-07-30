import { ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Designation, Role } from '@prisma/client';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: Role.ADMIN,
  };
  const superAdmin = {
    id: 'super-admin-1',
    email: 'owner@example.com',
    role: Role.SUPER_ADMIN,
  };

  beforeEach(() => {
    service = new UserService(prisma as any);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows a super admin to create an approved admin account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data, select }) => ({
      ...data,
      select,
    }));

    await service.create(
      {
        name: 'New Admin',
        email: 'new-admin@example.com',
        password: 'temporary-password',
        role: Role.ADMIN,
        designation: Designation.ENGINEER,
      },
      superAdmin,
    );

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new-admin@example.com',
          role: Role.ADMIN,
          approvalStatus: ApprovalStatus.APPROVED,
          emailVerified: expect.any(Date),
          password: expect.not.stringMatching(/^temporary-password$/),
        }),
      }),
    );
  });

  it('does not allow a regular admin to create accounts', async () => {
    await expect(
      service.create(
        {
          name: 'New User',
          email: 'new-user@example.com',
          password: 'temporary-password',
          role: Role.CREATOR,
          designation: Designation.SUB_ENGINEER,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows an admin to approve a non-administrative user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'pending-user',
      emailVerified: new Date(),
    });
    prisma.user.update.mockResolvedValue({ id: 'pending-user' });

    await service.approve(
      'pending-user',
      {
        role: Role.REVIEWER,
        designation: Designation.SUB_ENGINEER,
      },
      admin,
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.REVIEWER,
          approvalStatus: ApprovalStatus.APPROVED,
        }),
      }),
    );
  });

  it('does not allow a regular admin to assign the admin role', async () => {
    await expect(
      service.approve(
        'pending-user',
        {
          role: Role.ADMIN,
          designation: Designation.ENGINEER,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
