import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates forgot-password requests to AuthService', async () => {
    authService.forgotPassword.mockResolvedValue({ message: 'ok' });

    await expect(
      controller.forgotPassword({ email: 'user@example.com' }),
    ).resolves.toEqual({ message: 'ok' });

    expect(authService.forgotPassword).toHaveBeenCalledWith('user@example.com');
  });
});
