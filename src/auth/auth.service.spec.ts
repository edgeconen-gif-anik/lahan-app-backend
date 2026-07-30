import { createHash } from 'crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const usersService = {
    findByEmail: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const prisma = {
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      update: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mailService = {
    sendPasswordResetEmail: jest.fn(),
    sendEmailVerificationEmail: jest.fn(),
  };
  const superAdmin = {
    id: 'super-admin-1',
    email: 'owner@example.com',
    role: Role.SUPER_ADMIN,
  };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:3000';

    service = new AuthService(
      usersService as any,
      jwtService as any,
      prisma as any,
      mailService as any,
    );
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns a generic message and creates a reset token for existing users', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.verificationToken.create.mockResolvedValue({});
    mailService.sendPasswordResetEmail.mockResolvedValue(false);

    const response = await service.forgotPassword('user@example.com');

    expect(response.message).toBe(
      'If an account with that email exists, a password reset link has been generated.',
    );
    expect(response.resetUrl).toMatch(
      /^http:\/\/localhost:3000\/reset-password\?token=/,
    );

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'password-reset:user@example.com' },
    });
    expect(prisma.verificationToken.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.verificationToken.create.mock.calls[0][0].data.identifier,
    ).toBe('password-reset:user@example.com');
    expect(
      prisma.verificationToken.create.mock.calls[0][0].data.token,
    ).toHaveLength(64);
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      resetUrl: expect.stringMatching(
        /^http:\/\/localhost:3000\/reset-password\?token=/,
      ),
      expiresInMinutes: 15,
    });
  });

  it('reports when the email is not registered', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.forgotPassword('missing@example.com')).rejects.toThrow(
      'This email is not registered with us.',
    );

    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it('reports an unavailable email service in production when sending fails', async () => {
    process.env.NODE_ENV = 'production';
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.verificationToken.create.mockResolvedValue({});
    mailService.sendPasswordResetEmail.mockRejectedValue(
      new Error('SMTP authentication failed'),
    );

    await expect(service.forgotPassword('user@example.com')).rejects.toThrow(
      'Unable to send password reset email right now. Please try again later.',
    );
  });

  it('resets the password for a valid reset token', async () => {
    const rawToken = 'plain-reset-token';
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');

    prisma.verificationToken.findUnique.mockResolvedValue({
      identifier: 'password-reset:user@example.com',
      token: hashedToken,
      expires: new Date(Date.now() + 5 * 60 * 1000),
    });
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    prisma.user.update.mockReturnValue({} as never);
    prisma.verificationToken.deleteMany.mockReturnValue({} as never);
    prisma.$transaction.mockResolvedValue([]);

    await expect(
      service.resetPassword(rawToken, 'new-password'),
    ).resolves.toEqual({
      message: 'Password reset successful',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password: expect.any(String),
      },
    });
    expect(prisma.user.update.mock.calls[0][0].data.password).not.toBe(
      'new-password',
    );
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'password-reset:user@example.com' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('allows a super admin to send a verification email', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'Unverified@Example.com',
      emailVerified: null,
    });
    prisma.verificationToken.deleteMany.mockReturnValue({} as never);
    prisma.verificationToken.create.mockReturnValue({} as never);
    prisma.$transaction.mockResolvedValue([]);
    mailService.sendEmailVerificationEmail.mockResolvedValue(true);

    await expect(
      service.sendVerificationEmailToUser('user-1', superAdmin),
    ).resolves.toEqual({
      message: 'Verification email sent to unverified@example.com',
    });

    expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith({
      to: 'unverified@example.com',
      verifyUrl: expect.stringMatching(
        /^http:\/\/localhost:3000\/verify-email\?token=/,
      ),
      expiresInMinutes: 60,
    });
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: {
        identifier: 'email-verify:unverified@example.com',
        token: expect.any(String),
        expires: expect.any(Date),
      },
    });
  });

  it('does not allow a regular admin to send verification emails', async () => {
    await expect(
      service.sendVerificationEmailToUser('user-1', {
        id: 'admin-1',
        email: 'admin@example.com',
        role: Role.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not send another email to an already verified user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'verified@example.com',
      emailVerified: new Date(),
    });

    await expect(
      service.sendVerificationEmailToUser('user-1', superAdmin),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
  });
});
