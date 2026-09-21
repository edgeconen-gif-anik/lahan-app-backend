import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateSystemSettingSchema = z.object({
  officerEffectiveFrom: z.iso.datetime({ offset: true }).optional(),
  officerChangeReason: z.string().trim().min(10).max(2000).optional(),
  currentFiscalYear: z
    .string()
    .regex(/^\d{4}\s*[/-]\s*\d{2,3}$/, 'Must use YYYY/YYY or YYYY/YY format'),
  chiefAdministrativeOfficerName: z.string().trim().optional().nullable(),
  sectionChiefName: z.string().trim().optional().nullable(),
  registrationOfficerName: z.string().trim().optional().nullable(),
  registrationOfficerDesignation: z.string().trim().optional().nullable(),
});

export class UpdateSystemSettingDto extends createZodDto(
  UpdateSystemSettingSchema,
) {}
