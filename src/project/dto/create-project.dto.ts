import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional(),
);

const optionalUuid = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().uuid().nullable().optional(),
);

const optionalFiscalYear = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
);

const optionalImplantedThrough = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.enum(['COMP', 'COMPANY', 'USER_COMMITTEE']).nullable().optional(),
);

export const CreateProjectSchema = z.object({
  sNo: optionalText,
  name: z.string().min(1),
  type: z.string().min(1),
  budgetCode: z.string().min(1),
  fiscalYear: optionalFiscalYear,
  source: z.string().min(1),

  implantedThrough: optionalImplantedThrough,

  allocatedBudget: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val)),
  internalBudget: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => Number(val ?? 0)),
  centralBudget: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => Number(val ?? 0)),
  provinceBudget: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => Number(val ?? 0)),

  status: z
    .enum(['NOT_STARTED', 'ONGOING', 'COMPLETED', 'ARCHIVED'])
    .optional(),

  // Optional relations
  companyId: optionalUuid,
  userCommitteeId: optionalUuid,
  projectManagerId: optionalUuid,
  siteInchargeId: optionalUuid,
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
