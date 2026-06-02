import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export const GoogleLoginSchema = z.object({
  token: z.string().min(1, 'Google token is required'),
  email: z
    .string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase()),
  name: z.string().min(1).optional(),
  image: z.string().url().optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase()),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const SignupSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  email: z
    .string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase()),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export class LoginDto extends createZodDto(LoginSchema) {}
export class GoogleLoginDto extends createZodDto(GoogleLoginSchema) {}
export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
export class SignupDto extends createZodDto(SignupSchema) {}
export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}
