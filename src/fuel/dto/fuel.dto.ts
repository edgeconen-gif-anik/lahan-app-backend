import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApprovalStatus, FuelLogSource, FuelType } from '@prisma/client';

const NullableUuidSchema = z
  .union([z.literal(''), z.string().uuid()])
  .optional()
  .nullable()
  .transform((value) => value || undefined);

const ClearableUuidSchema = z
  .union([z.literal(''), z.string().uuid()])
  .optional()
  .nullable()
  .transform((value) => value || null);

const OptionalTrimmedStringSchema = z
  .union([z.literal(''), z.string().trim().min(1)])
  .optional()
  .nullable()
  .transform((value) => value || undefined);

const ClearableTrimmedStringSchema = z
  .union([z.literal(''), z.string().trim().min(1)])
  .optional()
  .nullable()
  .transform((value) => value || null);

const BaseFuelLogSchema = z.object({
  userId: z.string().uuid().optional(),
  projectId: NullableUuidSchema,
  contractId: NullableUuidSchema,
  source: z.nativeEnum(FuelLogSource),
  fuelType: z.nativeEnum(FuelType),
  quantityLiters: z.coerce.number().positive(),
  ratePerLiter: z.coerce.number().positive().optional(),
  totalAmount: z.coerce.number().positive().optional(),
  vehicleNumber: OptionalTrimmedStringSchema,
  odometerReading: z.coerce.number().int().nonnegative().optional(),
  purpose: z.string().trim().min(3, 'Purpose must be at least 3 characters'),
  logDate: z.coerce.date(),
  remarks: OptionalTrimmedStringSchema,
});

export const CreateFuelLogSchema = BaseFuelLogSchema.refine(
  (data) => !(data.totalAmount && data.ratePerLiter),
  {
    message:
      'Send either totalAmount or ratePerLiter. The server can calculate totalAmount from ratePerLiter.',
    path: ['totalAmount'],
  },
);

export const UpdateFuelLogSchema = BaseFuelLogSchema.partial()
  .extend({
    projectId: ClearableUuidSchema,
    contractId: ClearableUuidSchema,
    vehicleNumber: ClearableTrimmedStringSchema,
    remarks: ClearableTrimmedStringSchema,
  })
  .refine((data) => !(data.totalAmount && data.ratePerLiter), {
    message:
      'Send either totalAmount or ratePerLiter. The server can calculate totalAmount from ratePerLiter.',
    path: ['totalAmount'],
  });

export const QueryFuelLogSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  userId: z.string().uuid().optional(),
  requestedById: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  source: z.nativeEnum(FuelLogSource).optional(),
  fuelType: z.nativeEnum(FuelType).optional(),
  approvalStatus: z.nativeEnum(ApprovalStatus).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  sortBy: z
    .enum(['createdAt', 'logDate', 'quantityLiters', 'totalAmount'])
    .default('logDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const ReviewFuelLogSchema = z.object({
  remarks: OptionalTrimmedStringSchema,
});

export class CreateFuelLogDto extends createZodDto(CreateFuelLogSchema) {}
export class UpdateFuelLogDto extends createZodDto(UpdateFuelLogSchema) {}
export class QueryFuelLogDto extends createZodDto(QueryFuelLogSchema) {}
export class ReviewFuelLogDto extends createZodDto(ReviewFuelLogSchema) {}

export type CreateFuelLogInput = z.infer<typeof CreateFuelLogSchema>;
export type UpdateFuelLogInput = z.infer<typeof UpdateFuelLogSchema>;
export type QueryFuelLogInput = z.infer<typeof QueryFuelLogSchema>;
export type ReviewFuelLogInput = z.infer<typeof ReviewFuelLogSchema>;
