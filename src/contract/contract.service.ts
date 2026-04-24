// ─────────────────────────────────────────────────────────────────────────────
// src/contract/contract.service.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContractDto,
  ProjectUpdateDto,
  UpdateContractDto,
} from './dto/contract.dto';
import { ApprovalStatus, ContractStatus, Prisma } from '@prisma/client';
import {
  AuthUser,
  getApprovalStateForSave,
  getApprovalVisibilityWhere,
  isAdminUser,
  requireAdminUser,
} from '../auth/auth-user';

const MILESTONE_ORDER: ContractStatus[] = [
  ContractStatus.NOT_STARTED,
  ContractStatus.AGREEMENT,
  ContractStatus.WORKORDER,
  ContractStatus.WORKINPROGRESS,
  ContractStatus.COMPLETED,
];

const CONTRACT_INCLUDE = {
  project: {
    select: {
      id:   true,
      name: true,
      sNo:  true,
      // Site incharge inherited from the project level
      siteIncharge: {
        select: { id: true, name: true, designation: true },
      },
    },
  },
  // ✅ Site incharge stored directly on the contract
  siteIncharge:  { select: { id: true, name: true, designation: true } },
  company:       { select: { id: true, name: true, panNumber: true } },
  userCommittee: { select: { id: true, name: true } },
  user:          { select: { id: true, name: true, designation: true } },
  agreement:     true,
  workOrder:     true,
} satisfies Prisma.ContractInclude;

// ── Nepali fiscal year helpers ────────────────────────────────────────────────
//
// The Nepali fiscal year runs Shrawan 1 → Ashad 31 (roughly mid-July → mid-July).
// We approximate using the AD calendar: if the current month is July (7) or later
// the FY started in the current year; otherwise it started in the previous year.
//
// Format produced:  CNT-{fyStart}-{fyEndTwoDigit}-{zeroPaddedSeq}
// Example:          CNT-2081-82-0007
//
// The sequence is scoped to the fiscal year — it resets to 0001 each new FY.
// The backend counts existing contracts whose contractNumber starts with the
// current FY prefix, so the count is always accurate regardless of gaps or
// manual overrides (which use a completely different format).
function getFiscalYearSequenceWindow(
  prefixLabel: string,
  referenceDate: Date = new Date(),
): {
  start: Date;
  end: Date;
  prefix: string;
} {
  const now   = referenceDate;
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  // ❶ FY BOUNDARY MONTH
  // Nepal: Shrawan 1 ≈ July 16, so >= 7 (July) is safe.
  const fyStartYear = month >= 7 ? year : year - 1;
  const fyEndYear   = fyStartYear + 1;

  // ❷ DATE RANGE USED FOR COUNTING — July 1 → June 30
  const start = new Date(fyStartYear, 6, 1);  // 6 = July (0-indexed)
  const end   = new Date(fyEndYear,   5, 30); // 5 = June

  // ❸ AD → BS YEAR CONVERSION
  // BS is ahead of AD by 56 or 57 years depending on the time of year.
  const bsStartYear   = fyStartYear + (month >= 4 ? 57 : 56);
  const bsEndTwoDigit = String(bsStartYear + 1).slice(-2);

  // ❹ PREFIX FORMAT → "CNT-2081-82-"
  const prefix = `${prefixLabel}-${bsStartYear}-${bsEndTwoDigit}-`;

  return { start, end, prefix };
}

function normalizeFiscalYearPrefix(input?: string | null): {
  startYear: string;
  endYearTwoDigit: string;
} | null {
  if (!input?.trim()) {
    return null;
  }

  const match = input.trim().match(/^(\d{2,4})\s*[-/]\s*(\d{2,4})$/);
  if (!match) {
    return null;
  }

  const [, startRaw, endRaw] = match;
  let startYear: string;

  if (startRaw.length === 4) {
    startYear = startRaw;
  } else if (startRaw.length === 3) {
    startYear = `2${startRaw}`;
  } else {
    startYear = `20${startRaw}`;
  }

  const endYearTwoDigit = endRaw.slice(-2);

  if (!/^\d{4}$/.test(startYear) || !/^\d{2}$/.test(endYearTwoDigit)) {
    return null;
  }

  return {
    startYear,
    endYearTwoDigit,
  };
}

function buildSequencePrefix(
  prefixLabel: string,
  fiscalYear?: string | null,
  referenceDate: Date = new Date(),
) {
  const normalizedFiscalYear = normalizeFiscalYearPrefix(fiscalYear);
  if (normalizedFiscalYear) {
    return `${prefixLabel}-${normalizedFiscalYear.startYear}-${normalizedFiscalYear.endYearTwoDigit}-`;
  }

  return getFiscalYearSequenceWindow(prefixLabel, referenceDate).prefix;
}

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) {}

  private validateMilestoneChange(input: {
    currentStatus: ContractStatus;
    nextStatus: ContractStatus;
    hasAgreement: boolean;
    hasWorkOrder: boolean;
    hasActualCompletionDate: boolean;
    hasFinalEvaluatedAmount: boolean;
  }) {
    const {
      currentStatus,
      nextStatus,
      hasAgreement,
      hasWorkOrder,
      hasActualCompletionDate,
      hasFinalEvaluatedAmount,
    } = input;

    if (currentStatus === nextStatus) {
      return;
    }

    if (currentStatus === ContractStatus.ARCHIVED) {
      throw new BadRequestException(
        'Archived contracts cannot move to another milestone',
      );
    }

    if (nextStatus === ContractStatus.ARCHIVED) {
      return;
    }

    const currentIndex = MILESTONE_ORDER.indexOf(currentStatus);
    const nextIndex = MILESTONE_ORDER.indexOf(nextStatus);

    if (currentIndex === -1 || nextIndex === -1) {
      throw new BadRequestException('Unsupported contract milestone status');
    }

    if (nextIndex < currentIndex) {
      throw new BadRequestException('Contract milestone cannot move backwards');
    }

    if (nextIndex >= MILESTONE_ORDER.indexOf(ContractStatus.AGREEMENT) && !hasAgreement) {
      throw new BadRequestException(
        'Agreement details are required for AGREEMENT milestone or later',
      );
    }

    if (nextIndex >= MILESTONE_ORDER.indexOf(ContractStatus.WORKORDER) && !hasWorkOrder) {
      throw new BadRequestException(
        'Work order details are required for WORKORDER milestone or later',
      );
    }

    if (nextStatus === ContractStatus.COMPLETED && !hasActualCompletionDate) {
      throw new BadRequestException(
        'actualCompletionDate is required when marking a contract as COMPLETED',
      );
    }

    if (nextStatus === ContractStatus.COMPLETED && !hasFinalEvaluatedAmount) {
      throw new BadRequestException(
        'finalEvaluatedAmount is required when marking a contract as COMPLETED',
      );
    }
  }

  private ensureProjectUpdateAccess(
    contract: {
      siteInchargeId: string | null;
      userID: string | null;
    },
    user: AuthUser,
  ) {
    if (isAdminUser(user)) {
      return;
    }

    if (contract.siteInchargeId === user.id || contract.userID === user.id) {
      return;
    }

    throw new ForbiddenException(
      'Only the assigned site incharge or an admin can submit a project update',
    );
  }

  private getFinalEvaluatedAmountPatch(value?: number) {
    if (value == null) {
      return undefined;
    }

    return new Prisma.Decimal(value);
  }

  private isUniqueConstraintErrorForField(error: unknown, field: string) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    return Array.isArray(target) && target.includes(field);
  }

  private async getNextCompletionCode(referenceDate: Date) {
    const { prefix } = getFiscalYearSequenceWindow('CCR', referenceDate);
    const count = await this.prisma.contract.count({
      where: {
        completionCode: { startsWith: prefix },
      },
    });

    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  private getApprovalPatchForUpdate(
    existingContract: {
      approvalStatus: ApprovalStatus;
      approvedAt: Date | null;
    },
    user: AuthUser,
    preserveApproval: boolean,
  ) {
    if (
      preserveApproval ||
      (isAdminUser(user) &&
        existingContract.approvalStatus === ApprovalStatus.APPROVED)
    ) {
      return {
        approvalStatus: existingContract.approvalStatus,
        approvedAt:
          existingContract.approvalStatus === ApprovalStatus.APPROVED
            ? existingContract.approvedAt ?? new Date()
            : existingContract.approvedAt,
      };
    }

    return getApprovalStateForSave(user);
  }

  // ── Generate next sequential contract number ──────────────────────────────
  // Called by GET /contracts/next-number before the form is submitted.
  // Returns { contractNumber: "CNT-2081-82-0007", sequence: 7 }
  //
  // Race-condition note: this is a *suggestion*, not a reservation.
  // If two users submit simultaneously the second will get a P2002
  // ConflictException — the frontend should re-fetch and retry.
  async getNextContractNumber(projectId?: string): Promise<{
    contractNumber: string;
    sequence: number;
  }> {
    let fiscalYear: string | null | undefined;

    if (projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { fiscalYear: true },
      });

      if (!project) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }

      fiscalYear = project.fiscalYear;
    }

    const prefix = buildSequencePrefix('CNT', fiscalYear);

    const count = await this.prisma.contract.count({
      where: {
        contractNumber: { startsWith: prefix },
      },
    });

    const sequence       = count + 1;
    const contractNumber = `${prefix}${String(sequence).padStart(4, '0')}`;
    return { contractNumber, sequence };
  }

  async create(dto: CreateContractDto, user: AuthUser) {
    const { agreement, workOrder, contractAmount, finalEvaluatedAmount, ...rest } = dto;
    const nextStatus = dto.status ?? ContractStatus.NOT_STARTED;
    const actualCompletionDate =
      nextStatus === ContractStatus.COMPLETED
        ? dto.actualCompletionDate ?? new Date()
        : dto.actualCompletionDate;
    const completionCode =
      nextStatus === ContractStatus.COMPLETED
        ? await this.getNextCompletionCode(actualCompletionDate ?? new Date())
        : undefined;

    if (nextStatus !== ContractStatus.NOT_STARTED) {
      requireAdminUser(user, 'Only admins can set an initial contract milestone');
      this.validateMilestoneChange({
        currentStatus: ContractStatus.NOT_STARTED,
        nextStatus,
        hasAgreement: agreement != null,
        hasWorkOrder: workOrder != null,
        hasActualCompletionDate: actualCompletionDate != null,
        hasFinalEvaluatedAmount: dto.finalEvaluatedAmount != null,
      });
    }

    try {
      return await this.prisma.contract.create({
        data: {
          ...rest,
          ...getApprovalStateForSave(user),
          actualCompletionDate,
          completionCode,
          contractAmount: new Prisma.Decimal(contractAmount),
          finalEvaluatedAmount: this.getFinalEvaluatedAmountPatch(
            finalEvaluatedAmount,
          ),
          agreement: agreement
            ? {
                create: {
                  ...agreement,
                  amount: new Prisma.Decimal(agreement.amount),
                },
              }
            : undefined,
          workOrder: workOrder ? { create: workOrder } : undefined,
        },
        include: CONTRACT_INCLUDE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        if (this.isUniqueConstraintErrorForField(error, 'contractNumber')) {
          throw new ConflictException('Contract number already exists');
        }

        if (this.isUniqueConstraintErrorForField(error, 'completionCode')) {
          throw new ConflictException(
            'Could not generate a unique completion code. Please retry.',
          );
        }
      }
      throw error;
    }
  }

  async findAll(params: {
    projectId?:       string;
    companyId?:       string;
    userCommitteeId?: string;
    userId?:          string;
    // Filters by contract's OWN siteInchargeId — not inherited from project.
    // Use GET /contracts?siteInchargeId=<uuid> to list all contracts for a user.
    siteInchargeId?:  string;
  }, user: AuthUser) {
    const {
      projectId,
      companyId,
      userCommitteeId,
      userId,
      siteInchargeId,
    } = params;

    return this.prisma.contract.findMany({
      where: {
        ...getApprovalVisibilityWhere(user),
        ...(projectId       && { projectId }),
        ...(companyId       && { companyId }),
        ...(userCommitteeId && { userCommitteeId }),
        ...(userId          && { userID: userId }),   // schema field is userID
        ...(siteInchargeId  && { siteInchargeId }),   // ✅ direct field on Contract
      },
      include: CONTRACT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, ...getApprovalVisibilityWhere(user) },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, user: AuthUser) {
    const existingContract = await this.prisma.contract.findFirst({
      where: { id, ...getApprovalVisibilityWhere(user) },
      select: {
        id: true,
        projectId: true,
        status: true,
        startDate: true,
        siteInchargeId: true,
        userID: true,
        completionCode: true,
        actualCompletionDate: true,
        finalEvaluatedAmount: true,
        approvalStatus: true,
        approvedAt: true,
        agreement: {
          select: { id: true },
        },
        workOrder: {
          select: { id: true },
        },
      },
    });

    if (!existingContract) {
      throw new NotFoundException(`Contract ${id} not found`);
    }

    const { agreement, workOrder, contractAmount, finalEvaluatedAmount, ...rest } = dto;
    const isStatusUpdate = dto.status !== undefined;
    const nextStatus = dto.status;
    const resolvedActualCompletionDate =
      nextStatus === ContractStatus.COMPLETED
        ? dto.actualCompletionDate ??
          existingContract.actualCompletionDate ??
          new Date()
        : dto.actualCompletionDate;
    const shouldGenerateCompletionCode =
      nextStatus === ContractStatus.COMPLETED &&
      existingContract.completionCode == null;

    if (isStatusUpdate && nextStatus) {
      requireAdminUser(user, 'Only admins can change contract milestone status');

      if (existingContract.approvalStatus !== ApprovalStatus.APPROVED) {
        throw new BadRequestException(
          'Only approved contracts can change milestone status',
        );
      }

      this.validateMilestoneChange({
        currentStatus: existingContract.status,
        nextStatus,
        hasAgreement: existingContract.agreement != null || agreement != null,
        hasWorkOrder: existingContract.workOrder != null || workOrder != null,
        hasActualCompletionDate: resolvedActualCompletionDate != null,
        hasFinalEvaluatedAmount:
          existingContract.finalEvaluatedAmount != null ||
          dto.finalEvaluatedAmount != null,
      });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const completionCode = shouldGenerateCompletionCode
          ? await this.getNextCompletionCode(
              resolvedActualCompletionDate ?? new Date(),
            )
          : undefined;

        return await this.prisma.contract.update({
          where: { id },
          data: {
            ...rest,
            ...this.getApprovalPatchForUpdate(
              existingContract,
              user,
              isStatusUpdate,
            ),
            actualCompletionDate: resolvedActualCompletionDate,
            completionCode,
            contractAmount: contractAmount != null
              ? new Prisma.Decimal(contractAmount)
              : undefined,
            finalEvaluatedAmount: this.getFinalEvaluatedAmountPatch(
              finalEvaluatedAmount,
            ),
            agreement: agreement
              ? {
                  upsert: {
                    create: {
                      ...agreement,
                      content:       agreement.content       ?? '',
                      agreementDate: agreement.agreementDate ?? new Date(),
                      amount:        new Prisma.Decimal(agreement.amount ?? 0),
                    },
                    update: {
                      ...agreement,
                      amount: agreement.amount != null
                        ? new Prisma.Decimal(agreement.amount)
                        : undefined,
                    },
                  },
                }
              : undefined,
            workOrder: workOrder
              ? {
                  upsert: {
                    create: {
                      ...workOrder,
                      content:            workOrder.content            ?? '',
                      workCompletionDate: workOrder.workCompletionDate ?? new Date(),
                    },
                    update: workOrder,
                  },
                }
              : undefined,
          },
          include: CONTRACT_INCLUDE,
        });
      } catch (error) {
        if (
          shouldGenerateCompletionCode &&
          this.isUniqueConstraintErrorForField(error, 'completionCode') &&
          attempt < 2
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException(
      'Could not generate a unique completion code. Please retry.',
    );
  }

  async applyProjectUpdate(id: string, dto: ProjectUpdateDto, user: AuthUser) {
    const existingContract = await this.prisma.contract.findFirst({
      where: { id, ...getApprovalVisibilityWhere(user) },
      select: {
        id: true,
        projectId: true,
        startDate: true,
        status: true,
        approvalStatus: true,
        approvedAt: true,
        siteInchargeId: true,
        userID: true,
        completionCode: true,
      },
    });

    if (!existingContract) {
      throw new NotFoundException(`Contract ${id} not found`);
    }

    if (existingContract.status === ContractStatus.ARCHIVED) {
      throw new BadRequestException('Archived contracts cannot be updated');
    }

    this.ensureProjectUpdateAccess(existingContract, user);

    const actualCompletionDate = dto.actualCompletionDate ?? new Date();

    if (actualCompletionDate <= existingContract.startDate) {
      throw new BadRequestException(
        'actualCompletionDate must be after the contract startDate',
      );
    }

    const shouldGenerateCompletionCode = existingContract.completionCode == null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const completionCode = shouldGenerateCompletionCode
          ? await this.getNextCompletionCode(actualCompletionDate)
          : undefined;

        return await this.prisma.contract.update({
          where: { id },
          data: {
            finalEvaluatedAmount: new Prisma.Decimal(dto.finalEvaluatedAmount),
            actualCompletionDate,
            completionCode,
            status: ContractStatus.COMPLETED,
            approvalStatus: existingContract.approvalStatus,
            approvedAt:
              existingContract.approvalStatus === ApprovalStatus.APPROVED
                ? existingContract.approvedAt ?? new Date()
                : existingContract.approvedAt,
          },
          include: CONTRACT_INCLUDE,
        });
      } catch (error) {
        if (
          shouldGenerateCompletionCode &&
          this.isUniqueConstraintErrorForField(error, 'completionCode') &&
          attempt < 2
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException(
      'Could not generate a unique completion code. Please retry.',
    );
  }

  async approve(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);

    return this.prisma.contract.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
      },
      include: CONTRACT_INCLUDE,
    });
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id, ...getApprovalVisibilityWhere(user) },
      });
      if (!contract) throw new NotFoundException('Contract not found');

      await tx.agreement.deleteMany({ where: { contractId: id } });
      await tx.workOrder.deleteMany({ where: { contractId: id } });

      return tx.contract.delete({ where: { id } });
    });
  }
}
