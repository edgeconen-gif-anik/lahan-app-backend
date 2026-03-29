import { ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  role?: Role | null;
  designation?: string | null;
};

export function isAdminUser(user?: Pick<AuthUser, 'role'> | null) {
  return user?.role === Role.ADMIN;
}

export function requireAdminUser(
  user?: Pick<AuthUser, 'role'> | null,
  message = 'Admin access is required for this action',
) {
  if (!isAdminUser(user)) {
    throw new ForbiddenException(message);
  }
}

export function getApprovalStateForSave(user?: Pick<AuthUser, 'role'> | null) {
  if (isAdminUser(user)) {
    return {
      approvalStatus: ApprovalStatus.APPROVED,
      approvedAt: new Date(),
    };
  }

  return {
    approvalStatus: ApprovalStatus.PENDING,
    approvedAt: null,
  };
}

export function getApprovalVisibilityWhere(
  user?: Pick<AuthUser, 'role'> | null,
) {
  if (isAdminUser(user)) {
    return {};
  }

  return {
    approvalStatus: ApprovalStatus.APPROVED,
  };
}
