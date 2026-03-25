import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  budgetCode: z.string().min(1),
  fiscalYear: z.string().min(1),
  source: z.string().min(1),
  
  // --- ADD THIS FIELD ---
  implantedThrough: z.enum(['COMPANY', 'USER_COMMITTEE']).optional(), 
  
  allocatedBudget: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  internalBudget: z.union([z.string(), z.number()]).optional().transform((val) => Number(val ?? 0)),
  centralBudget: z.union([z.string(), z.number()]).optional().transform((val) => Number(val ?? 0)),
  provinceBudget: z.union([z.string(), z.number()]).optional().transform((val) => Number(val ?? 0)),
  
  status: z.enum(['NOT_STARTED', 'ONGOING', 'COMPLETED', 'ARCHIVED']).optional(),
  
  // Optional relations
  companyId: z.string().uuid().optional(),
  userCommitteeId: z.string().uuid().optional(),
  projectManagerId: z.string().uuid().optional(),
  siteInchargeId: z.string().uuid().optional(),
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;