import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthUser,
  getApprovalStateForSave,
  isAdminUser,
  requireAdminUser,
} from '../auth/auth-user';
import {
  CreateFuelLogDto,
  CreateFuelLogSchema,
  QueryFuelLogDto,
  QueryFuelLogSchema,
  ReviewFuelLogDto,
  ReviewFuelLogSchema,
  UpdateFuelLogDto,
  UpdateFuelLogSchema,
} from './dto/fuel.dto';

const FUEL_LOG_INCLUDE = {
  user: { select: { id: true, name: true, email: true, designation: true } },
  requestedBy: {
    select: { id: true, name: true, email: true, designation: true },
  },
  approvedBy: {
    select: { id: true, name: true, email: true, designation: true },
  },
  project: { select: { id: true, name: true, sNo: true, fiscalYear: true } },
  contract: {
    select: {
      id: true,
      contractNumber: true,
      projectId: true,
      fiscalYear: true,
    },
  },
} satisfies Prisma.FuelLogInclude;

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? null : Number(value);
}

function mapFuelLog(fuelLog: any) {
  return {
    ...fuelLog,
    quantityLiters: toNumber(fuelLog.quantityLiters),
    ratePerLiter: toNumber(fuelLog.ratePerLiter),
    totalAmount: toNumber(fuelLog.totalAmount),
  };
}

function decimal(value: number | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

@Injectable()
export class FuelService {
  constructor(private readonly prisma: PrismaService) {}

  private getVisibilityWhere(user: AuthUser): Prisma.FuelLogWhereInput {
    if (isAdminUser(user)) {
      return {};
    }

    return {
      OR: [{ userId: user.id }, { requestedById: user.id }],
    };
  }

  private resolveUserId(inputUserId: string | undefined, user: AuthUser) {
    if (!inputUserId) {
      return user.id;
    }

    if (isAdminUser(user) || inputUserId === user.id) {
      return inputUserId;
    }

    throw new ForbiddenException(
      'Only admins can submit fuel logs for another user',
    );
  }

  private getTotalAmount(input: {
    quantityLiters: number | Prisma.Decimal;
    ratePerLiter?: number | Prisma.Decimal | null;
    totalAmount?: number | Prisma.Decimal | null;
  }) {
    if (input.totalAmount != null) {
      return decimal(input.totalAmount);
    }

    if (input.ratePerLiter != null) {
      return decimal(input.quantityLiters).mul(decimal(input.ratePerLiter));
    }

    return undefined;
  }

  private async validateProjectAndContract(input: {
    projectId?: string | null;
    contractId?: string | null;
  }) {
    if (!input.projectId && !input.contractId) {
      return;
    }

    const [project, contract] = await Promise.all([
      input.projectId
        ? this.prisma.project.findUnique({
            where: { id: input.projectId },
            select: { id: true },
          })
        : null,
      input.contractId
        ? this.prisma.contract.findUnique({
            where: { id: input.contractId },
            select: { id: true, projectId: true },
          })
        : null,
    ]);

    if (input.projectId && !project) {
      throw new NotFoundException('Project not found');
    }

    if (input.contractId && !contract) {
      throw new NotFoundException('Contract not found');
    }

    if (
      input.projectId &&
      contract?.projectId &&
      contract.projectId !== input.projectId
    ) {
      throw new BadRequestException(
        'Selected contract does not belong to the selected project',
      );
    }
  }

  async create(dto: CreateFuelLogDto, user: AuthUser) {
    const data = CreateFuelLogSchema.parse(dto);
    const userId = this.resolveUserId(data.userId, user);
    await this.validateProjectAndContract(data);

    const quantityLiters = decimal(data.quantityLiters);
    const ratePerLiter =
      data.ratePerLiter == null ? undefined : decimal(data.ratePerLiter);
    const totalAmount = this.getTotalAmount({
      quantityLiters,
      ratePerLiter,
      totalAmount: data.totalAmount,
    });

    try {
      const fuelLog = await this.prisma.fuelLog.create({
        data: {
          userId,
          requestedById: user.id,
          projectId: data.projectId,
          contractId: data.contractId,
          source: data.source,
          fuelType: data.fuelType,
          quantityLiters,
          ratePerLiter,
          totalAmount,
          vehicleNumber: data.vehicleNumber,
          odometerReading: data.odometerReading,
          purpose: data.purpose,
          logDate: data.logDate,
          remarks: data.remarks,
          ...getApprovalStateForSave(user),
          rejectedAt: null,
        },
        include: FUEL_LOG_INCLUDE,
      });

      return mapFuelLog(fuelLog);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException('Fuel log references an invalid record');
      }

      throw error;
    }
  }

  async findAll(query: QueryFuelLogDto, user: AuthUser) {
    const q = QueryFuelLogSchema.parse(query);
    const skip = (q.page - 1) * q.limit;
    const dateWhere: Prisma.DateTimeFilter = {
      ...(q.fromDate && { gte: q.fromDate }),
      ...(q.toDate && { lte: q.toDate }),
    };

    const where: Prisma.FuelLogWhereInput = {
      AND: [
        this.getVisibilityWhere(user),
        q.userId ? { userId: q.userId } : {},
        q.requestedById ? { requestedById: q.requestedById } : {},
        q.projectId ? { projectId: q.projectId } : {},
        q.contractId ? { contractId: q.contractId } : {},
        q.source ? { source: q.source } : {},
        q.fuelType ? { fuelType: q.fuelType } : {},
        q.approvalStatus ? { approvalStatus: q.approvalStatus } : {},
        q.fromDate || q.toDate ? { logDate: dateWhere } : {},
        q.search
          ? {
              OR: [
                { purpose: { contains: q.search, mode: 'insensitive' } },
                { vehicleNumber: { contains: q.search, mode: 'insensitive' } },
                { remarks: { contains: q.search, mode: 'insensitive' } },
                {
                  user: {
                    name: { contains: q.search, mode: 'insensitive' },
                  },
                },
                {
                  project: {
                    name: { contains: q.search, mode: 'insensitive' },
                  },
                },
                {
                  contract: {
                    contractNumber: {
                      contains: q.search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {},
      ],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.fuelLog.findMany({
        where,
        skip,
        take: q.limit,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: FUEL_LOG_INCLUDE,
      }),
      this.prisma.fuelLog.count({ where }),
    ]);

    return {
      data: data.map(mapFuelLog),
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        lastPage: Math.ceil(total / q.limit),
      },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const fuelLog = await this.prisma.fuelLog.findFirst({
      where: { id, AND: [this.getVisibilityWhere(user)] },
      include: FUEL_LOG_INCLUDE,
    });

    if (!fuelLog) {
      throw new NotFoundException('Fuel log not found');
    }

    return mapFuelLog(fuelLog);
  }

  async update(id: string, dto: UpdateFuelLogDto, user: AuthUser) {
    const existing = await this.prisma.fuelLog.findFirst({
      where: { id, AND: [this.getVisibilityWhere(user)] },
      select: {
        id: true,
        userId: true,
        approvalStatus: true,
        quantityLiters: true,
        ratePerLiter: true,
        totalAmount: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Fuel log not found');
    }

    if (
      !isAdminUser(user) &&
      existing.approvalStatus === ApprovalStatus.APPROVED
    ) {
      throw new ForbiddenException(
        'Approved fuel logs can only be changed by admins',
      );
    }

    const data = UpdateFuelLogSchema.parse(dto);
    const userId =
      data.userId === undefined
        ? undefined
        : this.resolveUserId(data.userId, user);

    await this.validateProjectAndContract({
      projectId: data.projectId,
      contractId: data.contractId,
    });

    const quantityLiters =
      data.quantityLiters == null ? undefined : decimal(data.quantityLiters);
    const ratePerLiter =
      data.ratePerLiter == null ? undefined : decimal(data.ratePerLiter);
    const effectiveQuantity = quantityLiters ?? existing.quantityLiters;
    const effectiveRate = ratePerLiter ?? existing.ratePerLiter ?? undefined;
    const shouldRecalculateTotal =
      data.totalAmount != null ||
      data.ratePerLiter != null ||
      data.quantityLiters != null;
    const totalAmount = shouldRecalculateTotal
      ? this.getTotalAmount({
          quantityLiters: effectiveQuantity,
          ratePerLiter: effectiveRate,
          totalAmount: data.totalAmount,
        })
      : undefined;
    const approvalPatch = isAdminUser(user)
      ? {}
      : {
          approvalStatus: ApprovalStatus.PENDING,
          approvedAt: null,
          approvedById: null,
          rejectedAt: null,
        };

    try {
      const fuelLog = await this.prisma.fuelLog.update({
        where: { id },
        data: {
          userId,
          projectId: data.projectId,
          contractId: data.contractId,
          source: data.source,
          fuelType: data.fuelType,
          quantityLiters,
          ratePerLiter,
          totalAmount,
          vehicleNumber: data.vehicleNumber,
          odometerReading: data.odometerReading,
          purpose: data.purpose,
          logDate: data.logDate,
          remarks: data.remarks,
          ...approvalPatch,
        },
        include: FUEL_LOG_INCLUDE,
      });

      return mapFuelLog(fuelLog);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException('Fuel log references an invalid record');
      }

      throw error;
    }
  }

  async approve(id: string, dto: ReviewFuelLogDto, user: AuthUser) {
    requireAdminUser(user);
    const data = ReviewFuelLogSchema.parse(dto ?? {});
    await this.findOne(id, user);

    const fuelLog = await this.prisma.fuelLog.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: user.id,
        rejectedAt: null,
        remarks: data.remarks,
      },
      include: FUEL_LOG_INCLUDE,
    });

    return mapFuelLog(fuelLog);
  }

  async reject(id: string, dto: ReviewFuelLogDto, user: AuthUser) {
    requireAdminUser(user);
    const data = ReviewFuelLogSchema.parse(dto ?? {});
    await this.findOne(id, user);

    const fuelLog = await this.prisma.fuelLog.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedAt: null,
        approvedById: null,
        rejectedAt: new Date(),
        remarks: data.remarks,
      },
      include: FUEL_LOG_INCLUDE,
    });

    return mapFuelLog(fuelLog);
  }

  async remove(id: string, user: AuthUser) {
    requireAdminUser(user);
    await this.findOne(id, user);
    await this.prisma.fuelLog.delete({ where: { id } });
  }
}
