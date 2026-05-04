import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateSystemSettingSchema = z.object({
  currentFiscalYear: z
    .string()
    .regex(/^\d{4}\s*[/-]\s*\d{2,3}$/, 'Must be format like 2082/083'),
  chiefAdministrativeOfficerName: z.string().trim().optional().nullable(),
  sectionChiefName: z.string().trim().optional().nullable(),
});

export class UpdateSystemSettingDto extends createZodDto(
  UpdateSystemSettingSchema,
) {}
