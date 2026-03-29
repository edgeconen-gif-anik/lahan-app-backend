import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').transform((e) => e.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export const GoogleLoginSchema = z.object({
  token: z.string().optional(),
  email: z.string().email('Invalid email address').transform((e) => e.toLowerCase()),
  name: z.string().min(1).optional(),
  image: z.string().url().optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').transform((e) => e.toLowerCase()),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export class LoginDto extends createZodDto(LoginSchema) {}
export class GoogleLoginDto extends createZodDto(GoogleLoginSchema) {}
export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
