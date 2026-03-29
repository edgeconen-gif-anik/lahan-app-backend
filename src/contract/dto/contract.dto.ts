import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ContractStatus } from '@prisma/client';

const AgreementSchema = z.object({
  agreementDate:       z.coerce.date(),
  content:             z.string().min(10, 'Content must be at least 10 chars'),
  amount:              z.number().positive(),
  contractorSignatory: z.string().optional(),
  officeSignatory:     z.string().optional(),
  witnessName:         z.string().optional(),
});

const WorkOrderSchema = z.object({
  workCompletionDate:  z.coerce.date(),
  content:             z.string().min(10, 'Content must be at least 10 chars'),
  contractorSignatory: z.string().optional(),
  officeSignatory:     z.string().optional(),
  witnessName:         z.string().optional(),
});

const CreateContractSchema = z
  .object({
    projectId:       z.string().uuid(),
    companyId:       z.string().uuid().optional(),
    userCommitteeId: z.string().uuid().optional(),
    userID:          z.string().uuid().optional(), // committee representative — matches Prisma field name
    siteInchargeId:  z.string().uuid().optional(), // ✅ NEW: site incharge on the contract
    contractNumber:  z.string().min(1),
    contractAmount:  z.number().positive(),
    status:          z.nativeEnum(ContractStatus).optional(),

    startDate:              z.coerce.date(),
    intendedCompletionDate: z.coerce.date(),
    actualCompletionDate:   z.coerce.date().optional(),

    remarks:   z.string().optional(),
    agreement: AgreementSchema.optional(),
    workOrder: WorkOrderSchema.optional(),
  })

  // Must have either company or committee
  .refine((d) => !!(d.companyId ?? d.userCommitteeId), {
    message: 'Either companyId or userCommitteeId must be provided',
    path: ['companyId'],
  })

  // intendedCompletionDate must be after startDate
  .refine(
    (d) =>
      !d.startDate ||
      !d.intendedCompletionDate ||
      d.intendedCompletionDate > d.startDate,
    {
      message: 'intendedCompletionDate must be after startDate',
      path: ['intendedCompletionDate'],
    },
  )

  // actualCompletionDate must be after startDate (if provided)
  .refine(
    (d) =>
      !d.startDate ||
      !d.actualCompletionDate ||
      d.actualCompletionDate > d.startDate,
    {
      message: 'actualCompletionDate must be after startDate',
      path: ['actualCompletionDate'],
    },
  );

const UpdateContractSchema = z
  .object({
    projectId:       z.string().uuid().optional(),
    companyId:       z.string().uuid().optional(),
    userCommitteeId: z.string().uuid().optional(),
    userID:          z.string().uuid().optional(), // matches Prisma field name (not userId)
    siteInchargeId:  z.string().uuid().optional(), // ✅ NEW: site incharge on the contract
    contractNumber:  z.string().min(1).optional(),
    contractAmount:  z.number().positive().optional(),
    status:          z.nativeEnum(ContractStatus).optional(),

    startDate:              z.coerce.date().optional(),
    intendedCompletionDate: z.coerce.date().optional(),
    actualCompletionDate:   z.coerce.date().optional(),

    remarks:   z.string().optional(),
    agreement: AgreementSchema.partial().optional(),
    workOrder: WorkOrderSchema.partial().optional(),
  })

  // intendedCompletionDate must be after startDate (if both provided)
  .refine(
    (d) =>
      !d.startDate ||
      !d.intendedCompletionDate ||
      d.intendedCompletionDate > d.startDate,
    {
      message: 'intendedCompletionDate must be after startDate',
      path: ['intendedCompletionDate'],
    },
  )

  // actualCompletionDate must be after startDate (if both provided)
  .refine(
    (d) =>
      !d.startDate ||
      !d.actualCompletionDate ||
      d.actualCompletionDate > d.startDate,
    {
      message: 'actualCompletionDate must be after startDate',
      path: ['actualCompletionDate'],
    },
  );

export class CreateContractDto extends createZodDto(CreateContractSchema) {}
export class UpdateContractDto extends createZodDto(UpdateContractSchema) {}
