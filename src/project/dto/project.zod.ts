import { z } from 'zod';

/* =========================
   Enums (Prisma-aligned)
========================= */

export const ProjectStatusEnum = z.enum([
  'NOT_STARTED',
  'ONGOING',
  'COMPLETED',
  'ARCHIVED',
]);

export const ProjectImplantedThroughEnum = z.enum([
  'COMPANY',
  'USER_COMMITTEE',
]);

/* =========================
   Shared Decimal
========================= */
const decimalInput = z.union([
  z.number(),
  z.string().regex(/^\d+(\.\d+)?$/),
]).transform(Number);

/* =========================
   Base Project Schema
========================= */
export const ProjectBaseSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  budgetCode: z.string().min(1),
  source: z.string().min(1),
  fiscalYear: z.string().regex(/^\d{4}\/\d{2}$/),

  allocatedBudget: decimalInput,
  internalBudget: decimalInput.optional().default(0),
  centralBudget: decimalInput.optional().default(0),
  provinceBudget: decimalInput.optional().default(0),

  status: ProjectStatusEnum.optional().default('NOT_STARTED'),
  implantedThrough: ProjectImplantedThroughEnum.optional(),

  companyId: z.string().uuid().optional(),
  userCommitteeId: z.string().uuid().optional(),

  projectManagerId: z.string().uuid().optional(),
  siteInchargeId: z.string().uuid().optional(),
});
