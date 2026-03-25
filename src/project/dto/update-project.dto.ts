import { CreateProjectSchema } from './create-project.dto';
import { z } from 'zod';

// We make everything optional for updates
export const UpdateProjectSchema = CreateProjectSchema.partial();

export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;