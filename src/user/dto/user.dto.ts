import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ==========================================
// 1. Enums
// ==========================================
const DesignationEnum = z.enum([
  'ASSISTANT_SUB_ENGINEER',
  'SUB_ENGINEER',
  'ENGINEER',
]);

const RoleEnum = z.enum([
  'CREATOR', 
  'REVIEWER', 
  'ADMIN'
]);

// ==========================================
// 2. Create User Schema
// ==========================================
export const CreateUserSchema = z.object({
  // Name is now optional in DB (String?) to support initial Google logins
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100)
    .optional(),

  // Email is technically optional in DB, but required for manual creation
  email: z.string()
    .email('Invalid email address')
    .transform((e) => e.toLowerCase()),

  // NEW: Password field for Credentials login
  // Optional because Google users won't provide one
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .optional(),

  // UPDATED: Now optional because new Google users won't have a designation yet
  designation: DesignationEnum.optional(),

  // UPDATED: Now optional. 
  // You can keep the default if you want new manual users to be CREATORs automatically
  role: RoleEnum.optional().default('CREATOR'), 
});

// ==========================================
// 3. Update User Schema
// ==========================================
export const UpdateUserSchema = CreateUserSchema.partial();

// ==========================================
// 4. Query/Search Schema
// ==========================================
export const QueryUserSchema = z.object({
  search: z.string().optional(),
  designation: DesignationEnum.optional(),
  role: RoleEnum.optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).default(10),
});

// ==========================================
// 5. Generate DTO Classes for NestJS
// ==========================================
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class QueryUserDto extends createZodDto(QueryUserSchema) {}