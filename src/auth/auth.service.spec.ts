import { createHash } from 'crypto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    findByEmail: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const prisma = {
    verificationToken: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    service = new AuthService(
      usersService as any,
      jwtService as any,
      prisma as any,
    );
  });

  afterEach(() => {
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

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await service.forgotPassword('user@example.com');

    expect(response.message).toBe(
      'If an account with that email exists, a password reset link has been generated.',
    );
    expect(response.resetUrl).toMatch(
      /^http:\/\/localhost:3000\/reset-password\?token=/
    );

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'password-reset:user@example.com' },
    });
    expect(prisma.verificationToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.verificationToken.create.mock.calls[0][0].data.identifier).toBe(
      'password-reset:user@example.com',
    );
    expect(prisma.verificationToken.create.mock.calls[0][0].data.token).toHaveLength(64);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Password reset link for user@example.com:'),
    );
  });

  it('returns the same generic message when the user does not exist', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.forgotPassword('missing@example.com')).resolves.toEqual({
      message:
        'If an account with that email exists, a password reset link has been generated.',
    });

    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
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

    await expect(service.resetPassword(rawToken, 'new-password')).resolves.toEqual({
      message: 'Password reset successful',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password: expect.any(String),
      },
    });
    expect(prisma.user.update.mock.calls[0][0].data.password).not.toBe('new-password');
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'password-reset:user@example.com' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
