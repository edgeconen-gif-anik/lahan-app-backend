import { z } from 'zod';

export const ImportProjectRowSchema = z.object({
  name: z.string(),
  type: z.string(),
  sNo: z.union([z.string(), z.number()]).optional(),
  budgetCode: z.string(),
  fiscalYear: z.string(),
  source: z.string(),
  
  // --- ADD THIS FIELD ---
  // CSVs often treat everything as strings, so we accept a string and validate it
  implantedThrough: z.string().optional(), 
  
  // Allow string or number for budgets coming from CSV
  allocatedBudget: z.union([z.string(), z.number()]),
  internalBudget: z.union([z.string(), z.number()]).optional(),
  centralBudget: z.union([z.string(), z.number()]).optional(),
  provinceBudget: z.union([z.string(), z.number()]).optional(),
  
  status: z.enum(['NOT_STARTED', 'ONGOING', 'COMPLETED', 'ARCHIVED']).optional(),
});

export type ImportProjectRowDto = z.infer<typeof ImportProjectRowSchema>;