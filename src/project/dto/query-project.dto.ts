// src/project/dto/query-project.dto.ts
import { z } from 'zod';
import { ProjectStatusEnum } from './project.zod';

export const QueryProjectSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  status: ProjectStatusEnum.optional(),
  fiscalYear: z.string().optional(),
  budgetCode: z.string().optional(),
  
  // 👇 FIX: Added the search property to the schema
  search: z.string().optional(),

  sortBy: z.enum([
    'createdAt',
    'allocatedBudget',
    'name',
    'sNo',
  ]).default('createdAt'),

  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryProjectDto = z.infer<typeof QueryProjectSchema>;