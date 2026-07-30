import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  getApprovalStateForSave,
  isAdminUser,
  isSuperAdminUser,
  requireAdminUser,
  requireSuperAdminUser,
} from './auth-user';

describe('auth-user role helpers', () => {
  const admin = { role: Role.ADMIN };
  const superAdmin = { role: Role.SUPER_ADMIN };
  const creator = { role: Role.CREATOR };

  it('treats admins and super admins as approval administrators', () => {
    expect(isAdminUser(admin)).toBe(true);
    expect(isAdminUser(superAdmin)).toBe(true);
    expect(isAdminUser(creator)).toBe(false);
    expect(() => requireAdminUser(superAdmin)).not.toThrow();
  });

  it('reserves super-admin-only operations for super admins', () => {
    expect(isSuperAdminUser(superAdmin)).toBe(true);
    expect(isSuperAdminUser(admin)).toBe(false);
    expect(() => requireSuperAdminUser(superAdmin)).not.toThrow();
    expect(() => requireSuperAdminUser(admin)).toThrow(ForbiddenException);
  });

  it('auto-approves records saved by either administrative role', () => {
    expect(getApprovalStateForSave(admin).approvalStatus).toBe('APPROVED');
    expect(getApprovalStateForSave(superAdmin).approvalStatus).toBe('APPROVED');
    expect(getApprovalStateForSave(creator).approvalStatus).toBe('PENDING');
  });
});
