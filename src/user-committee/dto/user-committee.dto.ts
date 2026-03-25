import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Match Prisma Enums
const CommitteeRoleEnum = z.enum([
  'PRESIDENT',
  'MEMBER',
  'SECRETARY',
  'TREASURER',
]);

// Sub-schema for officials
const OfficialSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phoneNumber: z.string().min(10, 'Valid phone number required'),
  citizenshipNumber: z
    .string()
    .min(3, 'Citizenship number required')
    .optional(),
  role: CommitteeRoleEnum,
});

// Create Schema
export const CreateUserCommitteeSchema = z.object({
  name: z.string().min(3, 'Committee name is required'),
  address: z.string().min(3, 'Address is required'),
  fiscalYear: z.string().regex(/^\d{4}\/\d{3}$/, 'Must be format like 2080/081'),
  formedDate: z
  .union([
    z.coerce.date(),
    z.string().length(0) // allow empty string
  ])
  .optional()
  .transform((val) => {
    if (!val || val === "") return undefined;
    return val instanceof Date ? val : new Date(val);
  }), // Coerces string like "2026-03-09" to a Date object
  bankName: z.string().min(2, 'Bank name is required'),
  accountNumber: z.string().min(5, 'Account number is required'),
  
  // Optional array of officials to create along with the committee
  officials: z.array(OfficialSchema).optional(),
});

// Update Schema
export const UpdateUserCommitteeSchema = CreateUserCommitteeSchema.partial();

// Query/Filter Schema
export const QueryUserCommitteeSchema = z.object({
  search: z.string().optional(), // Searches name or address
  fiscalYear: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).default(10),
});

export class CreateUserCommitteeDto extends createZodDto(CreateUserCommitteeSchema) {}
export class UpdateUserCommitteeDto extends createZodDto(UpdateUserCommitteeSchema) {}
export class QueryUserCommitteeDto extends createZodDto(QueryUserCommitteeSchema) {}