// ─────────────────────────────────────────────────────────────────────────────
// src/contract/contract.service.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';
import { Prisma } from '@prisma/client';

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
function getCurrentFiscalYearAdDates(): {
  start: Date;
  end: Date;
  prefix: string;
} {
  const now   = new Date();
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
  const prefix = `CNT-${bsStartYear}-${bsEndTwoDigit}-`;

  return { start, end, prefix };
}

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Generate next sequential contract number ──────────────────────────────
  // Called by GET /contracts/next-number before the form is submitted.
  // Returns { contractNumber: "CNT-2081-82-0007", sequence: 7 }
  //
  // Race-condition note: this is a *suggestion*, not a reservation.
  // If two users submit simultaneously the second will get a P2002
  // ConflictException — the frontend should re-fetch and retry.
  async getNextContractNumber(): Promise<{
    contractNumber: string;
    sequence: number;
  }> {
    const { start, end, prefix } = getCurrentFiscalYearAdDates();

    const count = await this.prisma.contract.count({
      where: {
        createdAt:      { gte: start, lte: end },
        contractNumber: { startsWith: prefix },
      },
    });

    const sequence       = count + 1;
    const contractNumber = `${prefix}${String(sequence).padStart(4, '0')}`;
    return { contractNumber, sequence };
  }

  async create(dto: CreateContractDto) {
    const { agreement, workOrder, contractAmount, ...rest } = dto;

    try {
      return await this.prisma.contract.create({
        data: {
          ...rest,
          contractAmount: new Prisma.Decimal(contractAmount),
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
        throw new ConflictException('Contract number already exists');
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
  }) {
    const {
      projectId,
      companyId,
      userCommitteeId,
      userId,
      siteInchargeId,
    } = params;

    return this.prisma.contract.findMany({
      where: {
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

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }

  async update(id: string, dto: UpdateContractDto) {
    await this.findOne(id);

    const { agreement, workOrder, contractAmount, ...rest } = dto;

    return this.prisma.contract.update({
      where: { id },
      data: {
        ...rest,
        contractAmount: contractAmount != null
          ? new Prisma.Decimal(contractAmount)
          : undefined,
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
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id } });
      if (!contract) throw new NotFoundException('Contract not found');

      await tx.agreement.deleteMany({ where: { contractId: id } });
      await tx.workOrder.deleteMany({ where: { contractId: id } });

      return tx.contract.delete({ where: { id } });
    });
  }
}