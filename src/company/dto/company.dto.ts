// src/company/dto/company.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CompanyCategory } from '@prisma/client';

// 1. Define the base Zod Schema
export const CompanySchema = z.object({
  name: z.string().min(1, 'Name is required').describe('Official Name of the company'),
  
  // PAN is an Int in your DB, but usually 9 digits
  panNumber: z.coerce // coerce ensures string inputs are treated as numbers if needed
    .number()
    .int()
    .min(100000000, 'PAN must be at least 9 digits')
    .describe('Unique PAN Number'),

  address: z.string().min(1, 'Address is required'),
  
  // ✅ FIXED: Added parentheses, matched Prisma name, and made optional
  voucherNo: z.string().optional(), 
  
  contactPerson: z.string().optional(),
  
  phoneNumber: z
    .union([
      z.literal(''),
      z.string().regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits'),
    ])
    .optional(),
  
  email: z
    .union([z.literal(''), z.string().email()])
    .optional()
    .describe('Official Email Address'),

  registrationDate: z.coerce.date().optional(),
  registrationRequestDate: z.coerce.date().optional(),
  
  // Zod Native Enum validation
  category: z.nativeEnum(CompanyCategory).optional(),

  remarks: z.string().optional(),
  
  // Admin flags - usually optional during creation/updates by regular users
  isContracted: z.boolean().default(false).optional(),
  panVerified: z.boolean().default(false).optional(),
});

// 2. Create the DTOs
export class CreateCompanyDto extends createZodDto(CompanySchema) {}

// For Update, we use the .partial() method from Zod
export class UpdateCompanyDto extends createZodDto(CompanySchema.partial()) {}
